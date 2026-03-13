import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';

class PrivateClawCrypto {
  PrivateClawCrypto._({required this.sessionId, required SecretKey secretKey})
    : _secretKey = secretKey;

  final String sessionId;
  final SecretKey _secretKey;
  final AesGcm _algorithm = AesGcm.with256bits();
  final Random _random = Random.secure();

  static Future<PrivateClawCrypto> fromSession({
    required String sessionId,
    required String sessionKey,
  }) async {
    final bytes = decodeBase64Url(sessionKey);
    if (bytes.length != 32) {
      throw const FormatException('PrivateClaw session key must be 32 bytes.');
    }

    return PrivateClawCrypto._(
      sessionId: sessionId,
      secretKey: SecretKey(bytes),
    );
  }

  Future<Map<String, dynamic>> encrypt(Map<String, Object?> payload) async {
    final nonce = List<int>.generate(12, (_) => _random.nextInt(256));
    final secretBox = await _algorithm.encrypt(
      utf8.encode(jsonEncode(payload)),
      secretKey: _secretKey,
      nonce: nonce,
      aad: utf8.encode(sessionId),
    );

    return {
      'version': 1,
      'messageId': _nextMessageId(),
      'iv': encodeBase64Url(nonce),
      'ciphertext': encodeBase64Url(secretBox.cipherText),
      'tag': encodeBase64Url(secretBox.mac.bytes),
      'sentAt': DateTime.now().toUtc().toIso8601String(),
    };
  }

  Future<Map<String, dynamic>> decrypt(Map<String, dynamic> envelope) async {
    if (envelope['version'] != 1) {
      throw const FormatException('Unsupported PrivateClaw envelope version.');
    }

    final iv = envelope['iv'];
    final ciphertext = envelope['ciphertext'];
    final tag = envelope['tag'];
    if (iv is! String || ciphertext is! String || tag is! String) {
      throw const FormatException('Malformed PrivateClaw envelope.');
    }

    final secretBox = SecretBox(
      decodeBase64Url(ciphertext),
      nonce: decodeBase64Url(iv),
      mac: Mac(decodeBase64Url(tag)),
    );

    final plaintext = await _algorithm.decrypt(
      secretBox,
      secretKey: _secretKey,
      aad: utf8.encode(sessionId),
    );

    final decoded = jsonDecode(utf8.decode(plaintext));
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('PrivateClaw payload must be a JSON object.');
    }
    return decoded;
  }

  String _nextMessageId() {
    return '${DateTime.now().microsecondsSinceEpoch}-${_random.nextInt(1 << 32).toRadixString(16)}';
  }

  static String encodeBase64Url(List<int> value) {
    return base64Url.encode(value).replaceAll('=', '');
  }

  static List<int> decodeBase64Url(String value) {
    return base64Url.decode(base64Url.normalize(value));
  }
}
