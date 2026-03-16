import 'package:flutter/services.dart';

class PrivateClawAudioRecorderPermissionDenied implements Exception {
  const PrivateClawAudioRecorderPermissionDenied();
}

class PrivateClawAudioRecorderTooShort implements Exception {
  const PrivateClawAudioRecorderTooShort();
}

class PrivateClawRecordedAudio {
  const PrivateClawRecordedAudio({required this.path, required this.mimeType});

  final String path;
  final String mimeType;
}

class PrivateClawAudioRecorder {
  PrivateClawAudioRecorder._();

  static const MethodChannel _channel = MethodChannel(
    'gg.ai.privateclaw/audio_recorder',
  );

  static Future<void> startRecording() async {
    try {
      await _channel.invokeMethod<void>('startRecording');
    } on MissingPluginException {
      throw UnsupportedError(
        'Voice recording is unavailable on this platform.',
      );
    } on PlatformException catch (error) {
      switch (error.code) {
        case 'permission_denied':
          throw const PrivateClawAudioRecorderPermissionDenied();
        default:
          throw StateError(error.message ?? error.code);
      }
    }
  }

  static Future<PrivateClawRecordedAudio?> stopRecording({
    bool discard = false,
  }) async {
    try {
      final Map<Object?, Object?>? payload = await _channel
          .invokeMapMethod<Object?, Object?>(
            discard ? 'cancelRecording' : 'stopRecording',
          );
      if (payload == null) {
        return null;
      }

      final String? path = payload['path'] as String?;
      final String? mimeType = payload['mimeType'] as String?;
      if (path == null ||
          path.isEmpty ||
          mimeType == null ||
          mimeType.isEmpty) {
        throw const FormatException('Recorded audio payload is incomplete.');
      }

      return PrivateClawRecordedAudio(path: path, mimeType: mimeType);
    } on MissingPluginException {
      throw UnsupportedError(
        'Voice recording is unavailable on this platform.',
      );
    } on PlatformException catch (error) {
      switch (error.code) {
        case 'permission_denied':
          throw const PrivateClawAudioRecorderPermissionDenied();
        case 'recording_too_short':
          throw const PrivateClawAudioRecorderTooShort();
        default:
          throw StateError(error.message ?? error.code);
      }
    }
  }
}
