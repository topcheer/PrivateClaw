import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/services/privateclaw_audio_recorder.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const MethodChannel channel = MethodChannel(
    'gg.ai.privateclaw/audio_recorder',
  );

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('startRecording maps permission denial to a typed exception', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall call) async {
          throw PlatformException(
            code: 'permission_denied',
            message: 'Microphone access is required.',
          );
        });

    expect(
      PrivateClawAudioRecorder.startRecording,
      throwsA(isA<PrivateClawAudioRecorderPermissionDenied>()),
    );
  });

  test('stopRecording returns the recorded audio payload', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall call) async {
          expect(call.method, 'stopRecording');
          return <String, Object>{
            'path': '/tmp/voice-note.m4a',
            'mimeType': 'audio/mp4',
          };
        });

    final PrivateClawRecordedAudio? recordedAudio =
        await PrivateClawAudioRecorder.stopRecording();
    expect(recordedAudio, isNotNull);
    expect(recordedAudio!.path, '/tmp/voice-note.m4a');
    expect(recordedAudio.mimeType, 'audio/mp4');
  });
}
