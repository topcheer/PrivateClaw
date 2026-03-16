import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/models/privateclaw_slash_command.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';
import 'package:privateclaw_app/store_screenshot_preview.dart';

void main() {
  testWidgets(
    'PrivateClaw home screen renders icon header and composer actions',
    (WidgetTester tester) async {
      await tester.pumpWidget(const PrivateClawApp());

      expect(
        find.byKey(const ValueKey<String>('app-bar-icon')),
        findsOneWidget,
      );
      expect(find.text('Scan QR code'), findsOneWidget);
      expect(find.text('Join session'), findsOneWidget);
      expect(find.byIcon(Icons.attach_file), findsOneWidget);

      final List<TextField> textFields = tester
          .widgetList<TextField>(find.byType(TextField))
          .toList(growable: false);
      expect(textFields.any((TextField field) => field.maxLines == 1), isTrue);
    },
  );

  testWidgets(
    'active session preview keeps chat full screen until the session panel is expanded',
    (WidgetTester tester) async {
      final DateTime now = DateTime.now().toUtc();
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'session-active',
        sessionKey: 'test-session-key',
        appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-active',
        expiresAt: now.add(const Duration(hours: 1)),
        relayLabel: 'relay.privateclaw.us',
      );

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: PrivateClawPreviewData(
              invite: invite,
              identity: PrivateClawIdentity(
                appId: 'app-active',
                createdAt: now.subtract(const Duration(days: 1)),
                displayName: 'Preview',
              ),
              status: PrivateClawSessionStatus.active,
              statusText: 'Connected.',
              isPairingPanelCollapsed: true,
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Invite link or QR payload'), findsNothing);
      expect(find.text('Join session'), findsNothing);
      expect(find.text('Scan QR code'), findsNothing);
      expect(find.text('Disconnect'), findsNothing);
      expect(
        find.byKey(const ValueKey<String>('session-panel-handle')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const ValueKey<String>('session-panel-handle')),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('session-panel-overlay')),
        findsOneWidget,
      );
      expect(find.text('Scan QR code'), findsOneWidget);
      expect(find.text('Disconnect'), findsOneWidget);
      expect(find.text('relay.privateclaw.us'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('session-disconnect-button')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'reconnecting preview can reopen the hidden session panel and reshow the QR',
    (WidgetTester tester) async {
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'session-reshare',
        sessionKey: 'test-session-key',
        appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-reshare',
        expiresAt: DateTime.utc(2026, 3, 14, 21, 30),
      );

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: PrivateClawPreviewData(
              invite: invite,
              status: PrivateClawSessionStatus.reconnecting,
              statusText: 'Reconnecting quietly…',
              isPairingPanelCollapsed: true,
            ),
          ),
        ),
      );

      expect(find.text('Invite link or QR payload'), findsNothing);
      expect(
        find.byKey(const ValueKey<String>('session-panel-handle')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const ValueKey<String>('session-panel-handle')),
      );
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const ValueKey<String>('session-qr-trigger')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Current session QR'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('session-qr-code')),
        findsOneWidget,
      );
      expect(find.text('Copy invite link'), findsOneWidget);
    },
  );

  testWidgets('expiring session preview renders a renew prompt', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-renew',
      sessionKey: 'test-session-key',
      appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-renew',
      expiresAt: now.add(const Duration(minutes: 29)),
      groupMode: true,
    );

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            invite: invite,
            identity: PrivateClawIdentity(
              appId: 'app-preview',
              createdAt: now.subtract(const Duration(days: 1)),
              displayName: 'Preview',
            ),
            status: PrivateClawSessionStatus.active,
            statusText: 'Renewal reminder: less than 30 minutes remain.',
            isPairingPanelCollapsed: true,
            availableCommands: const <PrivateClawSlashCommand>[
              PrivateClawSlashCommand(
                slash: '/renew-session',
                description: 'Extend the current encrypted session.',
                acceptsArgs: false,
                source: 'provider',
              ),
            ],
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

    expect(
      find.byKey(const ValueKey<String>('session-renew-prompt')),
      findsOneWidget,
    );
    final FilledButton renewButton = tester.widget<FilledButton>(
      find.byKey(const ValueKey<String>('session-renew-button')),
    );
    expect(renewButton.onPressed, isNull);
  });

  testWidgets('slash command sheet supports search filtering', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-commands',
      sessionKey: 'test-session-key',
      appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-commands',
      expiresAt: now.add(const Duration(hours: 1)),
      groupMode: true,
    );

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            invite: invite,
            identity: PrivateClawIdentity(
              appId: 'app-search',
              createdAt: now.subtract(const Duration(days: 1)),
              displayName: 'Search Preview',
            ),
            status: PrivateClawSessionStatus.active,
            statusText: 'Connected.',
            isPairingPanelCollapsed: true,
            availableCommands: const <PrivateClawSlashCommand>[
              PrivateClawSlashCommand(
                slash: '/renew-session',
                description: 'Extend the current encrypted session.',
                acceptsArgs: false,
                source: 'provider',
              ),
              PrivateClawSlashCommand(
                slash: '/mute-bot',
                description: 'Pause assistant replies for group chat only.',
                acceptsArgs: false,
                source: 'provider',
              ),
            ],
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.terminal));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('slash-command-search')),
      findsOneWidget,
    );
    expect(find.text('/renew-session'), findsOneWidget);
    expect(find.text('/mute-bot'), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey<String>('slash-command-search')),
      'renew',
    );
    await tester.pumpAndSettle();

    expect(find.text('/renew-session'), findsOneWidget);
    expect(find.text('/mute-bot'), findsNothing);
  });

  testWidgets('non-default relay invites require confirmation before joining', (
    WidgetTester tester,
  ) async {
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-custom-relay',
      sessionKey: 'c2Vzc2lvbl9rZXlfZm9yX2N1c3RvbV9yZWxheV8xMjM0NTY3ODk',
      appWsUrl: 'ws://127.0.0.1:8787/ws/app?sessionId=session-custom-relay',
      expiresAt: DateTime.utc(2030, 1, 1),
    );

    await tester.pumpWidget(
      const PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          localeOverride: Locale('en'),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(invite),
    );
    await tester.tap(find.byKey(const ValueKey<String>('connect-session-button')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('relay-warning-dialog')),
      findsOneWidget,
    );
    expect(find.text('Custom relay server'), findsOneWidget);
    expect(find.textContaining('127.0.0.1:8787'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey<String>('relay-warning-cancel-button')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('relay-warning-dialog')),
      findsNothing,
    );
  });
}
