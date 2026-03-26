#ifndef RUNNER_PRIVATECLAW_AUDIO_RECORDER_H_
#define RUNNER_PRIVATECLAW_AUDIO_RECORDER_H_

#include <flutter/encodable_value.h>
#include <flutter/method_channel.h>

#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <windows.h>
#include <mmsystem.h>

class PrivateClawAudioRecorder {
 public:
  explicit PrivateClawAudioRecorder(flutter::BinaryMessenger* messenger);
  ~PrivateClawAudioRecorder();

  PrivateClawAudioRecorder(const PrivateClawAudioRecorder&) = delete;
  PrivateClawAudioRecorder& operator=(const PrivateClawAudioRecorder&) = delete;

 private:
  struct AudioBuffer {
    std::vector<char> data;
    WAVEHDR header{};
  };

  using MethodCall = flutter::MethodCall<flutter::EncodableValue>;
  using MethodResult = flutter::MethodResult<flutter::EncodableValue>;

  static DWORD WINAPI CaptureThreadProc(LPVOID param);

  void HandleMethodCall(
      const MethodCall& call,
      std::unique_ptr<MethodResult> result);
  void StartRecording(std::unique_ptr<MethodResult> result);
  void StopRecording(bool discard, std::unique_ptr<MethodResult> result);
  void ProcessCompletedBuffers(bool allow_requeue);
  DWORD RunCaptureLoop();
  void ResetStateLocked();

  std::wstring BuildRecordingPath() const;
  bool WriteWaveFile(const std::wstring& output_path,
                     const std::vector<uint8_t>& pcm_bytes,
                     const WAVEFORMATEX& format) const;
  std::string WaveErrorMessage(MMRESULT result) const;

  std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>> channel_;

  std::mutex state_mutex_;
  HWAVEIN wave_in_ = nullptr;
  HANDLE audio_event_ = nullptr;
  HANDLE stop_event_ = nullptr;
  HANDLE capture_thread_ = nullptr;
  std::vector<AudioBuffer> buffers_;
  std::vector<uint8_t> recorded_bytes_;
  WAVEFORMATEX format_{};
  std::chrono::steady_clock::time_point started_at_{};
  bool is_recording_ = false;
  std::string last_recording_error_;
};

#endif  // RUNNER_PRIVATECLAW_AUDIO_RECORDER_H_
