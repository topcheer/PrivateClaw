import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/models/privateclaw_slash_command.dart';
import 'package:privateclaw_app/services/privateclaw_platform_utils.dart';
import 'package:privateclaw_app/services/privateclaw_quick_actions.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';
import 'package:privateclaw_app/store_screenshot_preview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'test_support/privateclaw_directory_overrides.dart';

class _FakePrivateClawQuickActions implements PrivateClawQuickActions {
  PrivateClawQuickActionHandler? _handler;
  List<PrivateClawShortcutItem> items = const <PrivateClawShortcutItem>[];

  bool get isInitialized => _handler != null;

  @override
  Future<void> clearShortcutItems() async {
    items = const <PrivateClawShortcutItem>[];
  }

  @override
  Future<void> initialize(PrivateClawQuickActionHandler handler) async {
    _handler = handler;
  }

  @override
  Future<void> setShortcutItems(List<PrivateClawShortcutItem> nextItems) async {
    items = List<PrivateClawShortcutItem>.unmodifiable(nextItems);
  }

  Future<void> trigger(String type) async {
    final PrivateClawQuickActionHandler? handler = _handler;
    if (handler == null) {
      throw StateError('Quick actions handler has not been initialized.');
    }
    handler(type);
  }
}

Opacity _nearestOpacityFor(WidgetTester tester, Finder target) {
  return tester.widget<Opacity>(
    find.ancestor(of: target, matching: find.byType(Opacity)).first,
  );
}

void main() {
  setUp(() {
    installPrivateClawTestDirectoryOverrides();
  });

  test('notification bootstrap is skipped for preview launches', () {
    expect(
      privateClawShouldSkipNotificationsInDebug(
        debugSkipNotifications: false,
        screenshotConfig: const StoreScreenshotConfig(),
      ),
      isFalse,
    );
    expect(
      privateClawShouldSkipNotificationsInDebug(
        debugSkipNotifications: true,
        screenshotConfig: const StoreScreenshotConfig(),
      ),
      isTrue,
    );
    expect(
      privateClawShouldSkipNotificationsInDebug(
        debugSkipNotifications: false,
        screenshotConfig: const StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            status: PrivateClawSessionStatus.idle,
            statusText: 'Preview',
          ),
        ),
      ),
      isTrue,
    );
  });

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
      expect(
        find.byKey(const ValueKey<String>('composer-file-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('voice-record-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('emoji-picker-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('composer-photo-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('composer-expand-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('composer-send-button')),
        findsOneWidget,
      );
      expect(find.text('privateclaw.us'), findsOneWidget);

      final TextField composerField = tester.widget<TextField>(
        find.byKey(const ValueKey<String>('composer-input-field')),
      );
      expect(composerField.minLines, 1);
      expect(composerField.maxLines, 4);
    },
  );

  test('desktop capability helpers keep desktop session and voice support', () {
    expect(
      privateClawSupportsVoiceRecordingForTargetPlatform(
        TargetPlatform.android,
      ),
      isTrue,
    );
    expect(
      privateClawSupportsVoiceRecordingForTargetPlatform(TargetPlatform.macOS),
      isTrue,
    );
    expect(
      privateClawSupportsVoiceRecordingForTargetPlatform(
        TargetPlatform.windows,
      ),
      isTrue,
    );
    expect(
      privateClawUsesTapToToggleVoiceRecordingForTargetPlatform(
        TargetPlatform.windows,
      ),
      isTrue,
    );
    expect(
      privateClawUsesTapToToggleVoiceRecordingForTargetPlatform(
        TargetPlatform.macOS,
      ),
      isFalse,
    );
    expect(
      privateClawShouldAutoSendPickedAttachmentsForTargetPlatform(
        TargetPlatform.windows,
      ),
      isTrue,
    );
    expect(
      privateClawShouldAutoSendPickedAttachmentsForTargetPlatform(
        TargetPlatform.macOS,
      ),
      isFalse,
    );
    expect(
      privateClawSupportsRecentPhotoTrayForTargetPlatform(TargetPlatform.iOS),
      isTrue,
    );
    expect(
      privateClawSupportsRecentPhotoTrayForTargetPlatform(
        TargetPlatform.windows,
      ),
      isFalse,
    );
    expect(
      privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(
        TargetPlatform.macOS,
      ),
      isTrue,
    );
    expect(
      privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(
        TargetPlatform.android,
      ),
      isFalse,
    );
    expect(
      privateClawShouldShowLocalNotificationForLifecycleState(
        platform: TargetPlatform.macOS,
        state: AppLifecycleState.hidden,
      ),
      isTrue,
    );
    expect(
      privateClawShouldShowLocalNotificationForLifecycleState(
        platform: TargetPlatform.macOS,
        state: AppLifecycleState.resumed,
      ),
      isFalse,
    );
    expect(
      privateClawShouldSuspendLiveSession(
        platform: TargetPlatform.android,
        state: AppLifecycleState.hidden,
      ),
      isTrue,
    );
    expect(
      privateClawShouldSuspendLiveSession(
        platform: TargetPlatform.macOS,
        state: AppLifecycleState.hidden,
      ),
      isFalse,
    );
  });

  testWidgets(
    'desktop home screen keeps desktop voice and attachment buttons',
    (WidgetTester tester) async {
      final TargetPlatform Function() originalResolver =
          privateClawTargetPlatformResolver;
      privateClawTargetPlatformResolver = () => TargetPlatform.macOS;
      addTearDown(() {
        privateClawTargetPlatformResolver = originalResolver;
      });

      await tester.pumpWidget(const PrivateClawApp());

      expect(
        find.byKey(const ValueKey<String>('voice-record-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('composer-photo-button')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('composer-file-button')),
        findsOneWidget,
      );
      expect(
        _nearestOpacityFor(
          tester,
          find.byKey(const ValueKey<String>('composer-photo-button')),
        ).opacity,
        0.45,
      );
      expect(
        _nearestOpacityFor(
          tester,
          find.byKey(const ValueKey<String>('composer-file-button')),
        ).opacity,
        0.45,
      );

      await tester.tap(
        find.byKey(const ValueKey<String>('composer-file-button')),
      );
      await tester.pump();
      expect(
        find.text('Wait for the session to finish connecting…'),
        findsWidgets,
      );
    },
  );

  testWidgets('desktop scan button falls back to manual invite entry', (
    WidgetTester tester,
  ) async {
    final TargetPlatform Function() originalResolver =
        privateClawTargetPlatformResolver;
    privateClawTargetPlatformResolver = () => TargetPlatform.windows;
    addTearDown(() {
      privateClawTargetPlatformResolver = originalResolver;
    });

    bool launchedScanner = false;
    await tester.pumpWidget(
      PrivateClawApp(
        scannerSheetLauncher:
            (BuildContext context, Widget? previewOverride) async {
              launchedScanner = true;
              return null;
            },
      ),
    );

    await tester.tap(find.text('Scan QR code').first);
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('voice-record-button')),
      findsOneWidget,
    );
    expect(launchedScanner, isFalse);
    expect(
      find.text(
        'Live camera scanning is unavailable here. Choose a photo instead, or paste the invite link.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('windows voice button uses tap-to-record tooltip', (
    WidgetTester tester,
  ) async {
    final TargetPlatform Function() originalResolver =
        privateClawTargetPlatformResolver;
    privateClawTargetPlatformResolver = () => TargetPlatform.windows;
    addTearDown(() {
      privateClawTargetPlatformResolver = originalResolver;
    });

    await tester.pumpWidget(const PrivateClawApp());

    final Finder voiceButton = find.byKey(
      const ValueKey<String>('voice-record-button'),
    );
    expect(voiceButton, findsOneWidget);
    expect(
      tester
          .widget<Tooltip>(
            find.ancestor(of: voiceButton, matching: find.byType(Tooltip)),
          )
          .message,
      'Tap to start recording',
    );
    expect(_nearestOpacityFor(tester, voiceButton).opacity, 0.45);
  });

  testWidgets('connection status page opens privateclaw.us', (
    WidgetTester tester,
  ) async {
    final PrivateClawUrlLauncher originalLauncher = privateClawWebsiteLauncher;
    Uri? launchedUrl;
    LaunchMode? launchedMode;
    addTearDown(() {
      privateClawWebsiteLauncher = originalLauncher;
    });
    privateClawWebsiteLauncher =
        (Uri url, {LaunchMode mode = LaunchMode.platformDefault}) async {
          launchedUrl = url;
          launchedMode = mode;
          return true;
        };

    await tester.pumpWidget(const PrivateClawApp());

    await tester.tap(
      find.byKey(const ValueKey<String>('plugin-install-site-link')),
    );
    await tester.pump();

    expect(launchedUrl, Uri.parse('https://privateclaw.us'));
    expect(launchedMode, LaunchMode.externalApplication);
  });

  testWidgets('launcher quick action opens the QR scanner sheet', (
    WidgetTester tester,
  ) async {
    final _FakePrivateClawQuickActions quickActions =
        _FakePrivateClawQuickActions();
    bool didLaunchScanner = false;

    await tester.pumpWidget(
      PrivateClawApp(
        quickActions: quickActions,
        scannerSheetLauncher:
            (BuildContext context, Widget? previewOverride) async {
              didLaunchScanner = true;
              return null;
            },
      ),
    );
    await tester.pumpAndSettle();

    expect(quickActions.isInitialized, isTrue);
    expect(quickActions.items, hasLength(1));
    expect(quickActions.items.single.type, privateClawScanQrShortcutType);

    await quickActions.trigger(privateClawScanQrShortcutType);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(didLaunchScanner, isTrue);
  });

  testWidgets('fullscreen composer matches inline styling and top alignment', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-fullscreen',
      sessionKey: 'test-session-key',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-fullscreen',
      expiresAt: now.add(const Duration(hours: 1)),
    );

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            invite: invite,
            identity: PrivateClawIdentity(
              appId: 'app-fullscreen',
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

    await tester.tap(
      find.byKey(const ValueKey<String>('composer-expand-button')),
    );
    await tester.pumpAndSettle();

    final TextField fullscreenComposerField = tester.widget<TextField>(
      find.byKey(const ValueKey<String>('fullscreen-composer-input-field')),
    );
    expect(
      fullscreenComposerField.textAlignVertical,
      equals(TextAlignVertical.top),
    );
    expect(fullscreenComposerField.decoration?.border, InputBorder.none);
    expect(fullscreenComposerField.decoration?.focusedBorder, InputBorder.none);

    final DecoratedBox fullscreenComposerShell = tester.widget<DecoratedBox>(
      find.byKey(const ValueKey<String>('fullscreen-composer-shell')),
    );
    final BoxDecoration shellDecoration =
        fullscreenComposerShell.decoration as BoxDecoration;
    expect(
      shellDecoration.color,
      equals(
        Theme.of(
          tester.element(find.byType(TextField).first),
        ).colorScheme.surfaceContainerHighest,
      ),
    );
    expect(shellDecoration.borderRadius, BorderRadius.circular(24));
    expect(shellDecoration.border, isNull);
  });

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
      expect(find.text('privateclaw.us'), findsOneWidget);
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
    await tester.enterText(
      find.byKey(const ValueKey<String>('composer-input-field')),
      '/',
    );
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

  testWidgets('composer keeps hold-to-record and inline actions visible', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-voice',
      sessionKey: 'test-session-key',
      appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-voice',
      expiresAt: now.add(const Duration(hours: 1)),
    );

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            invite: invite,
            identity: PrivateClawIdentity(
              appId: 'app-voice',
              createdAt: now.subtract(const Duration(days: 1)),
              displayName: 'Voice Preview',
            ),
            status: PrivateClawSessionStatus.active,
            statusText: 'Connected.',
            isPairingPanelCollapsed: true,
          ),
          localeOverride: const Locale('en'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('voice-record-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('emoji-picker-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('composer-photo-button')),
      findsOneWidget,
    );
  });

  testWidgets('emoji picker renders inline instead of opening a modal sheet', (
    WidgetTester tester,
  ) async {
    final DateTime now = DateTime.now().toUtc();
    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-emoji',
      sessionKey: 'test-session-key',
      appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-emoji',
      expiresAt: now.add(const Duration(hours: 1)),
    );

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: PrivateClawPreviewData(
            invite: invite,
            identity: PrivateClawIdentity(
              appId: 'app-emoji',
              createdAt: now.subtract(const Duration(days: 1)),
              displayName: 'Emoji Preview',
            ),
            status: PrivateClawSessionStatus.active,
            statusText: 'Connected.',
            isPairingPanelCollapsed: true,
          ),
          localeOverride: const Locale('en'),
        ),
      ),
    );

    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey<String>('emoji-picker-button')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('emoji-picker-panel')),
      findsOneWidget,
    );
    expect(find.text('Common emoji'), findsOneWidget);
    expect(find.text('Frequent'), findsOneWidget);
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
        screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(invite),
    );
    await tester.tap(
      find.byKey(const ValueKey<String>('connect-session-button')),
    );
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

  testWidgets(
    'non-default relay announcement text is parsed when it contains a full invite link',
    (WidgetTester tester) async {
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'session-custom-relay-text',
        sessionKey:
            'c2Vzc2lvbl9rZXlfZm9yX2N1c3RvbV9yZWxheV90ZXh0XzEyMzQ1Njc4OQ',
        appWsUrl:
            'ws://127.0.0.1:8787/ws/app?sessionId=session-custom-relay-text',
        expiresAt: DateTime.utc(2030, 1, 1),
      );

      await tester.pumpWidget(
        const PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(localeOverride: Locale('en')),
        ),
      );

      await tester.enterText(
        find.byKey(const ValueKey<String>('invite-input-field')),
        '''
PrivateClaw session copied from chat:
邀请链接 / Invite URI: <${encodePrivateClawInviteUri(invite)}>
Open it before it expires.
''',
      );
      await tester.tap(
        find.byKey(const ValueKey<String>('connect-session-button')),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('relay-warning-dialog')),
        findsOneWidget,
      );
      expect(find.text('Custom relay server'), findsOneWidget);
      expect(find.textContaining('127.0.0.1:8787'), findsOneWidget);
    },
  );
}
