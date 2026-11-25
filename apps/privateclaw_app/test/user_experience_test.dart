import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/chat_attachment.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_active_session_store.dart';
import 'package:privateclaw_app/services/privateclaw_app_preferences.dart';
import 'package:privateclaw_app/services/privateclaw_identity_store.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';
import 'package:privateclaw_app/store_screenshot_preview.dart';

import 'test_support/privateclaw_directory_overrides.dart';

class _InMemoryActiveSessionStore extends PrivateClawActiveSessionStore {
  @override
  Future<PrivateClawActiveSessionRecord?> load() async => null;

  @override
  Future<List<PrivateClawActiveSessionRecord>> loadAll() async =>
      <PrivateClawActiveSessionRecord>[];

  @override
  Future<void> save({
    required PrivateClawInvite invite,
    required PrivateClawIdentity identity,
  }) async {}

  @override
  Future<void> clearCurrent() async {}

  @override
  Future<void> remove(String sessionId) async {}

  @override
  Future<void> clear() async {}
}

class _InMemoryPreferences extends PrivateClawAppPreferences {
  final Map<String, bool> flags = <String, bool>{};

  @override
  Future<bool> flag(String key) async => flags[key] == true;

  @override
  Future<void> setFlag(String key, bool value) async {
    flags[key] = value;
  }
}

class _FixedIdentityStore extends PrivateClawIdentityStore {
  _FixedIdentityStore(this.identity);

  final PrivateClawIdentity identity;

  @override
  Future<PrivateClawIdentity> loadOrCreate() async => identity;

  @override
  Future<void> save(PrivateClawIdentity identity) async {}
}

/// Session client whose relay events are driven by the test.
class _ScriptedSessionClient extends PrivateClawSessionClient {
  _ScriptedSessionClient(super.invite, {required super.identity});

  final StreamController<PrivateClawSessionEvent> _eventsController =
      StreamController<PrivateClawSessionEvent>.broadcast();
  int connectCalls = 0;
  final List<String> disposeReasons = <String>[];

  void emit(PrivateClawSessionEvent event) => _eventsController.add(event);

  @override
  Stream<PrivateClawSessionEvent> get events => _eventsController.stream;

  @override
  Future<void> connect() async {
    connectCalls += 1;
  }

  @override
  Future<void> refreshPushRegistration() async {}

  @override
  Future<void> sendUserMessage(
    String text, {
    List<ChatAttachment> attachments = const <ChatAttachment>[],
  }) async {}

  @override
  Future<void> dispose({
    String reason = 'client_closed',
    bool notifyRemote = true,
  }) async {
    disposeReasons.add(reason);
  }
}

/// Wires every store the join path touches to in-memory fakes so the test
/// never waits on real file IO under FakeAsync.
class _JoinHarness {
  _JoinHarness(this.client) {
    privateClawActiveSessionStoreFactory = _InMemoryActiveSessionStore.new;
    privateClawIdentityStoreFactory =
        () => _FixedIdentityStore(_identity);
    privateClawAppPreferencesFactory = _InMemoryPreferences.new;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) => client;
  }

  static final PrivateClawIdentity _identity = PrivateClawIdentity(
    appId: 'app-me',
    createdAt: DateTime.utc(2030, 1, 1),
    displayName: 'Mei',
  );

  final _ScriptedSessionClient client;

  void restore() {
    privateClawActiveSessionStoreFactory =
        () => const PrivateClawActiveSessionStore();
    privateClawIdentityStoreFactory = () => const PrivateClawIdentityStore();
    privateClawAppPreferencesFactory = () => const PrivateClawAppPreferences();
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) => PrivateClawSessionClient(
          invite,
          identity: identity,
          pushTokenProvider: pushTokenProvider,
        );
  }
}

PrivateClawInvite _invite({DateTime? expiresAt, String sessionId = 'ux-test-session'}) =>
    PrivateClawInvite(
  version: 1,
  sessionId: sessionId,
  sessionKey: 'dXhfdGVzdF9zZXNzaW9uX2tleV8xMjM0NTY3ODkwMTIzNA',
  appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=ux-test-session',
  expiresAt: expiresAt ?? DateTime.utc(2030, 1, 1),
  groupMode: true,
);

void main() {
  setUp(() {
    installPrivateClawTestDirectoryOverrides();
  });

  testWidgets(
    'first launch explains where invites come from and gates Join on input',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        const PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('empty-state-onboarding')),
        findsOneWidget,
      );
      expect(find.text('Scan your first invite'), findsOneWidget);
      expect(find.textContaining('created by PrivateClaw'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('empty-state-get-privateclaw')),
        findsOneWidget,
      );
      expect(
        find.text('End-to-end encrypted chat will appear here'),
        findsNothing,
      );
      expect(
        find.text('Join a room to start chatting…'),
        findsWidgets,
      );

      // Joining with an empty field used to surface a validation error; the
      // button now simply stays disabled until there is something to join.
      FilledButton joinButton = tester.widget<FilledButton>(
        find.byKey(const ValueKey<String>('connect-session-button')),
      );
      expect(joinButton.onPressed, isNull);

      await tester.enterText(
        find.byKey(const ValueKey<String>('invite-input-field')),
        'not-an-invite-yet',
      );
      await tester.pump();

      joinButton = tester.widget<FilledButton>(
        find.byKey(const ValueKey<String>('connect-session-button')),
      );
      expect(joinButton.onPressed, isNotNull);

      await tester.enterText(
        find.byKey(const ValueKey<String>('invite-input-field')),
        '   ',
      );
      await tester.pump();

      joinButton = tester.widget<FilledButton>(
        find.byKey(const ValueKey<String>('connect-session-button')),
      );
      expect(joinButton.onPressed, isNull);
    },
  );

  testWidgets(
    'collapsed session handle shows the group icon and remaining time',
    (WidgetTester tester) async {
      final DateTime Function() originalResolver = privateClawCurrentTimeResolver;
      privateClawCurrentTimeResolver = () => DateTime.utc(2030, 1, 1, 2);
      addTearDown(() {
        privateClawCurrentTimeResolver = originalResolver;
      });

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: PrivateClawPreviewData(
              status: PrivateClawSessionStatus.active,
              statusText: 'Encrypted group chat is active.',
              invite: _invite(expiresAt: DateTime.utc(2030, 1, 1, 9, 48)),
              identity: PrivateClawIdentity(
                appId: 'app-me',
                createdAt: DateTime.utc(2030, 1, 1),
                displayName: 'Mei',
              ),
              isPairingPanelCollapsed: true,
            ),
            localeOverride: const Locale('en'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('session-panel-handle')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const ValueKey<String>('session-panel-handle')),
          matching: find.byIcon(Icons.groups_2_outlined),
        ),
        findsOneWidget,
      );
      expect(
        find.text('7h'),
        findsOneWidget,
        reason: '7h48m remaining renders compactly in the app bar pill',
      );
    },
  );

  testWidgets(
    'disconnect asks for confirmation before leaving the room',
    (WidgetTester tester) async {
      final PrivateClawActiveSessionStore Function() originalStoreFactory =
          privateClawActiveSessionStoreFactory;
      privateClawActiveSessionStoreFactory = _InMemoryActiveSessionStore.new;
      addTearDown(() {
        privateClawActiveSessionStoreFactory = originalStoreFactory;
      });

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: screenshotPreviewDataForScenario(
              'group_chat',
              const Locale('en'),
            ),
            localeOverride: const Locale('en'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const ValueKey<String>('session-panel-handle')),
      );
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const ValueKey<String>('session-disconnect-button')),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('disconnect-confirm-dialog')),
        findsOneWidget,
      );
      expect(find.text('Leave this room?'), findsOneWidget);

      // Cancelling keeps the room exactly as it was.
      await tester.tap(
        find.byKey(const ValueKey<String>('disconnect-confirm-cancel')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey<String>('disconnect-confirm-dialog')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey<String>('session-panel-overlay')),
        findsOneWidget,
      );
      expect(find.textContaining('Relay health'), findsOneWidget);

      // Confirming leaves the room and returns to the first-run screen.
      await tester.tap(
        find.byKey(const ValueKey<String>('session-disconnect-button')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey<String>('disconnect-confirm-button')),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('session-panel-handle')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey<String>('empty-state-onboarding')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('invite-input-field')),
        findsOneWidget,
      );
      expect(find.textContaining('Relay health'), findsNothing);
    },
  );

  testWidgets(
    'message bubbles show only the time for messages sent today',
    (WidgetTester tester) async {
      final DateTime now = DateTime.now();
      final DateTime today = DateTime(now.year, now.month, now.day, 10, 47);
      final DateTime lastWeek = today.subtract(const Duration(days: 6));

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: PrivateClawPreviewData(
              status: PrivateClawSessionStatus.active,
              statusText: 'Encrypted chat is active.',
              invite: _invite(),
              identity: PrivateClawIdentity(
                appId: 'app-me',
                createdAt: now,
                displayName: 'Mei',
              ),
              isPairingPanelCollapsed: true,
              messages: <ChatMessage>[
                ChatMessage(
                  id: 'today',
                  sender: ChatSender.assistant,
                  text: 'Sent today',
                  sentAt: today,
                ),
                ChatMessage(
                  id: 'last-week',
                  sender: ChatSender.assistant,
                  text: 'Sent last week',
                  sentAt: lastWeek,
                ),
              ],
            ),
            localeOverride: const Locale('en'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final String timeOnly = DateFormat.jm('en').format(today.toLocal());
      final String withDate = DateFormat.yMd('en')
          .add_jm()
          .format(lastWeek.toLocal());
      expect(find.text(timeOnly), findsOneWidget);
      expect(find.text(withDate), findsOneWidget);
      expect(
        find.text(DateFormat.yMd('en').add_jm().format(today.toLocal())),
        findsNothing,
      );
    },
  );

  testWidgets('an expired invite is rejected before dialing the relay', (
    WidgetTester tester,
  ) async {
    final DateTime Function() originalResolver = privateClawCurrentTimeResolver;
    privateClawCurrentTimeResolver = () => DateTime.utc(2030, 1, 1, 12);
    addTearDown(() {
      privateClawCurrentTimeResolver = originalResolver;
    });
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(expiresAt: DateTime.utc(2030, 1, 1, 10)),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite(expiresAt: DateTime.utc(2030, 1, 1, 10))),
    );
    await tester.pumpAndSettle();

    expect(client.connectCalls, 0);
    expect(
      find.text(
        'This invite expired 2h ago. Ask the host for a new one.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('an unreadable invite explains itself instead of dumping the exception', (
    WidgetTester tester,
  ) async {
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      'not-an-invite',
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-session-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Paste or scan a valid PrivateClaw invite link.'),
      findsOneWidget,
    );
    expect(find.textContaining('FormatException'), findsNothing);
    expect(find.textContaining('Connect failed'), findsNothing);
  });

  testWidgets('joining shows relay, handshake and joined steps and can be cancelled', (
    WidgetTester tester,
  ) async {
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(client.connectCalls, 1);
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsOneWidget,
    );
    expect(find.text('Connecting to the PrivateClaw relay…'), findsOneWidget);
    expect(find.text('Relay'), findsOneWidget);
    expect(find.text('Handshake'), findsOneWidget);
    expect(find.text('Joined'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey<String>('session-panel-handle')),
        matching: find.byIcon(Icons.sync),
      ),
      findsNothing,
      reason: 'the app bar pill only exists once a room is established',
    );

    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.relayAttached,
        connectionStatus: PrivateClawSessionStatus.relayAttached,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.text('Relay connected. Finishing the encrypted handshake…'),
      findsOneWidget,
    );

    // The 600px test surface keeps the card scrollable; bring the button into
    // view like a user would before tapping it.
    await tester.ensureVisible(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    // (Socket teardown runs in the background; its continuation does not run
    // under FakeAsync once the UI is idle, so only the visible outcome is
    // asserted here.)
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('empty-state-onboarding')),
      findsOneWidget,
    );
    expect(
      find.text("Cancelled. Scan or paste an invite when you're ready."),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('invite-input-field')),
      findsOneWidget,
      reason: 'the invite stays in the field so the user can simply retry',
    );
  });

  testWidgets('relay failures are translated into actionable sentences', (
    WidgetTester tester,
  ) async {
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.relayError,
        details: 'session_not_found',
        connectionStatus: PrivateClawSessionStatus.error,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text("This room doesn't exist anymore. Ask the host for a new invite."),
      findsOneWidget,
    );
    expect(find.textContaining('session_not_found'), findsNothing);

    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectionError,
        details:
            'WebSocketChannelException: SocketException: Connection refused (OS Error: Connection refused), address = 10.0.0.1, port = 443',
        connectionStatus: PrivateClawSessionStatus.error,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text(
        'The relay relay.privateclaw.us refused the connection. Make sure it is running and try again.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('SocketException'), findsNothing);
  });

  testWidgets('composer toolbar only exists once a room is live', (
    WidgetTester tester,
  ) async {
    final List<String> toolbarKeys = <String>[
      'emoji-picker-button',
      'voice-record-button',
      'composer-photo-button',
      'composer-file-button',
      'composer-expand-button',
      'composer-send-button',
    ];
    Finder toolbarFinder() =>
        find.byKey(const ValueKey<String>('composer-toolbar'));

    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();

    // No room: the row is not built at all (not just greyed out).
    expect(toolbarFinder(), findsNothing);
    for (final String key in toolbarKeys) {
      expect(find.byKey(ValueKey<String>(key)), findsNothing);
    }
    expect(
      find.text('Join a room to start chatting…'),
      findsWidgets,
    );

    // First join in progress: still hidden, so no tappable send button exists.
    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsOneWidget,
    );
    expect(toolbarFinder(), findsNothing);
    expect(find.byKey(const ValueKey<String>('composer-send-button')), findsNothing);

    // Live room: everything is there and enabled.
    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: screenshotPreviewDataForScenario(
            'group_chat',
            const Locale('en'),
          ),
          localeOverride: const Locale('en'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(toolbarFinder(), findsOneWidget);
    for (final String key in toolbarKeys) {
      expect(find.byKey(ValueKey<String>(key)), findsOneWidget);
    }
    IconButton sendButton = tester.widget<IconButton>(
      find.byKey(const ValueKey<String>('composer-send-button')),
    );
    expect(sendButton.onPressed, isNull, reason: 'nothing typed yet');
    await tester.enterText(
      find.byKey(const ValueKey<String>('composer-input-field')),
      'hello',
    );
    await tester.pump();
    sendButton = tester.widget<IconButton>(
      find.byKey(const ValueKey<String>('composer-send-button')),
    );
    expect(sendButton.onPressed, isNotNull);

    // Reconnecting after the room was live: the row stays (disabled) so the
    // composer does not jump around.
    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            status: PrivateClawSessionStatus.reconnecting,
            statusText: 'Connecting to the relay…',
            invite: _invite(),
            identity: PrivateClawIdentity(
              appId: 'app-me',
              createdAt: DateTime.utc(2030, 1, 1),
              displayName: 'Mei',
            ),
            isPairingPanelCollapsed: true,
          ),
          localeOverride: const Locale('en'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(toolbarFinder(), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('composer-send-button')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<IconButton>(
            find.byKey(const ValueKey<String>('composer-send-button')),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets('a first join that keeps retrying stays in the pairing card with its reason', (
    WidgetTester tester,
  ) async {
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        skipNotificationsInDebug: true,
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The relay drops the socket and the client schedules a retry.
    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectionError,
        details: 'SocketException: Connection refused (OS Error: Connection refused), address = 10.0.0.1, port = 443',
        connectionStatus: PrivateClawSessionStatus.error,
      ),
    );
    await tester.pump();
    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectingRelay,
        connectionStatus: PrivateClawSessionStatus.reconnecting,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Still a first join: the big session panel must not pop over the screen,
    // the reason stays visible and the user can still bail out.
    expect(
      find.byKey(const ValueKey<String>('session-panel-overlay')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsOneWidget,
    );
    expect(
      find.textContaining('refused the connection. Make sure it is running'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
      findsOneWidget,
    );

    // Without a specific error (a relay that just never answers) the retry
    // still says what it is doing.
    await tester.ensureVisible(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite(sessionId: 'ux-test-session-3')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    client.emit(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectingRelay,
        connectionStatus: PrivateClawSessionStatus.reconnecting,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      find.text(
        'Still trying to reach relay.privateclaw.us. Check that it is online and your network is up.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('the notification explainer appears once before the permission prompt', (
    WidgetTester tester,
  ) async {
    final bool Function() originalExplainer = privateClawNotificationsExplainerEnabled;
    privateClawNotificationsExplainerEnabled = () => true;
    addTearDown(() {
      privateClawNotificationsExplainerEnabled = originalExplainer;
    });
    final _ScriptedSessionClient client = _ScriptedSessionClient(
      _invite(),
      identity: _JoinHarness._identity,
    );
    final _JoinHarness harness = _JoinHarness(client);
    addTearDown(harness.restore);

    await tester.pumpWidget(
      const PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.byKey(const ValueKey<String>('notification-explainer-dialog')),
      findsOneWidget,
    );
    expect(find.text('Get notified about replies'), findsOneWidget);
    expect(client.connectCalls, 0, reason: 'permission context comes first');

    await tester.tap(
      find.byKey(const ValueKey<String>('notification-explainer-later')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The join proceeds once the explainer is dismissed. (The platform
    // notification channel never answers under flutter_test, so the join stays
    // in its connecting phase here; on a device the system prompt follows.)
    expect(
      find.byKey(const ValueKey<String>('notification-explainer-dialog')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsOneWidget,
    );

    // The 600px test surface keeps the card scrollable; bring the button into
    // view like a user would before tapping it.
    await tester.ensureVisible(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-cancel-button')),
    );
    await tester.pumpAndSettle();

    // Joining again must not repeat the explainer. (A different invite, so
    // the in-flight guard for the cancelled join does not swallow it.)
    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(_invite(sessionId: 'ux-test-session-2')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.byKey(const ValueKey<String>('notification-explainer-dialog')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey<String>('session-connect-progress')),
      findsOneWidget,
    );
  });

  testWidgets('message list groups runs from one sender and separates days', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now();
    final DateTime today = DateTime(now.year, now.month, now.day, 10, 0);
    final DateTime yesterday = today.subtract(const Duration(days: 1));

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            status: PrivateClawSessionStatus.active,
            statusText: 'Encrypted chat is active.',
            invite: _invite(),
            identity: PrivateClawIdentity(
              appId: 'app-me',
              createdAt: now,
              displayName: 'Mei',
            ),
            isPairingPanelCollapsed: true,
            messages: <ChatMessage>[
              ChatMessage(
                id: 'y-1',
                sender: ChatSender.assistant,
                text: 'Yesterday note',
                sentAt: yesterday,
              ),
              ChatMessage(
                id: 't-1',
                sender: ChatSender.assistant,
                text: 'First today',
                sentAt: today,
              ),
              ChatMessage(
                id: 't-2',
                sender: ChatSender.assistant,
                text: 'Follow-up a minute later',
                sentAt: today.add(const Duration(minutes: 1)),
              ),
              ChatMessage(
                id: 't-3',
                sender: ChatSender.user,
                text: 'My question',
                sentAt: today.add(const Duration(minutes: 5)),
                isOwnMessage: true,
                senderId: 'app-me',
                senderLabel: 'Mei',
              ),
            ],
          ),
          localeOverride: const Locale('en'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Yesterday'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('message-avatar-t-1')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('message-avatar-t-2')),
      findsNothing,
      reason: 'a follow-up from the same sender within two minutes is grouped',
    );
    expect(
      find.byKey(const ValueKey<String>('message-avatar-t-3')),
      findsOneWidget,
      reason: 'a different sender starts a new block',
    );
  });
}
