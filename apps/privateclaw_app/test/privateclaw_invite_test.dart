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
      'groupMode': true,
      'providerLabel': 'PrivateClaw',
    };
    final payload = base64Url
        .encode(utf8.encode(jsonEncode(invite)))
        .replaceAll('=', '');

    final parsed = PrivateClawInvite.fromScan(
      'privateclaw://connect?payload=$payload',
    );

    expect(parsed.sessionId, 'session-123');
    expect(parsed.groupMode, isTrue);
    expect(parsed.providerLabel, 'PrivateClaw');
  });

  test('PrivateClawInvite extracts an invite URI from pasted announcement text', () {
    final invite = {
      'version': 1,
      'sessionId': 'session-embedded',
      'sessionKey': 'c2Vzc2lvbl9rZXlfZm9yX2VtYmVkZGVkX3Rlc3RpbmdfMTIzNDU',
      'appWsUrl': 'wss://privateclaw.ystone.us/ws/app?sessionId=session-embedded',
      'expiresAt': DateTime.utc(2030, 1, 1).toIso8601String(),
      'providerLabel': 'PrivateClaw',
    };
    final payload = base64Url
        .encode(utf8.encode(jsonEncode(invite)))
        .replaceAll('=', '');

    final parsed = PrivateClawInvite.fromScan(
      '''
PrivateClaw session session-embedded is ready until 2030-01-01T00:00:00.000Z.
Invite URI: privateclaw://connect?payload=$payload
''',
    );

    expect(parsed.sessionId, 'session-embedded');
    expect(parsed.appWsUrl, 'wss://privateclaw.ystone.us/ws/app?sessionId=session-embedded');
    expect(parsed.providerLabel, 'PrivateClaw');
  });

  test('PrivateClawInvite derives relay display labels and default-relay detection', () {
    final PrivateClawInvite defaultInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-default',
      sessionKey: 'c2Vzc2lvbl9rZXlfZm9yX2RlZmF1bHRfcmVsYXlfMTIzNDU2Nzg',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-default',
      expiresAt: DateTime.utc(2030, 1, 1),
    );
    final PrivateClawInvite customInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-custom',
      sessionKey: 'c2Vzc2lvbl9rZXlfZm9yX2N1c3RvbV9yZWxheV8xMjM0NTY3ODk',
      appWsUrl: 'ws://127.0.0.1:8787/ws/app?sessionId=session-custom',
      expiresAt: DateTime.utc(2030, 1, 1),
    );

    expect(defaultInvite.relayDisplayLabel, 'relay.privateclaw.us');
    expect(defaultInvite.usesDefaultRelay, isTrue);
    expect(defaultInvite.usesNonDefaultRelay, isFalse);

    expect(customInvite.relayDisplayLabel, '127.0.0.1:8787');
    expect(customInvite.usesDefaultRelay, isFalse);
    expect(customInvite.usesNonDefaultRelay, isTrue);
  });
}
