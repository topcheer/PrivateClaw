#include "privateclaw_audio_recorder.h"

#include <flutter/standard_method_codec.h>

#include <array>
#include <chrono>
#include <cstdint>
#include <cwchar>
#include <string>
#include <vector>

#include "utils.h"

namespace {

constexpr char kAudioRecorderChannelName[] = "gg.ai.privateclaw/audio_recorder";
constexpr size_t kAudioBufferCount = 4;
constexpr size_t kAudioBufferSizeBytes = 16 * 1024;
constexpr WORD kAudioChannelCount = 1;
constexpr DWORD kAudioSampleRate = 44100;
constexpr WORD kAudioBitsPerSample = 16;
constexpr double kMinimumVoiceRecordingDurationSeconds = 0.3;

bool WriteAll(HANDLE file, const void* data, DWORD size) {
  const auto* cursor = static_cast<const uint8_t*>(data);
  DWORD remaining = size;
  while (remaining > 0) {
    DWORD written = 0;
    if (!::WriteFile(file, cursor, remaining, &written, nullptr)) {
      return false;
    }
    if (written == 0) {
      return false;
    }
    cursor += written;
    remaining -= written;
  }
  return true;
}

bool WriteUint16(HANDLE file, uint16_t value) {
  return WriteAll(file, &value, sizeof(value));
}

bool WriteUint32(HANDLE file, uint32_t value) {
  return WriteAll(file, &value, sizeof(value));
}

}  // namespace

PrivateClawAudioRecorder::PrivateClawAudioRecorder(
    flutter::BinaryMessenger* messenger)
    : channel_(std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
          messenger,
          kAudioRecorderChannelName,
          &flutter::StandardMethodCodec::GetInstance())) {
  channel_->SetMethodCallHandler(
      [this](const MethodCall& call, auto result) {
        HandleMethodCall(call, std::move(result));
      });
}

PrivateClawAudioRecorder::~PrivateClawAudioRecorder() {
  std::unique_ptr<MethodResult> unused_result;
  StopRecording(true, std::move(unused_result));
}

DWORD WINAPI PrivateClawAudioRecorder::CaptureThreadProc(LPVOID param) {
  auto* recorder = reinterpret_cast<PrivateClawAudioRecorder*>(param);
  if (recorder == nullptr) {
    return 0;
  }
  return recorder->RunCaptureLoop();
}

void PrivateClawAudioRecorder::HandleMethodCall(
    const MethodCall& call,
    std::unique_ptr<MethodResult> result) {
  if (call.method_name() == "startRecording") {
    StartRecording(std::move(result));
    return;
  }
  if (call.method_name() == "stopRecording") {
    StopRecording(false, std::move(result));
    return;
  }
  if (call.method_name() == "cancelRecording") {
    StopRecording(true, std::move(result));
    return;
  }
  result->NotImplemented();
}

void PrivateClawAudioRecorder::StartRecording(
    std::unique_ptr<MethodResult> result) {
  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    if (wave_in_ != nullptr || is_recording_) {
      result->Error("busy", "A voice recording is already in progress.");
      return;
    }
  }

  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kAudioChannelCount;
  format.nSamplesPerSec = kAudioSampleRate;
  format.wBitsPerSample = kAudioBitsPerSample;
  format.nBlockAlign = static_cast<WORD>(
      (format.nChannels * format.wBitsPerSample) / 8);
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
  format.cbSize = 0;

  HANDLE audio_event = ::CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (audio_event == nullptr) {
    result->Error("recorder_unavailable",
                  "Unable to create the Windows audio capture event.");
    return;
  }

  HANDLE stop_event = ::CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (stop_event == nullptr) {
    ::CloseHandle(audio_event);
    result->Error("recorder_unavailable",
                  "Unable to create the Windows audio stop event.");
    return;
  }

  HWAVEIN wave_in = nullptr;
  const MMRESULT open_result =
      ::waveInOpen(&wave_in, WAVE_MAPPER, &format,
                   reinterpret_cast<DWORD_PTR>(audio_event), 0,
                   CALLBACK_EVENT);
  if (open_result != MMSYSERR_NOERROR) {
    ::CloseHandle(stop_event);
    ::CloseHandle(audio_event);
    result->Error("recorder_unavailable", WaveErrorMessage(open_result));
    return;
  }

  std::vector<AudioBuffer> buffers(kAudioBufferCount);
  size_t prepared_count = 0;
  bool add_failed = false;
  MMRESULT add_failure = MMSYSERR_NOERROR;
  for (size_t i = 0; i < buffers.size(); ++i) {
    AudioBuffer& buffer = buffers[i];
    buffer.data.resize(kAudioBufferSizeBytes);
    buffer.header.lpData = buffer.data.data();
    buffer.header.dwBufferLength = static_cast<DWORD>(buffer.data.size());
    const MMRESULT prepare_result =
        ::waveInPrepareHeader(wave_in, &buffer.header, sizeof(WAVEHDR));
    if (prepare_result != MMSYSERR_NOERROR) {
      add_failed = true;
      add_failure = prepare_result;
      break;
    }
    ++prepared_count;
    const MMRESULT add_result =
        ::waveInAddBuffer(wave_in, &buffer.header, sizeof(WAVEHDR));
    if (add_result != MMSYSERR_NOERROR) {
      add_failed = true;
      add_failure = add_result;
      break;
    }
  }

  if (add_failed) {
    ::waveInReset(wave_in);
    for (size_t i = 0; i < prepared_count; ++i) {
      ::waveInUnprepareHeader(wave_in, &buffers[i].header, sizeof(WAVEHDR));
    }
    ::waveInClose(wave_in);
    ::CloseHandle(stop_event);
    ::CloseHandle(audio_event);
    result->Error("recorder_unavailable", WaveErrorMessage(add_failure));
    return;
  }

  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    wave_in_ = wave_in;
    audio_event_ = audio_event;
    stop_event_ = stop_event;
    capture_thread_ = nullptr;
    buffers_ = std::move(buffers);
    recorded_bytes_.clear();
    format_ = format;
    started_at_ = std::chrono::steady_clock::now();
    is_recording_ = true;
    last_recording_error_.clear();
  }

  HANDLE capture_thread =
      ::CreateThread(nullptr, 0, CaptureThreadProc, this, 0, nullptr);
  if (capture_thread == nullptr) {
    std::unique_ptr<MethodResult> cleanup_result;
    StopRecording(true, std::move(cleanup_result));
    result->Error("recorder_unavailable",
                  "Unable to create the Windows audio capture thread.");
    return;
  }

  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    capture_thread_ = capture_thread;
  }

  const MMRESULT start_result = ::waveInStart(wave_in);
  if (start_result != MMSYSERR_NOERROR) {
    std::unique_ptr<MethodResult> cleanup_result;
    StopRecording(true, std::move(cleanup_result));
    result->Error("recorder_unavailable", WaveErrorMessage(start_result));
    return;
  }

  result->Success(flutter::EncodableValue());
}

void PrivateClawAudioRecorder::StopRecording(
    bool discard,
    std::unique_ptr<MethodResult> result) {
  HWAVEIN wave_in = nullptr;
  HANDLE audio_event = nullptr;
  HANDLE stop_event = nullptr;
  HANDLE capture_thread = nullptr;
  std::vector<AudioBuffer> buffers;
  std::vector<uint8_t> recorded_bytes;
  WAVEFORMATEX format{};
  std::chrono::steady_clock::time_point started_at{};
  std::string last_recording_error;

  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    if (wave_in_ == nullptr) {
      if (result != nullptr) {
        if (discard) {
          result->Success(flutter::EncodableValue());
        } else {
          result->Error("not_recording", "No voice recording is active.");
        }
      }
      return;
    }
    is_recording_ = false;
    wave_in = wave_in_;
    audio_event = audio_event_;
    stop_event = stop_event_;
    capture_thread = capture_thread_;
  }

  ::waveInStop(wave_in);
  ::waveInReset(wave_in);
  if (stop_event != nullptr) {
    ::SetEvent(stop_event);
  }
  if (capture_thread != nullptr) {
    ::WaitForSingleObject(capture_thread, INFINITE);
  }

  ProcessCompletedBuffers(false);

  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    buffers = std::move(buffers_);
    recorded_bytes = std::move(recorded_bytes_);
    format = format_;
    started_at = started_at_;
    last_recording_error = last_recording_error_;
    ResetStateLocked();
  }

  for (auto& buffer : buffers) {
    ::waveInUnprepareHeader(wave_in, &buffer.header, sizeof(WAVEHDR));
  }
  ::waveInClose(wave_in);
  if (capture_thread != nullptr) {
    ::CloseHandle(capture_thread);
  }
  if (stop_event != nullptr) {
    ::CloseHandle(stop_event);
  }
  if (audio_event != nullptr) {
    ::CloseHandle(audio_event);
  }

  if (result == nullptr) {
    return;
  }
  if (discard) {
    result->Success(flutter::EncodableValue());
    return;
  }

  const auto now = std::chrono::steady_clock::now();
  const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      now - started_at);
  const double duration_seconds = elapsed.count() / 1000.0;
  if (duration_seconds < kMinimumVoiceRecordingDurationSeconds ||
      recorded_bytes.empty()) {
    result->Error("recording_too_short",
                  "Hold to record a little longer before releasing.");
    return;
  }

  const std::wstring output_path = BuildRecordingPath();
  if (output_path.empty()) {
    result->Error("recording_failed",
                  "Unable to prepare the Windows recording output path.");
    return;
  }
  if (!WriteWaveFile(output_path, recorded_bytes, format)) {
    ::DeleteFileW(output_path.c_str());
    if (!last_recording_error.empty()) {
      result->Error("recording_failed", last_recording_error);
    } else {
      result->Error("recording_failed",
                    "Unable to save the recorded Windows audio file.");
    }
    return;
  }

  flutter::EncodableMap payload;
  payload[flutter::EncodableValue("path")] =
      flutter::EncodableValue(Utf8FromUtf16(output_path.c_str()));
  payload[flutter::EncodableValue("mimeType")] =
      flutter::EncodableValue("audio/wav");
  result->Success(flutter::EncodableValue(payload));
}

void PrivateClawAudioRecorder::ProcessCompletedBuffers(bool allow_requeue) {
  std::lock_guard<std::mutex> lock(state_mutex_);
  if (wave_in_ == nullptr) {
    return;
  }

  for (auto& buffer : buffers_) {
    if ((buffer.header.dwFlags & WHDR_DONE) == 0) {
      continue;
    }

    if (buffer.header.dwBytesRecorded > 0) {
      const auto* begin =
          reinterpret_cast<const uint8_t*>(buffer.header.lpData);
      const auto* end =
          begin + static_cast<size_t>(buffer.header.dwBytesRecorded);
      recorded_bytes_.insert(recorded_bytes_.end(), begin, end);
    }

    buffer.header.dwBytesRecorded = 0;
    buffer.header.dwFlags &= ~WHDR_DONE;

    if (allow_requeue && is_recording_) {
      const MMRESULT add_result =
          ::waveInAddBuffer(wave_in_, &buffer.header, sizeof(WAVEHDR));
      if (add_result != MMSYSERR_NOERROR) {
        is_recording_ = false;
        last_recording_error_ = WaveErrorMessage(add_result);
      }
    }
  }
}

DWORD PrivateClawAudioRecorder::RunCaptureLoop() {
  HANDLE audio_event = nullptr;
  HANDLE stop_event = nullptr;
  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    audio_event = audio_event_;
    stop_event = stop_event_;
  }
  if (audio_event == nullptr || stop_event == nullptr) {
    return 0;
  }

  HANDLE wait_handles[] = {audio_event, stop_event};
  while (true) {
    const DWORD wait_result =
        ::WaitForMultipleObjects(2, wait_handles, FALSE, INFINITE);
    if (wait_result == WAIT_OBJECT_0) {
      ProcessCompletedBuffers(true);
      continue;
    }
    break;
  }
  return 0;
}

void PrivateClawAudioRecorder::ResetStateLocked() {
  wave_in_ = nullptr;
  audio_event_ = nullptr;
  stop_event_ = nullptr;
  capture_thread_ = nullptr;
  buffers_.clear();
  recorded_bytes_.clear();
  format_ = WAVEFORMATEX{};
  started_at_ = std::chrono::steady_clock::time_point{};
  is_recording_ = false;
  last_recording_error_.clear();
}

std::wstring PrivateClawAudioRecorder::BuildRecordingPath() const {
  std::array<wchar_t, MAX_PATH> temp_path{};
  const DWORD length =
      ::GetTempPathW(static_cast<DWORD>(temp_path.size()), temp_path.data());
  if (length == 0 || length >= temp_path.size()) {
    return L"";
  }

  std::wstring directory(temp_path.data(), length);
  if (!directory.empty() &&
      directory.back() != L'\\' &&
      directory.back() != L'/') {
    directory.push_back(L'\\');
  }
  directory.append(L"privateclaw-recordings");

  const BOOL created = ::CreateDirectoryW(directory.c_str(), nullptr);
  if (created == 0 && ::GetLastError() != ERROR_ALREADY_EXISTS) {
    return L"";
  }

  SYSTEMTIME local_time{};
  ::GetLocalTime(&local_time);
  wchar_t filename[96];
  const int written = std::swprintf(
      filename, std::size(filename),
      L"voice-note-%04u%02u%02u-%02u%02u%02u.wav", local_time.wYear,
      local_time.wMonth, local_time.wDay, local_time.wHour,
      local_time.wMinute, local_time.wSecond);
  if (written <= 0) {
    return L"";
  }

  return directory + L"\\" + filename;
}

bool PrivateClawAudioRecorder::WriteWaveFile(
    const std::wstring& output_path,
    const std::vector<uint8_t>& pcm_bytes,
    const WAVEFORMATEX& format) const {
  HANDLE file = ::CreateFileW(output_path.c_str(), GENERIC_WRITE, 0, nullptr,
                              CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }

  const uint32_t data_size = static_cast<uint32_t>(pcm_bytes.size());
  const uint32_t riff_size = 36 + data_size;
  bool ok = WriteAll(file, "RIFF", 4) &&
            WriteUint32(file, riff_size) &&
            WriteAll(file, "WAVE", 4) &&
            WriteAll(file, "fmt ", 4) &&
            WriteUint32(file, 16) &&
            WriteUint16(file, format.wFormatTag) &&
            WriteUint16(file, format.nChannels) &&
            WriteUint32(file, format.nSamplesPerSec) &&
            WriteUint32(file, format.nAvgBytesPerSec) &&
            WriteUint16(file, format.nBlockAlign) &&
            WriteUint16(file, format.wBitsPerSample) &&
            WriteAll(file, "data", 4) &&
            WriteUint32(file, data_size) &&
            WriteAll(file, pcm_bytes.data(), data_size);

  ::CloseHandle(file);
  return ok;
}

std::string PrivateClawAudioRecorder::WaveErrorMessage(MMRESULT result) const {
  std::array<wchar_t, MAXERRORLENGTH> buffer{};
  if (::waveInGetErrorTextW(result, buffer.data(),
                            static_cast<UINT>(buffer.size())) !=
      MMSYSERR_NOERROR) {
    return "Windows microphone access is unavailable.";
  }
  return Utf8FromUtf16(buffer.data());
}
