import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/chat_attachment.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/models/privateclaw_slash_command.dart';
import 'package:privateclaw_app/services/privateclaw_active_session_store.dart';
import 'package:privateclaw_app/services/privateclaw_identity_store.dart';
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
      privateClawSupportsComposerSubmitShortcutForTargetPlatform(
        TargetPlatform.macOS,
      ),
      isTrue,
    );
    expect(
      privateClawSupportsComposerSubmitShortcutForTargetPlatform(
        TargetPlatform.android,
      ),
      isFalse,
    );
    expect(
      privateClawShowsAssistantDisclaimerForTargetPlatform(
        TargetPlatform.macOS,
      ),
      isTrue,
    );
    expect(
      privateClawShowsAssistantDisclaimerForTargetPlatform(
        TargetPlatform.android,
      ),
      isFalse,
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

  testWidgets('desktop composer sends the draft on Ctrl+Enter', (
    WidgetTester tester,
  ) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 4200);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final TargetPlatform Function() originalResolver =
        privateClawTargetPlatformResolver;
    final PrivateClawActiveSessionStoreFactory originalSessionStoreFactory =
        privateClawActiveSessionStoreFactory;
    final PrivateClawIdentityStoreFactory originalIdentityStoreFactory =
        privateClawIdentityStoreFactory;
    final PrivateClawSessionClientFactory originalSessionClientFactory =
        privateClawSessionClientFactory;

    privateClawTargetPlatformResolver = () => TargetPlatform.macOS;
    final DateTime now = DateTime.now().toUtc();
    final _TestIdentityStore identityStore = _TestIdentityStore(
      identity: PrivateClawIdentity(
        appId: 'pc-desktop-shortcut',
        createdAt: now.subtract(const Duration(minutes: 1)),
      ),
    );
    final List<_TrackingSessionClient> createdClients =
        <_TrackingSessionClient>[];

    privateClawActiveSessionStoreFactory = () => _TestActiveSessionStore();
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _TrackingSessionClient client = _TrackingSessionClient(
            invite,
            identity: identity,
            emitActiveOnConnect: true,
          );
          createdClients.add(client);
          return client;
        };

    addTearDown(() {
      privateClawTargetPlatformResolver = originalResolver;
      privateClawActiveSessionStoreFactory = originalSessionStoreFactory;
      privateClawIdentityStoreFactory = originalIdentityStoreFactory;
      privateClawSessionClientFactory = originalSessionClientFactory;
    });

    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-desktop-shortcut',
      sessionKey: 'desktop-shortcut-session-key',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-desktop-shortcut',
      expiresAt: now.add(const Duration(hours: 2)),
    );

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(invite),
    );
    await tester.pump();
    await tester.pump();

    expect(createdClients, hasLength(1));

    final Finder composerField = find.byKey(
      const ValueKey<String>('composer-input-field'),
    );
    await tester.tap(composerField);
    await tester.pump();
    await tester.enterText(composerField, 'Send from keyboard shortcut');
    await tester.pump();

    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await tester.pump();

    expect(createdClients.single.sentMessages, <String>[
      'Send from keyboard shortcut',
    ]);
    expect(tester.widget<TextField>(composerField).controller?.text, isEmpty);
  });

  testWidgets('desktop fullscreen composer sends the draft on Ctrl+Enter', (
    WidgetTester tester,
  ) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 4200);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final TargetPlatform Function() originalResolver =
        privateClawTargetPlatformResolver;
    final PrivateClawActiveSessionStoreFactory originalSessionStoreFactory =
        privateClawActiveSessionStoreFactory;
    final PrivateClawIdentityStoreFactory originalIdentityStoreFactory =
        privateClawIdentityStoreFactory;
    final PrivateClawSessionClientFactory originalSessionClientFactory =
        privateClawSessionClientFactory;

    privateClawTargetPlatformResolver = () => TargetPlatform.macOS;
    final DateTime now = DateTime.now().toUtc();
    final _TestIdentityStore identityStore = _TestIdentityStore(
      identity: PrivateClawIdentity(
        appId: 'pc-fullscreen-shortcut',
        createdAt: now.subtract(const Duration(minutes: 1)),
      ),
    );
    final List<_TrackingSessionClient> createdClients =
        <_TrackingSessionClient>[];

    privateClawActiveSessionStoreFactory = () => _TestActiveSessionStore();
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _TrackingSessionClient client = _TrackingSessionClient(
            invite,
            identity: identity,
            emitActiveOnConnect: true,
          );
          createdClients.add(client);
          return client;
        };

    addTearDown(() {
      privateClawTargetPlatformResolver = originalResolver;
      privateClawActiveSessionStoreFactory = originalSessionStoreFactory;
      privateClawIdentityStoreFactory = originalIdentityStoreFactory;
      privateClawSessionClientFactory = originalSessionClientFactory;
    });

    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-fullscreen-shortcut',
      sessionKey: 'fullscreen-shortcut-session-key',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-fullscreen-shortcut',
      expiresAt: now.add(const Duration(hours: 2)),
    );

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(invite),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(
      find.byKey(const ValueKey<String>('composer-expand-button')),
    );
    await tester.pumpAndSettle();

    final Finder fullscreenField = find.byKey(
      const ValueKey<String>('fullscreen-composer-input-field'),
    );
    await tester.enterText(fullscreenField, 'Send from fullscreen shortcut');
    await tester.pump();

    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await tester.pumpAndSettle();

    expect(fullscreenField, findsNothing);
    expect(createdClients.single.sentMessages, <String>[
      'Send from fullscreen shortcut',
    ]);
  });

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

  testWidgets('pasting a valid invite auto-connects without tapping join', (
    WidgetTester tester,
  ) async {
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

    final DateTime now = DateTime.now().toUtc();
    final _TestActiveSessionStore activeSessionStore =
        _TestActiveSessionStore();
    final _TestIdentityStore identityStore = _TestIdentityStore(
      identity: PrivateClawIdentity(
        appId: 'pc-auto-paste',
        createdAt: now.subtract(const Duration(minutes: 1)),
      ),
    );
    final List<_TrackingSessionClient> createdClients =
        <_TrackingSessionClient>[];

    privateClawActiveSessionStoreFactory = () => activeSessionStore;
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _TrackingSessionClient client = _TrackingSessionClient(
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

    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-auto-paste',
      sessionKey: 'session-auto-paste-key',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-auto-paste',
      expiresAt: now.add(const Duration(hours: 2)),
    );

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();

    await tester.enterText(
      find.byKey(const ValueKey<String>('invite-input-field')),
      encodePrivateClawInviteUri(invite),
    );
    await tester.pump();
    await tester.pump();

    expect(identityStore.loadOrCreateCalls, 1);
    expect(createdClients, hasLength(1));
    expect(createdClients.single.invite.sessionId, invite.sessionId);
    expect(createdClients.single.connectCalls, 1);
  });

  testWidgets('typing an invite gradually still waits for join button', (
    WidgetTester tester,
  ) async {
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

    final DateTime now = DateTime.now().toUtc();
    final _TestActiveSessionStore activeSessionStore =
        _TestActiveSessionStore();
    final _TestIdentityStore identityStore = _TestIdentityStore(
      identity: PrivateClawIdentity(
        appId: 'pc-gradual-type',
        createdAt: now.subtract(const Duration(minutes: 1)),
      ),
    );
    final List<_TrackingSessionClient> createdClients =
        <_TrackingSessionClient>[];

    privateClawActiveSessionStoreFactory = () => activeSessionStore;
    privateClawIdentityStoreFactory = () => identityStore;
    privateClawSessionClientFactory =
        (
          PrivateClawInvite invite, {
          required PrivateClawIdentity identity,
          PrivateClawPushTokenProvider? pushTokenProvider,
        }) {
          final _TrackingSessionClient client = _TrackingSessionClient(
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

    final PrivateClawInvite invite = PrivateClawInvite(
      version: 1,
      sessionId: 'session-gradual-type',
      sessionKey: 'session-gradual-type-key',
      appWsUrl:
          'wss://relay.privateclaw.us/ws/app?sessionId=session-gradual-type',
      expiresAt: now.add(const Duration(hours: 2)),
    );
    final String inviteUri = encodePrivateClawInviteUri(invite);
    final Finder inviteField = find.byKey(
      const ValueKey<String>('invite-input-field'),
    );

    await tester.pumpWidget(
      const PrivateClawApp(skipNotificationsInDebug: true),
    );
    await tester.pump();

    String typedInvite = '';
    for (final int codeUnit in inviteUri.codeUnits) {
      typedInvite += String.fromCharCode(codeUnit);
      await tester.enterText(inviteField, typedInvite);
      await tester.pump();
    }

    expect(identityStore.loadOrCreateCalls, 0);
    expect(createdClients, isEmpty);

    await tester.tap(
      find.byKey(const ValueKey<String>('connect-session-button')),
    );
    await tester.pump();
    await tester.pump();

    expect(identityStore.loadOrCreateCalls, 1);
    expect(createdClients, hasLength(1));
    expect(createdClients.single.invite.sessionId, invite.sessionId);
    expect(createdClients.single.connectCalls, 1);
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

class _TestActiveSessionStore extends PrivateClawActiveSessionStore {
  final List<PrivateClawActiveSessionRecord> savedRecords =
      <PrivateClawActiveSessionRecord>[];
  String? currentSessionId;

  @override
  Future<PrivateClawActiveSessionRecord?> load() async => null;

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

class _TestIdentityStore extends PrivateClawIdentityStore {
  _TestIdentityStore({required this.identity});

  final PrivateClawIdentity identity;
  int loadOrCreateCalls = 0;

  @override
  Future<PrivateClawIdentity> loadOrCreate() async {
    loadOrCreateCalls += 1;
    return identity;
  }

  @override
  Future<void> save(PrivateClawIdentity identity) async {}
}

class _TrackingSessionClient extends PrivateClawSessionClient {
  _TrackingSessionClient(
    super.invite, {
    required super.identity,
    this.emitActiveOnConnect = false,
  });

  final StreamController<PrivateClawSessionEvent> _eventsController =
      StreamController<PrivateClawSessionEvent>.broadcast();
  final bool emitActiveOnConnect;
  int connectCalls = 0;
  final List<String> sentMessages = <String>[];

  @override
  Stream<PrivateClawSessionEvent> get events => _eventsController.stream;

  @override
  Future<void> connect() async {
    connectCalls += 1;
    if (emitActiveOnConnect) {
      _eventsController.add(
        const PrivateClawSessionEvent(
          connectionStatus: PrivateClawSessionStatus.active,
        ),
      );
    }
  }

  @override
  Future<void> refreshPushRegistration() async {}

  @override
  Future<void> sendUserMessage(
    String text, {
    List<ChatAttachment> attachments = const <ChatAttachment>[],
  }) async {
    sentMessages.add(text.trim());
  }

  @override
  Future<void> dispose({
    String reason = 'client_closed',
    bool notifyRemote = true,
  }) async {
    await _eventsController.close();
  }
}
