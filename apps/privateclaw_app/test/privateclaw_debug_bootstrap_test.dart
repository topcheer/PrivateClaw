import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/services/privateclaw_debug_bootstrap.dart';

void main() {
  test(
    'loadPrivateClawDebugBootstrapFromEnvironment returns null without payload',
    () {
      final bootstrap = loadPrivateClawDebugBootstrapFromEnvironment(
        environment: const <String, String>{},
      );

      expect(bootstrap, isNull);
    },
  );

  test('parsePrivateClawDebugBootstrapPayload decodes invite and identity', () {
    final Map<String, Object?> payload = <String, Object?>{
      'inviteUri':
          'privateclaw://connect?payload=${base64Url.encode(utf8.encode(jsonEncode(<String, Object?>{'version': 1, 'sessionId': 'session-bootstrap', 'sessionKey': 'c2Vzc2lvbl9rZXlfZm9yX2RlYnVnX2Jvb3RzdHJhcF8xMjM0NQ', 'appWsUrl': 'wss://local.privateclaw.us/ws/app?sessionId=session-bootstrap', 'expiresAt': DateTime.utc(2030, 1, 1).toIso8601String(), 'groupMode': true, 'providerLabel': 'PrivateClaw'}))).replaceAll('=', '')}',
      'identity': <String, Object?>{
        'appId': 'pc-test-ios',
        'displayName': 'TestX',
        'createdAt': DateTime.utc(2030, 1, 1).toIso8601String(),
      },
    };
    final String encoded = base64Url
        .encode(utf8.encode(jsonEncode(payload)))
        .replaceAll('=', '');

    final bootstrap = parsePrivateClawDebugBootstrapPayload(encoded);

    expect(bootstrap.invite.sessionId, 'session-bootstrap');
    expect(bootstrap.invite.groupMode, isTrue);
    expect(bootstrap.identity?.appId, 'pc-test-ios');
    expect(bootstrap.identity?.displayName, 'TestX');
  });
}
