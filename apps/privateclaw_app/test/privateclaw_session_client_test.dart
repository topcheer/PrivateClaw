import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';

void main() {
  test('terminal relay errors stop reconnect attempts', () async {
    final HttpServer server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      0,
    );
    addTearDown(() async {
      await server.close(force: true);
    });

    final List<WebSocket> sockets = <WebSocket>[];
    int connectionCount = 0;
    final StreamSubscription<HttpRequest> serverSubscription = server.listen((
      HttpRequest request,
    ) async {
      final WebSocket socket = await WebSocketTransformer.upgrade(request);
      sockets.add(socket);
      connectionCount += 1;
      socket.add(
        jsonEncode(<String, Object?>{
          'type': 'relay:error',
          'code': 'unknown_session',
          'message': 'PrivateClaw session not found. Generate a fresh QR code.',
          'sessionId': 'missing-session',
        }),
      );
      await socket.close(WebSocketStatus.policyViolation, 'unknown_session');
    });
    addTearDown(() async {
      await serverSubscription.cancel();
      for (final WebSocket socket in sockets) {
        await socket.close();
      }
    });

    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'missing-session',
      sessionKey: base64Url
          .encode(List<int>.generate(32, (int index) => index))
          .replaceAll('=', ''),
      appWsUrl:
          'ws://127.0.0.1:${server.port}/ws/app?sessionId=missing-session',
      expiresAt: DateTime.utc(2030, 1, 1),
    );
    final PrivateClawSessionClient client = PrivateClawSessionClient(
      invite,
      identity: PrivateClawIdentity(
        appId: 'app-one',
        createdAt: DateTime.utc(2030, 1, 1),
      ),
    );
    addTearDown(() async {
      await client.dispose(notifyRemote: false);
    });

    final List<PrivateClawSessionEvent> events = <PrivateClawSessionEvent>[];
    final StreamSubscription<PrivateClawSessionEvent> eventsSubscription =
        client.events.listen(events.add);
    addTearDown(eventsSubscription.cancel);

    await client.connect();
    await Future<void>.delayed(const Duration(milliseconds: 1300));

    expect(connectionCount, 1);
    expect(
      events.any(
        (PrivateClawSessionEvent event) =>
            event.notice == PrivateClawSessionNotice.relayError &&
            event.connectionStatus == PrivateClawSessionStatus.closed,
      ),
      isTrue,
    );
    expect(
      events.any(
        (PrivateClawSessionEvent event) =>
            event.connectionStatus == PrivateClawSessionStatus.reconnecting,
      ),
      isFalse,
    );
  });
}
