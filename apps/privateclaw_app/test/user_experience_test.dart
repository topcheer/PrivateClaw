import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_active_session_store.dart';
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

PrivateClawInvite _invite({DateTime? expiresAt}) => PrivateClawInvite(
  version: 1,
  sessionId: 'ux-test-session',
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
}
