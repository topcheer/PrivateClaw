import 'package:flutter/services.dart';

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
}
