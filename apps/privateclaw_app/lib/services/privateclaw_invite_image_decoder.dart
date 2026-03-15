import 'package:flutter/services.dart';

class PrivateClawInviteCameraCancelled implements Exception {
  const PrivateClawInviteCameraCancelled();
}

class PrivateClawInviteCameraPermissionDenied implements Exception {
  const PrivateClawInviteCameraPermissionDenied();
}

class PrivateClawInviteImageDecoder {
  PrivateClawInviteImageDecoder._();

  static const MethodChannel _channel = MethodChannel(
    'gg.ai.privateclaw/invite_qr_decoder',
  );

  static Future<String?> decodeImage(String path) async {
    try {
      return await _channel.invokeMethod<String>(
        'decodeImage',
        <String, Object>{'path': path},
      );
    } on MissingPluginException {
      throw UnsupportedError(
        'Image QR decoding is unavailable on this platform.',
      );
    } on PlatformException catch (error) {
      throw StateError(error.message ?? error.code);
    }
  }

  static Future<String?> captureInviteFromCamera() async {
    try {
      return await _channel.invokeMethod<String>('captureInviteFromCamera');
    } on MissingPluginException {
      throw UnsupportedError('Native camera QR capture is unavailable here.');
    } on PlatformException catch (error) {
      switch (error.code) {
        case 'cancelled':
          throw const PrivateClawInviteCameraCancelled();
        case 'permission_denied':
          throw const PrivateClawInviteCameraPermissionDenied();
        case 'camera_unavailable':
          throw UnsupportedError(error.message ?? error.code);
        default:
          throw StateError(error.message ?? error.code);
      }
    }
  }
}
