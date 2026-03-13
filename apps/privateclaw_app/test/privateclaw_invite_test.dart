import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';

void main() {
  test('PrivateClawInvite parses QR URI payloads', () {
    final invite = {
      'version': 1,
      'sessionId': 'session-123',
      'sessionKey': 'c2Vzc2lvbl9rZXlfZm9yX3Rlc3RpbmdfMTIzNDU2Nzg5MDEyMw',
      'appWsUrl': 'ws://127.0.0.1:8787/ws/app?sessionId=session-123',
      'expiresAt': DateTime.utc(2030, 1, 1).toIso8601String(),
      'providerLabel': 'PrivateClaw',
    };
    final payload = base64Url
        .encode(utf8.encode(jsonEncode(invite)))
        .replaceAll('=', '');

    final parsed = PrivateClawInvite.fromScan(
      'privateclaw://connect?payload=$payload',
    );

    expect(parsed.sessionId, 'session-123');
    expect(parsed.providerLabel, 'PrivateClaw');
  });
}
