import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_active_session_store.dart';
import 'package:privateclaw_app/services/privateclaw_identity_store.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';

import 'test_support/privateclaw_directory_overrides.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'cold-start session restore only runs one restore attempt while resumed',
    (WidgetTester tester) async {
      installPrivateClawTestDirectoryOverrides();

      final PrivateClawActiveSessionStoreFactory originalSessionStoreFactory =
          privateClawActiveSessionStoreFactory;
      final PrivateClawIdentityStoreFactory originalIdentityStoreFactory =
          privateClawIdentityStoreFactory;
      final PrivateClawSessionClientFactory originalSessionClientFactory =
          privateClawSessionClientFactory;

      final Completer<PrivateClawActiveSessionRecord?> loadCompleter =
          Completer<PrivateClawActiveSessionRecord?>();
      final _FakeActiveSessionStore activeSessionStore =
          _FakeActiveSessionStore(loadCompleter);
      final _FakeIdentityStore identityStore = _FakeIdentityStore();
      final List<_FakeSessionClient> createdClients = <_FakeSessionClient>[];

      privateClawActiveSessionStoreFactory = () => activeSessionStore;
      privateClawIdentityStoreFactory = () => identityStore;
      privateClawSessionClientFactory =
          (
            PrivateClawInvite invite, {
            required PrivateClawIdentity identity,
            PrivateClawPushTokenProvider? pushTokenProvider,
          }) {
            final _FakeSessionClient client = _FakeSessionClient(
              invite,
              identity: identity,
            );
            createdClients.add(client);
            return client;
          };

      addTearDown(() {
        privateClawActiveSessionStoreFactory = originalSessionStoreFactory;
        privateClawIdentityStoreFactory = originalIdentityStoreFactory;
        privateClawSessionClientFactory = originalSessionClientFactory;
      });

      final DateTime now = DateTime.now().toUtc();
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'session-restore',
        sessionKey: 'session-key',
        appWsUrl: 'ws://127.0.0.1/ws/app?sessionId=session-restore',
        expiresAt: now.add(const Duration(hours: 2)),
      );
      final PrivateClawIdentity identity = PrivateClawIdentity(
        appId: 'pc-restore-test',
        createdAt: now.subtract(const Duration(minutes: 5)),
      );

      await tester.pumpWidget(
        const PrivateClawApp(skipNotificationsInDebug: true),
      );
      await tester.pump();

      final dynamic state = tester.state(find.byType(PrivateClawHomePage));
      state.didChangeAppLifecycleState(AppLifecycleState.resumed);
      await tester.pump();

      loadCompleter.complete(
        PrivateClawActiveSessionRecord(
          invite: invite,
          identity: identity,
          savedAt: now,
        ),
      );

      await tester.pump();
      await tester.pump();

      expect(activeSessionStore.loadCalls, 1);
      expect(identityStore.savedIdentities, <PrivateClawIdentity>[identity]);
      expect(createdClients, hasLength(1));
      expect(createdClients.single.connectCalls, 1);
      expect(activeSessionStore.savedRecords, hasLength(1));
      expect(
        activeSessionStore.savedRecords.single.invite.sessionId,
        invite.sessionId,
      );
    },
  );

  testWidgets('manual connect wins over an in-flight session restore', (
    WidgetTester tester,
  ) async {
    installPrivateClawTestDirectoryOverrides();
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 4200);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final PrivateClawActiveSessionStoreFactory originalSessionStoreFactory =
        privateClawActiveSessionStoreFactory;
    final PrivateClawIdentityStoreFactory originalIdentityStoreFactory =
        privateClawIdentityStoreFactory;
    final PrivateClawSessionClientFactory originalSessionClientFactory =
        privateClawSessionClientFactory;

    final Completer<PrivateClawActiveSessionRecord?> loadCompleter =
        Completer<PrivateClawActiveSessionRecord?>();
    final _FakeActiveSessionStore activeSessionStore = _FakeActiveSessionStore(
      loadCompleter,
    );
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawIdentity manualIdentity = PrivateClawIdentity(
      appId: 'pc-manual-connect',
      createdAt: now.subtract(const Duration(minutes: 3)),
    );
    final _FakeIdentityStore identityStore = _FakeIdentityStore(
      loadOrCreateIdentity: manualIdentity,
    );
    final List<_FakeSessionClient> createdClients = <_FakeSessionClient>[];

    privateClawActiveSessionStoreFactory = () => activeSessionStore;
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _FakeSessionClient client = _FakeSessionClient(
            invite,
            identity: identity,
          );
          createdClients.add(client);
          return client;
        };

    addTearDown(() {
      privateClawActiveSessionStoreFactory = originalSessionStoreFactory;
      privateClawIdentityStoreFactory = originalIdentityStoreFactory;
      privateClawSessionClientFactory = originalSessionClientFactory;
    });

    final PrivateClawInvite restoredInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-restored',
      sessionKey: 'session-restored-key',
      appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=session-restored',
      expiresAt: now.add(const Duration(hours: 2)),
    );
    final PrivateClawIdentity restoredIdentity = PrivateClawIdentity(
      appId: 'pc-restored-connect',
      createdAt: now.subtract(const Duration(minutes: 8)),
    );
    final PrivateClawInvite manualInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-manual',
      sessionKey: 'session-manual-key',
      appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=session-manual',
      expiresAt: now.add(const Duration(hours: 4)),
    );

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(manualInvite),
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-session-button')),
    );
    await tester.pump();
    await tester.pump();

    expect(createdClients, hasLength(1));
    expect(createdClients.single.invite.sessionId, manualInvite.sessionId);
    expect(createdClients.single.identity.appId, manualIdentity.appId);
    expect(createdClients.single.connectCalls, 1);

    loadCompleter.complete(
      PrivateClawActiveSessionRecord(
        invite: restoredInvite,
        identity: restoredIdentity,
        savedAt: now,
      ),
    );

    await tester.pump();
    await tester.pump();

    expect(activeSessionStore.loadCalls, 1);
    expect(identityStore.loadOrCreateCalls, 1);
    expect(identityStore.savedIdentities, isEmpty);
    expect(createdClients, hasLength(1));
    expect(activeSessionStore.savedRecords, hasLength(1));
    expect(
      activeSessionStore.savedRecords.single.invite.sessionId,
      manualInvite.sessionId,
    );
    expect(find.textContaining(manualInvite.sessionId), findsOneWidget);
    expect(find.textContaining(restoredInvite.sessionId), findsNothing);
  });

  testWidgets('unknown-session reconnect removes stale saved session', (
    WidgetTester tester,
  ) async {
    installPrivateClawTestDirectoryOverrides();
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 4200);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final PrivateClawActiveSessionStoreFactory originalSessionStoreFactory =
        privateClawActiveSessionStoreFactory;
    final PrivateClawIdentityStoreFactory originalIdentityStoreFactory =
        privateClawIdentityStoreFactory;
    final PrivateClawSessionClientFactory originalSessionClientFactory =
        privateClawSessionClientFactory;

    final Completer<PrivateClawActiveSessionRecord?> loadCompleter =
        Completer<PrivateClawActiveSessionRecord?>()..complete(null);
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'stale-session',
      sessionKey: 'stale-session-key',
      appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=stale-session',
      expiresAt: now.add(const Duration(hours: 1)),
    );
    final PrivateClawIdentity identity = PrivateClawIdentity(
      appId: 'pc-stale-session-test',
      createdAt: now.subtract(const Duration(minutes: 4)),
    );
    final _FakeActiveSessionStore activeSessionStore = _FakeActiveSessionStore(
      loadCompleter,
      initialRecords: <PrivateClawActiveSessionRecord>[
        PrivateClawActiveSessionRecord(
          invite: invite,
          identity: identity,
          savedAt: now,
        ),
      ],
    );
    final _FakeIdentityStore identityStore = _FakeIdentityStore(
      loadOrCreateIdentity: identity,
    );
    final List<_FakeSessionClient> createdClients = <_FakeSessionClient>[];

    privateClawActiveSessionStoreFactory = () => activeSessionStore;
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _FakeSessionClient client = _FakeSessionClient(
            invite,
            identity: identity,
          );
          createdClients.add(client);
          return client;
        };

    addTearDown(() {
      privateClawActiveSessionStoreFactory = originalSessionStoreFactory;
      privateClawIdentityStoreFactory = originalIdentityStoreFactory;
      privateClawSessionClientFactory = originalSessionClientFactory;
    });

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();
    await tester.pump();

    expect(
      find.byKey(const ValueKey<String>('saved-sessions-trigger')),
      findsOneWidget,
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('saved-sessions-trigger')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey<String>('saved-session-stale-session')),
    );
    await tester.pump();
    await tester.pump();

    expect(createdClients, hasLength(1));
    expect(activeSessionStore.savedRecords, hasLength(1));

    createdClients.single.emitEvent(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.relayError,
        details: 'PrivateClaw session not found. Generate a fresh QR code.',
        reasonCode: 'unknown_session',
        connectionStatus: PrivateClawSessionStatus.closed,
      ),
    );
    await tester.pumpAndSettle();

    expect(activeSessionStore.savedRecords, isEmpty);
    expect(activeSessionStore.currentSessionId, isNull);
    expect(
      find.byKey(const ValueKey<String>('saved-sessions-trigger')),
      findsNothing,
    );
  });
}

class _FakeActiveSessionStore extends PrivateClawActiveSessionStore {
  _FakeActiveSessionStore(
    this.loadCompleter, {
    List<PrivateClawActiveSessionRecord>? initialRecords,
    this.currentSessionId,
  }) {
    if (initialRecords != null) {
      savedRecords.addAll(initialRecords);
    }
  }

  final Completer<PrivateClawActiveSessionRecord?> loadCompleter;
  int loadCalls = 0;
  final List<PrivateClawActiveSessionRecord> savedRecords =
      <PrivateClawActiveSessionRecord>[];
  String? currentSessionId;

  @override
  Future<PrivateClawActiveSessionRecord?> load() {
    loadCalls += 1;
    return loadCompleter.future;
  }

  @override
  Future<List<PrivateClawActiveSessionRecord>> loadAll() async {
    return List<PrivateClawActiveSessionRecord>.from(savedRecords);
  }

  @override
  Future<void> save({
    required PrivateClawInvite invite,
    required PrivateClawIdentity identity,
  }) async {
    savedRecords.removeWhere(
      (PrivateClawActiveSessionRecord record) =>
          record.invite.sessionId == invite.sessionId,
    );
    savedRecords.add(
      PrivateClawActiveSessionRecord(
        invite: invite,
        identity: identity,
        savedAt: DateTime.now().toUtc(),
      ),
    );
    currentSessionId = invite.sessionId;
  }

  @override
  Future<void> clearCurrent() async {
    currentSessionId = null;
  }

  @override
  Future<void> remove(String sessionId) async {
    savedRecords.removeWhere(
      (PrivateClawActiveSessionRecord record) =>
          record.invite.sessionId == sessionId,
    );
    if (currentSessionId == sessionId) {
      currentSessionId = null;
    }
  }

  @override
  Future<void> clear() async {
    savedRecords.clear();
    currentSessionId = null;
  }
}

class _FakeIdentityStore extends PrivateClawIdentityStore {
  _FakeIdentityStore({this.loadOrCreateIdentity});

  final PrivateClawIdentity? loadOrCreateIdentity;
  final List<PrivateClawIdentity> savedIdentities = <PrivateClawIdentity>[];
  int loadOrCreateCalls = 0;

  @override
  Future<PrivateClawIdentity> loadOrCreate() async {
    loadOrCreateCalls += 1;
    if (loadOrCreateIdentity == null) {
      throw UnimplementedError('loadOrCreate is not used in this test.');
    }
    return loadOrCreateIdentity!;
  }

  @override
  Future<void> save(PrivateClawIdentity identity) async {
    savedIdentities.add(identity);
  }
}

class _FakeSessionClient extends PrivateClawSessionClient {
  _FakeSessionClient(super.invite, {required super.identity});

  final StreamController<PrivateClawSessionEvent> _eventsController =
      StreamController<PrivateClawSessionEvent>.broadcast();
  int connectCalls = 0;

  @override
  Stream<PrivateClawSessionEvent> get events => _eventsController.stream;

  @override
  Future<void> connect() async {
    connectCalls += 1;
  }

  void emitEvent(PrivateClawSessionEvent event) {
    _eventsController.add(event);
  }

  @override
  Future<void> refreshPushRegistration() async {}

  @override
  Future<void> dispose({
    String reason = 'client_closed',
    bool notifyRemote = true,
  }) async {
    await _eventsController.close();
  }
}
