package gg.ai.privateclaw

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : FlutterActivity() {
    companion object {
        private const val AUDIO_RECORDER_CHANNEL = "gg.ai.privateclaw/audio_recorder"
        private const val RECORD_AUDIO_PERMISSION_REQUEST_CODE = 6101
        private const val MIN_RECORDING_DURATION_MS = 300L
        private const val RECORDED_AUDIO_MIME_TYPE = "audio/mp4"
    }

    private var audioRecorderChannel: MethodChannel? = null
    private var mediaRecorder: MediaRecorder? = null
    private var activeRecordingFile: File? = null
    private var activeRecordingStartedAtMs: Long? = null
    private var pendingMicrophonePermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        audioRecorderChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            AUDIO_RECORDER_CHANNEL,
        )
        audioRecorderChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startRecording" -> startRecording(result)
                "stopRecording" -> stopRecording(result, discard = false)
                "cancelRecording" -> stopRecording(result, discard = true)
                else -> result.notImplemented()
            }
        }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        audioRecorderChannel?.setMethodCallHandler(null)
        audioRecorderChannel = null
        cancelActiveRecording()
        super.cleanUpFlutterEngine(flutterEngine)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != RECORD_AUDIO_PERMISSION_REQUEST_CODE) {
            return
        }

        val pendingResult = pendingMicrophonePermissionResult ?: return
        pendingMicrophonePermissionResult = null
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startRecordingNow(pendingResult)
            return
        }

        pendingResult.error(
            "permission_denied",
            "Microphone permission is required to record voice messages.",
            null,
        )
    }

    private fun startRecording(result: MethodChannel.Result) {
        if (mediaRecorder != null) {
            result.error("busy", "A voice recording is already in progress.", null)
            return
        }
        if (pendingMicrophonePermissionResult != null) {
            result.error("busy", "A microphone permission request is already in progress.", null)
            return
        }

        val permissionState = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        )
        if (permissionState == PackageManager.PERMISSION_GRANTED) {
            startRecordingNow(result)
            return
        }

        pendingMicrophonePermissionResult = result
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            RECORD_AUDIO_PERMISSION_REQUEST_CODE,
        )
    }

    private fun startRecordingNow(result: MethodChannel.Result) {
        val recordingsDirectory = File(cacheDir, "privateclaw-recordings")
        if (!recordingsDirectory.exists() && !recordingsDirectory.mkdirs()) {
            result.error(
                "recorder_unavailable",
                "Unable to create a temporary directory for voice recordings.",
                null,
            )
            return
        }

        val fileName = "voice-note-${timestampForFileName()}.m4a"
        val outputFile = File(recordingsDirectory, fileName)
        val recorder = MediaRecorder()
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioEncodingBitRate(64_000)
            recorder.setAudioSamplingRate(44_100)
            recorder.setOutputFile(outputFile.absolutePath)
            recorder.prepare()
            recorder.start()
        } catch (error: Exception) {
            recorder.reset()
            recorder.release()
            outputFile.delete()
            result.error(
                "recorder_unavailable",
                error.localizedMessage ?: "Unable to start the voice recorder.",
                null,
            )
            return
        }

        mediaRecorder = recorder
        activeRecordingFile = outputFile
        activeRecordingStartedAtMs = SystemClock.elapsedRealtime()
        result.success(null)
    }

    private fun stopRecording(result: MethodChannel.Result, discard: Boolean) {
        val recorder = mediaRecorder
        val outputFile = activeRecordingFile
        val startedAtMs = activeRecordingStartedAtMs

        mediaRecorder = null
        activeRecordingFile = null
        activeRecordingStartedAtMs = null

        if (recorder == null) {
            if (discard) {
                result.success(null)
                return
            }
            result.error("not_recording", "No voice recording is active.", null)
            return
        }

        var errorCode: String? = null
        var errorMessage: String? = null
        var shouldDeleteFile = discard

        try {
            recorder.stop()
        } catch (error: RuntimeException) {
            shouldDeleteFile = true
            errorCode = "recording_failed"
            errorMessage = error.localizedMessage ?: "Unable to finish the voice recording."
        } finally {
            recorder.reset()
            recorder.release()
        }

        if (outputFile == null) {
            if (discard) {
                result.success(null)
                return
            }
            result.error(
                errorCode ?: "recording_failed",
                errorMessage ?: "Voice recording output is unavailable.",
                null,
            )
            return
        }

        val durationMs = if (startedAtMs == null) 0L else {
            SystemClock.elapsedRealtime() - startedAtMs
        }
        if (!shouldDeleteFile &&
            (durationMs < MIN_RECORDING_DURATION_MS || outputFile.length() <= 0L)
        ) {
            shouldDeleteFile = true
            errorCode = "recording_too_short"
            errorMessage = "Hold to record a little longer before releasing."
        }

        if (shouldDeleteFile && outputFile.exists()) {
            outputFile.delete()
        }
        if (discard) {
            result.success(null)
            return
        }
        if (errorCode != null) {
            result.error(errorCode, errorMessage, null)
            return
        }

        result.success(
            mapOf(
                "path" to outputFile.absolutePath,
                "mimeType" to RECORDED_AUDIO_MIME_TYPE,
            ),
        )
    }

    private fun cancelActiveRecording() {
        val recorder = mediaRecorder ?: return
        val outputFile = activeRecordingFile
        mediaRecorder = null
        activeRecordingFile = null
        activeRecordingStartedAtMs = null
        try {
            recorder.stop()
        } catch (_: RuntimeException) {
            // Best effort only during engine cleanup.
        } finally {
            recorder.reset()
            recorder.release()
        }
        if (outputFile != null && outputFile.exists()) {
            outputFile.delete()
        }
    }

    private fun timestampForFileName(): String {
        return SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    }
}
