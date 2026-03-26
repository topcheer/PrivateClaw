import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:photo_manager/photo_manager.dart';
import 'package:url_launcher/url_launcher.dart';

import 'l10n/app_localizations.dart';
import 'models/chat_attachment.dart';
import 'models/chat_message.dart';
import 'models/chat_message_timeline.dart';
import 'models/privateclaw_identity.dart';
import 'models/privateclaw_invite.dart';
import 'models/privateclaw_participant.dart';
import 'models/privateclaw_slash_command.dart';
import 'services/privateclaw_active_session_store.dart';
import 'services/privateclaw_audio_recorder.dart';
import 'services/privateclaw_debug_bootstrap.dart';
import 'services/privateclaw_emoji_store.dart';
import 'services/privateclaw_identity_store.dart';
import 'services/privateclaw_firebase_options.dart';
import 'services/privateclaw_notification_service.dart';
import 'services/privateclaw_quick_actions.dart';
import 'services/privateclaw_session_client.dart';
import 'store_screenshot_preview.dart';
import 'widgets/chat_message_bubble.dart';
import 'widgets/invite_scanner_sheet.dart';
import 'widgets/privateclaw_avatar.dart';
import 'widgets/session_qr_sheet.dart';

const int _maxInlineAttachmentBytes = 5 * 1024 * 1024;
const Duration _sessionRenewWarningThreshold = Duration(minutes: 30);
const String _sessionRenewCommandSlash = '/renew-session';
const double _voiceCancelActivationDistance = 120;
const int _maxFrequentEmoji = 18;
const int _recentPhotoPageSize = 48;
const double _photoTrayHeight = 188;
const double _recordingPanelHeight = 280;
const String _privateClawWebsiteUrl = 'https://privateclaw.us';
const List<String> _defaultEmoji = <String>[
  '😀',
  '😁',
  '😂',
  '🤣',
  '🥹',
  '😊',
  '😍',
  '😘',
  '😎',
  '🤔',
  '🤨',
  '😴',
  '😭',
  '😡',
  '😮',
  '🥳',
  '🤗',
  '🤝',
  '👍',
  '👎',
  '🙏',
  '👏',
  '💪',
  '🙌',
  '👀',
  '🎉',
  '🔥',
  '❤️',
  '💙',
  '💚',
  '🫶',
  '💯',
  '✨',
  '🤖',
  '🦀',
  '🐾',
  '🐶',
  '🐱',
  '🦊',
  '🐼',
  '🐳',
  '🌙',
  '☀️',
  '⭐',
  '🍀',
  '🌈',
  '☕',
  '🎵',
  '📸',
  '💡',
];

enum _EmojiPickerTab { frequent, defaults }

typedef PrivateClawUrlLauncher =
    Future<bool> Function(Uri url, {LaunchMode mode});

typedef PrivateClawActiveSessionStoreFactory =
    PrivateClawActiveSessionStore Function();

typedef PrivateClawIdentityStoreFactory = PrivateClawIdentityStore Function();

typedef PrivateClawSessionClientFactory =
    PrivateClawSessionClient Function(
      PrivateClawInvite invite, {
      required PrivateClawIdentity identity,
      PrivateClawPushTokenProvider? pushTokenProvider,
    });

Future<bool> _defaultPrivateClawWebsiteLauncher(
  Uri url, {
  LaunchMode mode = LaunchMode.platformDefault,
}) {
  return launchUrl(url, mode: mode);
}

PrivateClawUrlLauncher privateClawWebsiteLauncher =
    _defaultPrivateClawWebsiteLauncher;

PrivateClawActiveSessionStoreFactory privateClawActiveSessionStoreFactory =
    () => const PrivateClawActiveSessionStore();

PrivateClawIdentityStoreFactory privateClawIdentityStoreFactory = () =>
    const PrivateClawIdentityStore();

PrivateClawSessionClientFactory privateClawSessionClientFactory =
    (
      PrivateClawInvite invite, {
      required PrivateClawIdentity identity,
      PrivateClawPushTokenProvider? pushTokenProvider,
    }) => PrivateClawSessionClient(
      invite,
      identity: identity,
      pushTokenProvider: pushTokenProvider,
    );

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final StoreScreenshotConfig screenshotConfig =
      StoreScreenshotConfig.fromEnvironment();
  final bool skipNotificationsInDebug =
      privateClawShouldSkipNotificationsInDebug(
        debugSkipNotifications:
            loadPrivateClawDebugSkipNotificationsFromEnvironment(),
        screenshotConfig: screenshotConfig,
      );
  if (!skipNotificationsInDebug) {
    if (privateClawSupportsFirebasePushOnCurrentPlatform()) {
      FirebaseMessaging.onBackgroundMessage(
        privateClawBackgroundMessageHandler,
      );
    }
    await PrivateClawNotificationService.instance.bootstrap();
  }
  runApp(
    PrivateClawApp(
      screenshotConfig: screenshotConfig,
      skipNotificationsInDebug: skipNotificationsInDebug,
    ),
  );
}

bool privateClawShouldSkipNotificationsInDebug({
  required bool debugSkipNotifications,
  required StoreScreenshotConfig screenshotConfig,
}) {
  return debugSkipNotifications || screenshotConfig.previewData != null;
}

bool privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.macOS ||
      platform == TargetPlatform.windows ||
      platform == TargetPlatform.linux;
}

bool privateClawShouldSuspendLiveSession({
  required TargetPlatform platform,
  required AppLifecycleState state,
}) {
  if (privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(platform)) {
    return false;
  }
  return state == AppLifecycleState.paused ||
      state == AppLifecycleState.hidden ||
      state == AppLifecycleState.detached;
}

bool privateClawShouldShowLocalNotificationForLifecycleState({
  required TargetPlatform platform,
  required AppLifecycleState state,
}) {
  return platform == TargetPlatform.macOS && state != AppLifecycleState.resumed;
}

bool privateClawSupportsVoiceRecordingForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.android ||
      platform == TargetPlatform.iOS ||
      platform == TargetPlatform.macOS ||
      platform == TargetPlatform.windows;
}

bool privateClawUsesTapToToggleVoiceRecordingForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.windows;
}

bool privateClawShouldAutoSendPickedAttachmentsForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.windows;
}

bool privateClawSupportsRecentPhotoTrayForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.android || platform == TargetPlatform.iOS;
}

TargetPlatform Function() privateClawTargetPlatformResolver = () =>
    defaultTargetPlatform;

typedef PrivateClawScannerSheetLauncher =
    Future<String?> Function(BuildContext context, Widget? previewOverride);

class PrivateClawApp extends StatelessWidget {
  const PrivateClawApp({
    super.key,
    this.screenshotConfig = const StoreScreenshotConfig(),
    this.skipNotificationsInDebug = false,
    this.quickActions = const SystemPrivateClawQuickActions(),
    this.inviteScannerPreviewOverride,
    this.scannerSheetLauncher,
  });

  final StoreScreenshotConfig screenshotConfig;
  final bool skipNotificationsInDebug;
  final PrivateClawQuickActions quickActions;
  final Widget? inviteScannerPreviewOverride;
  final PrivateClawScannerSheetLauncher? scannerSheetLauncher;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (BuildContext context) =>
          AppLocalizations.of(context)!.appTitle,
      debugShowCheckedModeBanner: false,
      locale: screenshotConfig.localeOverride,
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF5D5FEF)),
        useMaterial3: true,
      ),
      home: PrivateClawHomePage(
        previewData: screenshotConfig.previewData,
        skipNotificationsInDebug: skipNotificationsInDebug,
        quickActions: quickActions,
        inviteScannerPreviewOverride: inviteScannerPreviewOverride,
        scannerSheetLauncher: scannerSheetLauncher,
      ),
    );
  }
}

class PrivateClawHomePage extends StatefulWidget {
  const PrivateClawHomePage({
    super.key,
    this.previewData,
    this.skipNotificationsInDebug = false,
    this.quickActions = const SystemPrivateClawQuickActions(),
    this.inviteScannerPreviewOverride,
    this.scannerSheetLauncher,
  });

  final PrivateClawPreviewData? previewData;
  final bool skipNotificationsInDebug;
  final PrivateClawQuickActions quickActions;
  final Widget? inviteScannerPreviewOverride;
  final PrivateClawScannerSheetLauncher? scannerSheetLauncher;

  @override
  State<PrivateClawHomePage> createState() => _PrivateClawHomePageState();
}

class _PrivateClawHomePageState extends State<PrivateClawHomePage>
    with WidgetsBindingObserver {
  final PrivateClawActiveSessionStore _activeSessionStore =
      privateClawActiveSessionStoreFactory();
  final PrivateClawIdentityStore _identityStore =
      privateClawIdentityStoreFactory();
  final PrivateClawEmojiStore _emojiStore = const PrivateClawEmojiStore();
  final PrivateClawNotificationService _notificationService =
      PrivateClawNotificationService.instance;
  final ImagePicker _imagePicker = ImagePicker();
  final TextEditingController _inviteController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();
  final FocusNode _composerFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessage> _messages = <ChatMessage>[];
  final List<ChatAttachment> _selectedAttachments = <ChatAttachment>[];
  final List<PrivateClawSlashCommand> _availableCommands =
      <PrivateClawSlashCommand>[];
  final List<PrivateClawParticipant> _participants = <PrivateClawParticipant>[];
  final List<AssetEntity> _recentPhotoAssets = <AssetEntity>[];
  final Map<String, Future<Uint8List?>> _photoThumbnailFutures =
      <String, Future<Uint8List?>>{};
  final Map<String, String> _photoAttachmentIdsByAssetId = <String, String>{};
  final Set<String> _loadingPhotoAssetIds = <String>{};

  PrivateClawInvite? _invite;
  PrivateClawSessionClient? _client;
  StreamSubscription<PrivateClawSessionEvent>? _clientSubscription;
  PrivateClawSessionStatus _sessionStatus = PrivateClawSessionStatus.idle;
  String _statusText = '';
  bool _isPairingPanelCollapsed = false;
  bool _hasConnectedSession = false;
  int _attachmentCounter = 0;
  PrivateClawIdentity? _identity;
  Timer? _sessionExpiryRefreshTimer;
  bool _isRenewingSession = false;
  bool _isRecordingVoice = false;
  bool _isStoppingVoiceRecording = false;
  Future<void>? _voiceRecordingStartFuture;
  bool _isEmojiPickerVisible = false;
  _EmojiPickerTab _emojiPickerTab = _EmojiPickerTab.frequent;
  bool _isPhotoTrayVisible = false;
  bool _isLoadingRecentPhotos = false;
  String _photoTrayStatusText = '';
  bool _isScannerSheetOpen = false;
  bool _hasCompletedFirstFrame = false;
  bool _hasPendingQuickActionScan = false;
  Timer? _voiceRecordingTicker;
  Duration _voiceRecordingElapsed = Duration.zero;
  int _voiceRecordingTick = 0;
  Map<String, int> _emojiUsage = <String, int>{};
  double _lastKeyboardInsetHeight = 320;
  Offset? _voiceHoldStartGlobalPosition;
  bool _isVoiceCancelArmed = false;
  bool _isSlashCommandsSheetOpen = false;
  bool _hasInitializedQuickActions = false;
  Locale? _configuredQuickActionsLocale;
  String _previousComposerText = '';
  final PrivateClawDebugPendingInviteData? _debugPendingInvite =
      loadPrivateClawDebugPendingInviteFromEnvironment();
  AppLifecycleState _appLifecycleState = AppLifecycleState.resumed;
  Future<void>? _pendingRestoreSessionFuture;

  bool get _canSend => _sessionStatus == PrivateClawSessionStatus.active;
  bool get _hasPendingReply =>
      _messages.any((ChatMessage message) => message.isPending);
  bool get _hasDraftContent =>
      _messageController.text.trim().isNotEmpty ||
      _selectedAttachments.isNotEmpty;
  bool get _hasSessionSetup => _invite != null;
  bool get _hasManagedSessionContext =>
      _invite != null &&
      (_hasConnectedSession ||
          _sessionStatus == PrivateClawSessionStatus.active ||
          _sessionStatus == PrivateClawSessionStatus.reconnecting ||
          _sessionStatus == PrivateClawSessionStatus.relayAttached);
  bool get _canCollapsePairingPanel => _hasManagedSessionContext;
  bool get _canShowSessionQr => _hasManagedSessionContext;
  bool get _isPreviewMode => widget.previewData != null;
  TargetPlatform get _targetPlatform => privateClawTargetPlatformResolver();
  bool get _supportsVoiceRecording =>
      privateClawSupportsVoiceRecordingForTargetPlatform(_targetPlatform);
  bool get _usesTapToToggleVoiceRecording =>
      privateClawUsesTapToToggleVoiceRecordingForTargetPlatform(
        _targetPlatform,
      );
  bool get _shouldAutoSendPickedAttachments =>
      privateClawShouldAutoSendPickedAttachmentsForTargetPlatform(
        _targetPlatform,
      );
  bool get _supportsRecentPhotoTray =>
      privateClawSupportsRecentPhotoTrayForTargetPlatform(_targetPlatform);
  bool get _supportsInviteScanner =>
      privateClawSupportsInviteScannerForTargetPlatform(_targetPlatform);
  bool get _hasLiveSessionContext =>
      _invite != null &&
      (_hasConnectedSession ||
          _sessionStatus == PrivateClawSessionStatus.active ||
          _sessionStatus == PrivateClawSessionStatus.reconnecting ||
          _sessionStatus == PrivateClawSessionStatus.relayAttached);
  List<String> get _frequentEmoji {
    final List<String> seeded = _defaultEmoji.take(_maxFrequentEmoji).toList();
    final List<MapEntry<String, int>> ranked = _emojiUsage.entries.toList()
      ..sort((MapEntry<String, int> left, MapEntry<String, int> right) {
        final int usageOrder = right.value.compareTo(left.value);
        if (usageOrder != 0) {
          return usageOrder;
        }
        final int leftIndex = _defaultEmoji.indexOf(left.key);
        final int rightIndex = _defaultEmoji.indexOf(right.key);
        return leftIndex.compareTo(rightIndex);
      });
    for (final MapEntry<String, int> entry in ranked) {
      if (entry.value <= 0 || !_defaultEmoji.contains(entry.key)) {
        continue;
      }
      seeded.remove(entry.key);
      seeded.insert(0, entry.key);
    }
    return seeded.take(_maxFrequentEmoji).toList(growable: false);
  }

  PrivateClawSlashCommand? get _sessionRenewCommand {
    for (final PrivateClawSlashCommand command in _availableCommands) {
      if (command.slash == _sessionRenewCommandSlash) {
        return command;
      }
    }
    return null;
  }

  Duration? get _sessionRemainingDuration {
    final PrivateClawInvite? invite = _invite;
    if (invite == null) {
      return null;
    }
    final Duration remaining = invite.expiresAt.difference(
      DateTime.now().toUtc(),
    );
    if (remaining <= Duration.zero) {
      return null;
    }
    return remaining;
  }

  String? get _currentRelayLabel {
    final PrivateClawInvite? invite = _invite;
    return invite?.relayDisplayLabel;
  }

  bool get _showsSessionRenewPrompt {
    final Duration? remaining = _sessionRemainingDuration;
    return _hasLiveSessionContext &&
        remaining != null &&
        remaining <= _sessionRenewWarningThreshold &&
        _sessionRenewCommand != null;
  }

  bool get _canSendSessionRenewCommand =>
      _client != null &&
      _sessionStatus == PrivateClawSessionStatus.active &&
      !_isRenewingSession &&
      _showsSessionRenewPrompt;

  Widget _buildRelayServerInfo(BuildContext context) {
    final String? relayLabel = _currentRelayLabel;
    if (relayLabel == null || relayLabel.isEmpty) {
      return const SizedBox.shrink();
    }
    final TextStyle? style = Theme.of(context).textTheme.bodySmall;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: <Widget>[
          const Icon(Icons.cloud_outlined, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              relayLabel,
              key: const ValueKey<String>('relay-server-label'),
              style: style,
            ),
          ),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _hasCompletedFirstFrame = true;
      if (!mounted || !_hasPendingQuickActionScan) {
        return;
      }
      _hasPendingQuickActionScan = false;
      unawaited(_openScanner());
    });
    if (!_isPreviewMode) {
      unawaited(_initializeQuickActions());
    }
    unawaited(_loadEmojiUsage());
    final PrivateClawPreviewData? previewData = widget.previewData;
    if (previewData != null) {
      _applyPreview(previewData);
      _scheduleSessionExpiryRefresh();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scheduleScrollToBottom();
      });
    } else if (_debugPendingInvite != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final PrivateClawDebugPendingInviteData? pendingInvite =
            _debugPendingInvite;
        if (!mounted || pendingInvite == null) {
          return;
        }
        _inviteController.text = pendingInvite.inviteInput;
        unawaited(
          _connectFromInput(
            pendingInvite.inviteInput,
            autoApproveNonDefaultRelayWarning:
                pendingInvite.autoApproveRelayWarning,
          ),
        );
      });
    } else {
      unawaited(_restoreActiveSessionIfAvailable());
    }
    _messageController.addListener(_handleComposerChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_statusText.isEmpty) {
      _statusText = AppLocalizations.of(context)!.initialStatus;
    }
    _configureQuickActionsForLocale();
  }

  @override
  void didUpdateWidget(covariant PrivateClawHomePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.previewData != widget.previewData &&
        widget.previewData != null) {
      _applyPreview(widget.previewData!);
      _scheduleSessionExpiryRefresh();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scheduleScrollToBottom();
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_cancelVoiceRecording(updateStatus: false, setUiState: false));
    unawaited(_disposeClient(reason: 'widget_disposed', notifyRemote: false));
    _sessionExpiryRefreshTimer?.cancel();
    _voiceRecordingTicker?.cancel();
    _recentPhotoAssets.clear();
    _photoThumbnailFutures.clear();
    _photoAttachmentIdsByAssetId.clear();
    _loadingPhotoAssetIds.clear();
    _inviteController.dispose();
    _composerFocusNode.dispose();
    _messageController
      ..removeListener(_handleComposerChanged)
      ..dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appLifecycleState = state;
    if (_isPreviewMode) {
      return;
    }

    if (state == AppLifecycleState.resumed) {
      final PrivateClawSessionClient? client = _client;
      if (client != null) {
        unawaited(client.refreshPushRegistration());
        return;
      }

      unawaited(_resumeSuspendedSessionIfAvailable());
      return;
    }

    if (!privateClawShouldSuspendLiveSession(
      platform: _targetPlatform,
      state: state,
    )) {
      return;
    }

    if (_isRecordingVoice || _isStoppingVoiceRecording) {
      unawaited(_cancelVoiceRecording(updateStatus: false));
    }
    unawaited(_suspendActiveSessionForBackground());
  }

  Future<void> _suspendActiveSessionForBackground() async {
    final PrivateClawSessionClient? client = _client;
    if (client == null) {
      return;
    }

    debugPrint('[privateclaw-app] suspending live session for background');
    await _persistActiveSessionIfAvailable();
    if (!mounted) {
      return;
    }

    final AppLocalizations l10n = AppLocalizations.of(context)!;
    setState(() {
      _sessionStatus = PrivateClawSessionStatus.reconnecting;
      _statusText = l10n.relayConnecting;
      _isPairingPanelCollapsed = true;
      _isRenewingSession = false;
    });
    await _disposeClient(reason: 'app_backgrounded', notifyRemote: false);
  }

  Future<void> _resumeSuspendedSessionIfAvailable() async {
    if (_client != null || _isPreviewMode) {
      return;
    }

    final PrivateClawInvite? invite = _invite;
    final PrivateClawIdentity? identity = _identity;
    if (invite != null && identity != null && _hasConnectedSession) {
      debugPrint(
        '[privateclaw-app] resuming suspended session '
        'session=${invite.sessionId}',
      );
      await _connectToInvite(
        invite: invite,
        identity: identity,
        inviteInput: _inviteController.text.isNotEmpty
            ? _inviteController.text
            : encodePrivateClawInviteUri(invite),
        resetConversationState: false,
        collapsePairingPanel: true,
      );
      return;
    }

    await _restoreActiveSessionIfAvailable();
  }

  void _handleComposerChanged() {
    if (!mounted) {
      return;
    }
    final String currentText = _messageController.text;
    final String previousText = _previousComposerText;
    _previousComposerText = currentText;
    setState(() {});

    final bool shouldAutoOpenSlashCommands =
        _canSend &&
        !_isSlashCommandsSheetOpen &&
        _availableCommands.isNotEmpty &&
        previousText.isEmpty &&
        currentText == '/';
    if (shouldAutoOpenSlashCommands) {
      unawaited(_openSlashCommands());
    }
  }

  void _applyPreview(PrivateClawPreviewData previewData) {
    _identity = previewData.identity;
    _invite = previewData.invite;
    _messages
      ..clear()
      ..addAll(previewData.messages);
    _selectedAttachments
      ..clear()
      ..addAll(previewData.selectedAttachments);
    _availableCommands
      ..clear()
      ..addAll(previewData.availableCommands);
    _participants
      ..clear()
      ..addAll(previewData.participants);
    _sessionStatus = previewData.status;
    _statusText = previewData.statusText;
    _isPairingPanelCollapsed = previewData.isPairingPanelCollapsed;
    _hasConnectedSession =
        previewData.invite != null &&
        (previewData.isPairingPanelCollapsed ||
            previewData.status == PrivateClawSessionStatus.active ||
            previewData.status == PrivateClawSessionStatus.reconnecting ||
            previewData.status == PrivateClawSessionStatus.relayAttached);
    _inviteController.text = previewData.inviteInput;
    _messageController.value = TextEditingValue(
      text: previewData.composerDraftText,
      selection: TextSelection.collapsed(
        offset: previewData.composerDraftText.length,
      ),
    );
    _previousComposerText = previewData.composerDraftText;
  }

  Future<void> _disposeClient({
    String reason = 'user_left',
    bool notifyRemote = true,
  }) async {
    await _clientSubscription?.cancel();
    _clientSubscription = null;

    final PrivateClawSessionClient? client = _client;
    _client = null;
    if (client != null) {
      await client.dispose(reason: reason, notifyRemote: notifyRemote);
    }
  }

  Future<bool> _confirmRelayOverrideInvite(
    PrivateClawInvite invite, {
    bool autoApprove = false,
  }) async {
    if (autoApprove || !invite.usesNonDefaultRelay || !mounted) {
      return true;
    }

    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String relayLabel = invite.relayDisplayLabel ?? invite.appWsUrl;
    final bool? shouldContinue = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          key: const ValueKey<String>('relay-warning-dialog'),
          title: Text(l10n.nonDefaultRelayWarningTitle),
          content: Text(l10n.nonDefaultRelayWarningBody(relayLabel)),
          actions: <Widget>[
            TextButton(
              key: const ValueKey<String>('relay-warning-cancel-button'),
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(l10n.relayWarningCancelButton),
            ),
            FilledButton(
              key: const ValueKey<String>('relay-warning-continue-button'),
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(l10n.relayWarningContinueButton),
            ),
          ],
        );
      },
    );
    return shouldContinue == true;
  }

  Future<void> _connectFromInput(
    String rawInvite, {
    bool autoApproveNonDefaultRelayWarning = false,
  }) async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String trimmed = rawInvite.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.enterValidInvite;
        _isPairingPanelCollapsed = false;
      });
      return;
    }

    try {
      final PrivateClawInvite invite = PrivateClawInvite.fromScan(trimmed);
      final bool shouldContinue = await _confirmRelayOverrideInvite(
        invite,
        autoApprove: autoApproveNonDefaultRelayWarning,
      );
      if (!shouldContinue) {
        return;
      }
      await _disposeClient(reason: 'switch_session');
      await _activeSessionStore.clear();
      final PrivateClawIdentity identity = await _ensureIdentity();
      await _connectToInvite(
        invite: invite,
        identity: identity,
        inviteInput: trimmed,
      );
    } catch (error) {
      setState(() {
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.connectFailed(error.toString());
        _isPairingPanelCollapsed = false;
      });
    }
  }

  Future<void> _connectToInvite({
    required PrivateClawInvite invite,
    required PrivateClawIdentity identity,
    required String inviteInput,
    bool resetConversationState = true,
    bool collapsePairingPanel = false,
  }) async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final PrivateClawSessionClient client = privateClawSessionClientFactory(
      invite,
      identity: identity,
      pushTokenProvider: widget.skipNotificationsInDebug
          ? null
          : _notificationService.getPushToken,
    );
    final StreamSubscription<PrivateClawSessionEvent> subscription = client
        .events
        .listen(
          (PrivateClawSessionEvent event) =>
              _handleClientEventForClient(client, event),
        );

    setState(() {
      _hasConnectedSession =
          (!resetConversationState && _hasConnectedSession) ||
          collapsePairingPanel;
      _identity = identity;
      _invite = invite;
      _client = client;
      _clientSubscription = subscription;
      if (resetConversationState) {
        _messages.clear();
        _availableCommands.clear();
        _participants.clear();
        _selectedAttachments.clear();
      }
      _sessionStatus = PrivateClawSessionStatus.connecting;
      _statusText = l10n.connectingRelay;
      _inviteController.text = inviteInput;
      _isPairingPanelCollapsed = collapsePairingPanel;
      _isRenewingSession = false;
    });
    _scheduleSessionExpiryRefresh();
    await _persistActiveSessionIfAvailable();

    if (!widget.skipNotificationsInDebug) {
      try {
        await _notificationService.prepareForSession();
      } catch (error, stackTrace) {
        debugPrint('[privateclaw-app] notification setup failed: $error');
        debugPrintStack(stackTrace: stackTrace);
      }
    }

    await client.connect();
  }

  Future<void> _restoreActiveSessionIfAvailable() async {
    final Future<void>? pendingRestore = _pendingRestoreSessionFuture;
    if (pendingRestore != null) {
      await pendingRestore;
      return;
    }

    late final Future<void> trackedRestore;
    trackedRestore = _restoreActiveSessionIfAvailableInternal().whenComplete(
      () {
        if (identical(_pendingRestoreSessionFuture, trackedRestore)) {
          _pendingRestoreSessionFuture = null;
        }
      },
    );
    _pendingRestoreSessionFuture = trackedRestore;
    await trackedRestore;
  }

  Future<void> _restoreActiveSessionIfAvailableInternal() async {
    if (_isPreviewMode || _client != null) {
      return;
    }

    final PrivateClawActiveSessionRecord? record =
        await _loadDebugBootstrapSessionIfAvailable() ??
        await _activeSessionStore.load();
    if (!mounted || _client != null) {
      return;
    }
    if (record == null) {
      return;
    }
    if (record.invite.expiresAt.isBefore(DateTime.now().toUtc())) {
      await _activeSessionStore.clear();
      return;
    }

    try {
      await _identityStore.save(record.identity);
      if (!mounted || _client != null) {
        return;
      }
      await _connectToInvite(
        invite: record.invite,
        identity: record.identity,
        inviteInput: encodePrivateClawInviteUri(record.invite),
        collapsePairingPanel: true,
      );
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to restore session: $error');
      debugPrintStack(stackTrace: stackTrace);
      if (!mounted) {
        return;
      }
      final AppLocalizations l10n = AppLocalizations.of(context)!;
      setState(() {
        _hasConnectedSession = true;
        _identity = record.identity;
        _invite = record.invite;
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.connectFailed(error.toString());
        _isPairingPanelCollapsed = true;
      });
    }
  }

  void _handleClientEventForClient(
    PrivateClawSessionClient client,
    PrivateClawSessionEvent event,
  ) {
    if (!mounted || !identical(_client, client)) {
      return;
    }
    _handleClientEvent(event);
  }

  Future<PrivateClawActiveSessionRecord?>
  _loadDebugBootstrapSessionIfAvailable() async {
    try {
      final PrivateClawDebugBootstrapData? bootstrap =
          loadPrivateClawDebugBootstrapFromEnvironment();
      if (bootstrap == null) {
        return null;
      }

      final PrivateClawIdentity identity =
          bootstrap.identity ?? await _ensureIdentity();
      final PrivateClawActiveSessionRecord record =
          PrivateClawActiveSessionRecord(
            invite: bootstrap.invite,
            identity: identity,
            savedAt: DateTime.now().toUtc(),
          );
      await _identityStore.save(identity);
      await _activeSessionStore.save(
        invite: bootstrap.invite,
        identity: identity,
      );
      debugPrint(
        '[privateclaw-app] applied debug bootstrap '
        'session=${bootstrap.invite.sessionId} appId=${identity.appId}',
      );
      return record;
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to apply debug bootstrap: $error');
      debugPrintStack(stackTrace: stackTrace);
      return null;
    }
  }

  Future<void> _persistActiveSessionIfAvailable() async {
    if (_isPreviewMode) {
      return;
    }
    final PrivateClawInvite? invite = _invite;
    final PrivateClawIdentity? identity = _identity;
    if (invite == null || identity == null) {
      return;
    }
    await _activeSessionStore.save(invite: invite, identity: identity);
  }

  void _handleClientEvent(PrivateClawSessionEvent event) {
    if (!mounted) {
      return;
    }

    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final PrivateClawSessionStatus previousStatus = _sessionStatus;
    setState(() {
      if (event.updatedInvite != null) {
        _invite = event.updatedInvite;
      }
      if (event.assignedIdentity != null) {
        _identity = event.assignedIdentity;
        unawaited(_identityStore.save(event.assignedIdentity!));
      }
      if (event.commands != null) {
        _availableCommands
          ..clear()
          ..addAll(event.commands!);
      }
      if (event.participants != null) {
        _participants
          ..clear()
          ..addAll(event.participants!);
      }
      if (event.message != null) {
        final ChatMessage message = event.message!;
        _upsertMessage(message);
        _maybeShowDesktopNotification(message);
      }
      if (event.renewedExpiresAt != null) {
        _isRenewingSession = false;
        final String renewedMessage = l10n.sessionRenewedNotice(
          _formatDateTime(event.renewedExpiresAt!),
          _formatRemainingDuration(
            event.renewedExpiresAt!.difference(DateTime.now().toUtc()),
          ),
        );
        _statusText = renewedMessage;
        _upsertMessage(
          ChatMessage(
            id: _nextSystemMessageId('renewed'),
            sender: ChatSender.system,
            text: renewedMessage,
            sentAt: DateTime.now().toUtc(),
            replyTo: event.renewedReplyTo,
          ),
        );
      }
      if (event.notice != null) {
        _statusText = _localizeNotice(l10n, event);
      }
      if (event.connectionStatus != null) {
        _sessionStatus = event.connectionStatus!;
        if (event.notice == null &&
            _sessionStatus == PrivateClawSessionStatus.active &&
            previousStatus != PrivateClawSessionStatus.active &&
            event.renewedExpiresAt == null) {
          _statusText = l10n.welcomeFallback;
        }
        if (_sessionStatus == PrivateClawSessionStatus.active) {
          _hasConnectedSession = true;
          _isPairingPanelCollapsed = true;
        }
        if (_sessionStatus == PrivateClawSessionStatus.closed ||
            _sessionStatus == PrivateClawSessionStatus.error ||
            _sessionStatus == PrivateClawSessionStatus.idle) {
          _isRenewingSession = false;
          if (_sessionStatus == PrivateClawSessionStatus.closed ||
              _sessionStatus == PrivateClawSessionStatus.idle) {
            _hasConnectedSession = false;
          }
        }
      }
    });
    _scheduleSessionExpiryRefresh();
    if (event.updatedInvite != null || event.assignedIdentity != null) {
      unawaited(_persistActiveSessionIfAvailable());
    }
    if (event.connectionStatus == PrivateClawSessionStatus.closed ||
        event.connectionStatus == PrivateClawSessionStatus.idle) {
      unawaited(_activeSessionStore.clear());
    }
    if (event.connectionStatus != null &&
        event.connectionStatus != PrivateClawSessionStatus.active &&
        (_isRecordingVoice || _isStoppingVoiceRecording)) {
      unawaited(_cancelVoiceRecording(updateStatus: false));
    }
    _scheduleScrollToBottom();
  }

  void _maybeShowDesktopNotification(ChatMessage message) {
    final PrivateClawInvite? invite = _invite;
    if (invite == null ||
        _isPreviewMode ||
        widget.skipNotificationsInDebug ||
        _sessionStatus != PrivateClawSessionStatus.active ||
        !privateClawShouldShowLocalNotificationForLifecycleState(
          platform: _targetPlatform,
          state: _appLifecycleState,
        )) {
      return;
    }
    unawaited(_showDesktopNotification(invite: invite, message: message));
  }

  Future<void> _showDesktopNotification({
    required PrivateClawInvite invite,
    required ChatMessage message,
  }) async {
    try {
      await _notificationService.showForegroundNotification(
        invite: invite,
        message: message,
      );
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] desktop notification failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  void _upsertMessage(ChatMessage message) {
    final List<ChatMessage> updatedMessages = upsertChatTimelineMessage(
      messages: _messages,
      message: message,
    );
    _messages
      ..clear()
      ..addAll(updatedMessages);
  }

  void _scheduleScrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  String _localizeNotice(AppLocalizations l10n, PrivateClawSessionEvent event) {
    final String details = event.details?.trim() ?? '';

    switch (event.notice) {
      case PrivateClawSessionNotice.connectingRelay:
        return l10n.relayConnecting;
      case PrivateClawSessionNotice.relayAttached:
        return l10n.relayHandshake;
      case PrivateClawSessionNotice.connectionError:
        return l10n.relayConnectionError(
          details.isEmpty ? 'unknown_error' : details,
        );
      case PrivateClawSessionNotice.sessionClosed:
        return details.isEmpty
            ? l10n.relaySessionClosed
            : l10n.relaySessionClosedWithReason(details);
      case PrivateClawSessionNotice.relayError:
        return l10n.relayError(details.isEmpty ? 'unknown_error' : details);
      case PrivateClawSessionNotice.unknownRelayEvent:
        return l10n.relayUnknownEvent(
          details.isEmpty ? 'unknown_event' : details,
        );
      case PrivateClawSessionNotice.unknownPayload:
        return l10n.relayUnknownPayload(
          details.isEmpty ? 'unknown_payload' : details,
        );
      case PrivateClawSessionNotice.welcome:
        return details.isEmpty ? l10n.welcomeFallback : details;
      case null:
        return _statusText;
    }
  }

  void _scheduleSessionExpiryRefresh() {
    _sessionExpiryRefreshTimer?.cancel();
    final Duration? remaining = _sessionRemainingDuration;
    if (!_hasLiveSessionContext || remaining == null) {
      return;
    }

    final Duration nextRefresh;
    if (remaining > _sessionRenewWarningThreshold) {
      nextRefresh =
          remaining -
          _sessionRenewWarningThreshold +
          const Duration(seconds: 1);
    } else if (remaining > const Duration(minutes: 1)) {
      nextRefresh = const Duration(minutes: 1);
    } else {
      nextRefresh = remaining + const Duration(seconds: 1);
    }

    _sessionExpiryRefreshTimer = Timer(nextRefresh, () {
      if (!mounted) {
        return;
      }
      setState(() {});
      _scheduleSessionExpiryRefresh();
    });
  }

  Future<void> _openScanner() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    if (!_supportsInviteScanner) {
      setState(() {
        _statusText = l10n.scannerUnsupported;
      });
      return;
    }
    if (_isScannerSheetOpen) {
      return;
    }
    _isScannerSheetOpen = true;
    try {
      final PrivateClawScannerSheetLauncher launcher =
          widget.scannerSheetLauncher ?? _defaultScannerSheetLauncher;
      final String? scannedInvite = await launcher(
        context,
        widget.inviteScannerPreviewOverride,
      );

      if (!mounted || scannedInvite == null) {
        return;
      }

      _inviteController.text = scannedInvite;
      await _connectFromInput(scannedInvite);
    } finally {
      _isScannerSheetOpen = false;
    }
  }

  Future<String?> _defaultScannerSheetLauncher(
    BuildContext context,
    Widget? previewOverride,
  ) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (BuildContext context) {
        return InviteScannerSheet(
          onDetected: (String value) {
            Navigator.of(context).pop(value);
          },
          previewOverride: previewOverride,
        );
      },
    );
  }

  Future<void> _initializeQuickActions() async {
    if (_hasInitializedQuickActions) {
      return;
    }
    _hasInitializedQuickActions = true;
    await widget.quickActions.initialize(_handleQuickActionSelection);
  }

  void _configureQuickActionsForLocale() {
    if (_isPreviewMode || !mounted) {
      return;
    }
    final Locale locale = Localizations.localeOf(context);
    if (_configuredQuickActionsLocale == locale) {
      return;
    }
    _configuredQuickActionsLocale = locale;
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    unawaited(
      widget.quickActions.setShortcutItems(<PrivateClawShortcutItem>[
        PrivateClawShortcutItem(
          type: privateClawScanQrShortcutType,
          localizedTitle: l10n.scanQrButton,
        ),
      ]),
    );
  }

  void _handleQuickActionSelection(String shortcutType) {
    if (shortcutType != privateClawScanQrShortcutType) {
      return;
    }
    if (!_hasCompletedFirstFrame) {
      _hasPendingQuickActionScan = true;
      return;
    }
    if (!mounted) {
      return;
    }
    unawaited(_openScanner());
  }

  Future<void> _showSessionQrSheet() async {
    final PrivateClawInvite? invite = _invite;
    if (invite == null) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (BuildContext context) {
        return SessionQrSheet(invite: invite);
      },
    );
  }

  Future<void> _sendSessionRenewCommand() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final PrivateClawSessionClient? client = _client;
    final PrivateClawSlashCommand? renewCommand = _sessionRenewCommand;
    if (client == null || renewCommand == null || _isRenewingSession) {
      return;
    }

    setState(() {
      _isRenewingSession = true;
    });

    try {
      await client.sendUserMessage(renewCommand.slash);
      _scheduleScrollToBottom();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRenewingSession = false;
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.sendFailed(error.toString());
      });
    }
  }

  Future<void> _loadEmojiUsage() async {
    try {
      final Map<String, int> usage = await _emojiStore.load();
      if (!mounted) {
        return;
      }
      setState(() {
        _emojiUsage = usage;
      });
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to load emoji usage: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<void> _pickAttachments() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    _closeComposerPanels(clearFocus: true);
    try {
      final FilePickerResult? result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        withData: true,
        type: FileType.any,
      );
      if (result == null || result.files.isEmpty) {
        return;
      }

      final List<ChatAttachment> nextAttachments =
          await _inlineAttachmentsFromPlatformFiles(
            l10n,
            result.files,
            inferMimeType: (PlatformFile file) => _inferMimeType(file.name),
          );

      if (nextAttachments.isEmpty || !mounted) {
        return;
      }

      await _addPickedAttachments(nextAttachments);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.sendFailed(error.toString());
      });
    }
  }

  Future<Uint8List?> _readPlatformFileBytes(PlatformFile file) async {
    final Uint8List? inMemoryBytes = file.bytes;
    if (inMemoryBytes != null && inMemoryBytes.isNotEmpty) {
      return inMemoryBytes;
    }

    final String? path = file.path;
    if (path == null || path.isEmpty) {
      return null;
    }
    final File diskFile = File(path);
    if (!await diskFile.exists()) {
      return null;
    }
    final Uint8List bytes = await diskFile.readAsBytes();
    return bytes.isEmpty ? null : bytes;
  }

  Future<List<ChatAttachment>> _inlineAttachmentsFromPlatformFiles(
    AppLocalizations l10n,
    Iterable<PlatformFile> files, {
    required String Function(PlatformFile file) inferMimeType,
  }) async {
    final List<ChatAttachment> nextAttachments = <ChatAttachment>[];
    for (final PlatformFile file in files) {
      final Uint8List? bytes = await _readPlatformFileBytes(file);
      if (bytes == null || bytes.isEmpty) {
        continue;
      }
      final ChatAttachment? attachment = _buildInlineAttachment(
        l10n,
        bytes: bytes,
        name: file.name,
        mimeType: inferMimeType(file),
      );
      if (attachment != null) {
        nextAttachments.add(attachment);
      }
    }
    return nextAttachments;
  }

  Future<void> _addPickedAttachments(
    List<ChatAttachment> nextAttachments,
  ) async {
    if (nextAttachments.isEmpty || !mounted) {
      return;
    }

    final bool shouldAutoSend =
        _shouldAutoSendPickedAttachments &&
        _messageController.text.trim().isEmpty &&
        _selectedAttachments.isEmpty;

    setState(() {
      _selectedAttachments.addAll(nextAttachments);
    });

    if (shouldAutoSend) {
      await _sendMessage();
    }
  }

  Future<void> _togglePhotoTray() async {
    if (!_canSend) {
      return;
    }

    if (!_supportsRecentPhotoTray) {
      await _pickFromGallery();
      return;
    }

    final bool shouldShow = !_isPhotoTrayVisible;
    setState(() {
      _isEmojiPickerVisible = false;
      _isPhotoTrayVisible = shouldShow;
    });
    if (!shouldShow) {
      return;
    }
    _composerFocusNode.unfocus();
    await _loadRecentPhotos();
  }

  Future<void> _loadRecentPhotos({bool force = false}) async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    if (!_supportsRecentPhotoTray) {
      setState(() {
        _recentPhotoAssets.clear();
        _photoThumbnailFutures.clear();
        _photoTrayStatusText = l10n.photoTrayNoImages;
      });
      return;
    }
    if (_isLoadingRecentPhotos || (!force && _recentPhotoAssets.isNotEmpty)) {
      return;
    }

    setState(() {
      _isLoadingRecentPhotos = true;
      _photoTrayStatusText = '';
    });
    try {
      final PermissionState permission =
          await PhotoManager.requestPermissionExtend(
            requestOption: const PermissionRequestOption(
              androidPermission: AndroidPermission(
                type: RequestType.image,
                mediaLocation: false,
              ),
              iosAccessLevel: IosAccessLevel.readWrite,
            ),
          );
      final bool hasPermission =
          permission == PermissionState.authorized ||
          permission == PermissionState.limited;
      if (!hasPermission) {
        if (!mounted) {
          return;
        }
        setState(() {
          _recentPhotoAssets.clear();
          _photoThumbnailFutures.clear();
          _photoTrayStatusText = l10n.photoLibraryPermissionDenied;
        });
        return;
      }

      final List<AssetPathEntity> paths = await PhotoManager.getAssetPathList(
        onlyAll: true,
        type: RequestType.image,
        filterOption: FilterOptionGroup(
          imageOption: const FilterOption(needTitle: true),
        ),
      );
      final List<AssetEntity> assets = paths.isEmpty
          ? const <AssetEntity>[]
          : await paths.first.getAssetListPaged(
              page: 0,
              size: _recentPhotoPageSize,
            );
      if (!mounted) {
        return;
      }
      final Set<String> visibleAssetIds = assets
          .map((AssetEntity asset) => asset.id)
          .toSet();
      setState(() {
        _recentPhotoAssets
          ..clear()
          ..addAll(assets);
        _photoThumbnailFutures.removeWhere(
          (String assetId, Future<Uint8List?> _) =>
              !visibleAssetIds.contains(assetId),
        );
        _photoTrayStatusText = assets.isEmpty ? l10n.photoTrayNoImages : '';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.sendFailed(error.toString());
        _photoTrayStatusText = l10n.sendFailed(error.toString());
      });
    } finally {
      if (!mounted) {
        return;
      }
      setState(() {
        _isLoadingRecentPhotos = false;
      });
    }
  }

  Future<void> _pickFromCamera() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    _closeComposerPanels(clearFocus: true);
    try {
      final XFile? photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 88,
      );
      if (photo == null) {
        return;
      }
      final Uint8List bytes = await photo.readAsBytes();
      if (!mounted) {
        return;
      }
      final ChatAttachment? attachment = _buildInlineAttachment(
        l10n,
        bytes: bytes,
        name: photo.name.isEmpty
            ? 'camera-${DateTime.now().millisecondsSinceEpoch}.jpg'
            : photo.name,
        mimeType: _inferMimeType(
          photo.name.isEmpty ? 'camera.jpg' : photo.name,
        ),
      );
      if (attachment == null) {
        return;
      }
      setState(() {
        _selectedAttachments.add(attachment);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.sendFailed(error.toString());
      });
    }
  }

  Future<void> _pickFromGallery() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    _closeComposerPanels(clearFocus: true);
    try {
      if (!_supportsRecentPhotoTray) {
        final FilePickerResult? result = await FilePicker.platform.pickFiles(
          allowMultiple: true,
          withData: true,
          type: FileType.image,
        );
        if (result == null || result.files.isEmpty || !mounted) {
          return;
        }
        final List<ChatAttachment> nextAttachments =
            await _inlineAttachmentsFromPlatformFiles(
              l10n,
              result.files,
              inferMimeType: (PlatformFile file) => _inferMimeType(file.name),
            );
        if (nextAttachments.isEmpty || !mounted) {
          return;
        }
        await _addPickedAttachments(nextAttachments);
        return;
      }

      final List<XFile> photos = await _imagePicker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 88,
        limit: 20,
      );
      if (photos.isEmpty || !mounted) {
        return;
      }

      final List<ChatAttachment> nextAttachments = <ChatAttachment>[];
      for (final XFile photo in photos) {
        final Uint8List bytes = await photo.readAsBytes();
        final ChatAttachment? attachment = _buildInlineAttachment(
          l10n,
          bytes: bytes,
          name: photo.name.isEmpty
              ? 'photo-${DateTime.now().millisecondsSinceEpoch}.jpg'
              : photo.name,
          mimeType: _inferMimeType(
            photo.name.isEmpty ? 'photo.jpg' : photo.name,
          ),
        );
        if (attachment != null) {
          nextAttachments.add(attachment);
        }
      }

      if (nextAttachments.isEmpty || !mounted) {
        return;
      }
      setState(() {
        _selectedAttachments.addAll(nextAttachments);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.sendFailed(error.toString());
      });
    }
  }

  Future<void> _toggleRecentPhotoAttachment(AssetEntity asset) async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String? existingAttachmentId = _photoAttachmentIdsByAssetId[asset.id];
    if (existingAttachmentId != null) {
      _removeAttachment(existingAttachmentId);
      return;
    }
    if (_loadingPhotoAssetIds.contains(asset.id)) {
      return;
    }

    setState(() {
      _loadingPhotoAssetIds.add(asset.id);
    });
    try {
      final Uint8List? bytes = await asset.thumbnailDataWithSize(
        const ThumbnailSize(1920, 1920),
        quality: 90,
      );
      if (!mounted) {
        return;
      }
      if (bytes == null || bytes.isEmpty) {
        setState(() {
          _statusText = l10n.photoTrayNoImages;
          _photoTrayStatusText = l10n.photoTrayNoImages;
        });
        return;
      }
      final ChatAttachment? attachment = _buildInlineAttachment(
        l10n,
        bytes: bytes,
        name: _photoAttachmentName(asset),
        mimeType: 'image/jpeg',
      );
      if (attachment == null) {
        return;
      }
      setState(() {
        _selectedAttachments.add(attachment);
        _photoAttachmentIdsByAssetId[asset.id] = attachment.id;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.sendFailed(error.toString());
      });
    } finally {
      if (!mounted) {
        return;
      }
      setState(() {
        _loadingPhotoAssetIds.remove(asset.id);
      });
    }
  }

  ChatAttachment? _buildInlineAttachment(
    AppLocalizations l10n, {
    required Uint8List bytes,
    required String name,
    required String mimeType,
  }) {
    if (bytes.isEmpty) {
      return null;
    }
    if (bytes.length > _maxInlineAttachmentBytes) {
      if (mounted) {
        setState(() {
          _statusText = l10n.sendFailed('attachment_too_large:$name');
        });
      } else {
        _statusText = l10n.sendFailed('attachment_too_large:$name');
      }
      return null;
    }
    return ChatAttachment(
      id: _nextAttachmentId(),
      name: name,
      mimeType: mimeType,
      sizeBytes: bytes.length,
      dataBase64: base64Encode(bytes),
    );
  }

  String _photoAttachmentName(AssetEntity asset) {
    final String rawTitle = asset.title?.trim() ?? '';
    if (rawTitle.isEmpty) {
      return 'photo-${DateTime.now().millisecondsSinceEpoch}.jpg';
    }
    if (rawTitle.contains('.')) {
      return rawTitle;
    }
    return '$rawTitle.jpg';
  }

  Future<Uint8List?> _thumbnailFutureForAsset(
    AssetEntity asset, {
    int size = 220,
  }) {
    return _photoThumbnailFutures.putIfAbsent(asset.id, () {
      return asset.thumbnailDataWithSize(
        ThumbnailSize.square(size),
        quality: 88,
      );
    });
  }

  Future<void> _sendMessage() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final PrivateClawSessionClient? client = _client;
    final String text = _messageController.text.trim();
    final List<ChatAttachment> attachments = List<ChatAttachment>.from(
      _selectedAttachments,
    );
    final Map<String, String> photoAssetMapping = Map<String, String>.from(
      _photoAttachmentIdsByAssetId,
    );
    if (client == null || (text.isEmpty && attachments.isEmpty)) {
      return;
    }

    _closeComposerPanels(clearFocus: false);
    _messageController.clear();
    setState(() {
      _selectedAttachments.clear();
      _photoAttachmentIdsByAssetId.clear();
    });

    try {
      await client.sendUserMessage(text, attachments: attachments);
      _scheduleScrollToBottom();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _messageController.text = text;
        _messageController.selection = TextSelection.collapsed(
          offset: _messageController.text.length,
        );
        _selectedAttachments
          ..clear()
          ..addAll(attachments);
        _photoAttachmentIdsByAssetId
          ..clear()
          ..addAll(photoAssetMapping);
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.sendFailed(error.toString());
      });
    }
  }

  Future<void> _disconnect() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    await _cancelVoiceRecording(updateStatus: false);
    final PrivateClawSessionClient? client = _client;
    if (client != null) {
      await client.unregisterPushRegistration();
    }
    await _disposeClient(reason: 'user_disconnect');
    await _activeSessionStore.clear();
    if (!mounted) {
      return;
    }
    setState(() {
      _hasConnectedSession = false;
      _invite = null;
      _inviteController.clear();
      _participants.clear();
      _messages.clear();
      _availableCommands.clear();
      _selectedAttachments.clear();
      _photoAttachmentIdsByAssetId.clear();
      _isEmojiPickerVisible = false;
      _isPhotoTrayVisible = false;
      _sessionStatus = PrivateClawSessionStatus.idle;
      _statusText = l10n.sessionDisconnected;
      _isPairingPanelCollapsed = false;
      _isRenewingSession = false;
    });
    _sessionExpiryRefreshTimer?.cancel();
  }

  Future<void> _openEmojiPicker() async {
    final double keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    if (_isEmojiPickerVisible) {
      setState(() {
        _isEmojiPickerVisible = false;
      });
      _composerFocusNode.requestFocus();
      return;
    }

    setState(() {
      if (keyboardInset > 0) {
        _lastKeyboardInsetHeight = keyboardInset;
      }
      _isPhotoTrayVisible = false;
      _isEmojiPickerVisible = true;
    });
    _composerFocusNode.unfocus();
  }

  Future<void> _openSlashCommands() async {
    if (!_canSend || _availableCommands.isEmpty) {
      return;
    }

    _isSlashCommandsSheetOpen = true;
    final PrivateClawSlashCommand? command;
    try {
      command = await showModalBottomSheet<PrivateClawSlashCommand>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (BuildContext context) {
          return _SlashCommandsSheet(commands: _availableCommands);
        },
      );
    } finally {
      _isSlashCommandsSheetOpen = false;
    }

    if (!mounted || command == null) {
      return;
    }

    final String nextText = command.acceptsArgs
        ? '${command.slash} '
        : command.slash;
    _messageController.value = TextEditingValue(
      text: nextText,
      selection: TextSelection.collapsed(offset: nextText.length),
    );
    _composerFocusNode.requestFocus();
  }

  void _removeAttachment(String attachmentId) {
    setState(() {
      _selectedAttachments.removeWhere(
        (ChatAttachment attachment) => attachment.id == attachmentId,
      );
      _photoAttachmentIdsByAssetId.removeWhere(
        (String _, String value) => value == attachmentId,
      );
    });
  }

  void _resetVoiceHoldOverlayState() {
    _voiceHoldStartGlobalPosition = null;
    _isVoiceCancelArmed = false;
  }

  Future<void> _handleVoiceHoldStart(Offset globalPosition) async {
    if (!_canSend || _isStoppingVoiceRecording || _client == null) {
      return;
    }

    setState(() {
      _isEmojiPickerVisible = false;
      _isPhotoTrayVisible = false;
      _voiceHoldStartGlobalPosition = globalPosition;
      _isVoiceCancelArmed = false;
    });
    await _startVoiceRecording();
  }

  Future<void> _handleTapVoiceRecording() async {
    if (!_canSend || _isStoppingVoiceRecording || _client == null) {
      _showInactiveComposerStatus();
      return;
    }

    if (_isRecordingVoice) {
      await _finishVoiceRecordingAndSend();
      return;
    }

    setState(() {
      _isEmojiPickerVisible = false;
      _isPhotoTrayVisible = false;
      _resetVoiceHoldOverlayState();
    });
    await _startVoiceRecording();
  }

  void _handleVoiceHoldMove(Offset globalPosition) {
    final Offset? start = _voiceHoldStartGlobalPosition;
    if (start == null) {
      return;
    }

    final bool shouldCancel =
        start.dy - globalPosition.dy >= _voiceCancelActivationDistance;
    if (shouldCancel == _isVoiceCancelArmed) {
      return;
    }
    setState(() {
      _isVoiceCancelArmed = shouldCancel;
    });
  }

  Future<void> _handleVoiceHoldEnd() async {
    final bool shouldCancel = _isVoiceCancelArmed;
    if (mounted) {
      setState(_resetVoiceHoldOverlayState);
    } else {
      _resetVoiceHoldOverlayState();
    }

    if (shouldCancel) {
      await _cancelVoiceRecording(updateStatus: false);
      return;
    }
    await _finishVoiceRecordingAndSend();
  }

  Future<void> _handleVoiceHoldCancel() async {
    if (mounted) {
      setState(_resetVoiceHoldOverlayState);
    } else {
      _resetVoiceHoldOverlayState();
    }
    await _cancelVoiceRecording(updateStatus: false);
  }

  void _insertEmoji(String emoji) {
    final TextEditingValue currentValue = _messageController.value;
    final TextSelection selection = currentValue.selection.isValid
        ? currentValue.selection
        : TextSelection.collapsed(offset: currentValue.text.length);
    final String text = currentValue.text;
    final int start = selection.start.clamp(0, text.length).toInt();
    final int end = selection.end.clamp(0, text.length).toInt();
    final String nextText =
        '${text.substring(0, start)}$emoji${text.substring(end)}';
    final int nextOffset = start + emoji.length;
    _messageController.value = TextEditingValue(
      text: nextText,
      selection: TextSelection.collapsed(offset: nextOffset),
    );
    unawaited(_recordEmojiSelection(emoji));
  }

  void _hideEmojiPicker() {
    if (!_isEmojiPickerVisible) {
      return;
    }
    setState(() {
      _isEmojiPickerVisible = false;
    });
  }

  void _hidePhotoTray() {
    if (!_isPhotoTrayVisible) {
      return;
    }
    setState(() {
      _isPhotoTrayVisible = false;
    });
  }

  void _closeComposerPanels({required bool clearFocus}) {
    if (_isEmojiPickerVisible || _isPhotoTrayVisible) {
      setState(() {
        _isEmojiPickerVisible = false;
        _isPhotoTrayVisible = false;
      });
    }
    if (clearFocus) {
      _composerFocusNode.unfocus();
    }
  }

  void _showInactiveComposerStatus() {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    setState(() {
      _statusText = l10n.sendHintInactive;
    });
  }

  Future<void> _handlePhotoComposerButtonPressed() async {
    if (!_canSend) {
      _showInactiveComposerStatus();
      return;
    }
    if (_supportsRecentPhotoTray) {
      await _togglePhotoTray();
      return;
    }
    await _pickFromGallery();
  }

  Future<void> _handleFileComposerButtonPressed() async {
    if (!_canSend) {
      _showInactiveComposerStatus();
      return;
    }
    await _pickAttachments();
  }

  Future<void> _recordEmojiSelection(String emoji) async {
    try {
      final Map<String, int> usage = await _emojiStore.increment(emoji);
      if (!mounted) {
        return;
      }
      setState(() {
        _emojiUsage = usage;
      });
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to persist emoji usage: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<void> _startVoiceRecording() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    if (!_canSend ||
        _client == null ||
        _isRecordingVoice ||
        _isStoppingVoiceRecording ||
        _voiceRecordingStartFuture != null) {
      return;
    }

    final Future<void> startFuture = PrivateClawAudioRecorder.startRecording();
    _voiceRecordingStartFuture = startFuture;
    setState(() {
      _isRecordingVoice = true;
      _voiceRecordingElapsed = Duration.zero;
      _voiceRecordingTick = 0;
    });
    _startVoiceRecordingTicker();

    try {
      await startFuture;
    } on PrivateClawAudioRecorderPermissionDenied {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRecordingVoice = false;
        _resetVoiceHoldOverlayState();
        _statusText = l10n.voiceRecordingPermissionDenied;
      });
      _stopVoiceRecordingTicker(reset: true);
    } on UnsupportedError {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRecordingVoice = false;
        _resetVoiceHoldOverlayState();
        _statusText = l10n.voiceRecordingUnsupported;
      });
      _stopVoiceRecordingTicker(reset: true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRecordingVoice = false;
        _resetVoiceHoldOverlayState();
        _statusText = l10n.voiceRecordingFailed(error.toString());
      });
      _stopVoiceRecordingTicker(reset: true);
    } finally {
      if (identical(_voiceRecordingStartFuture, startFuture)) {
        _voiceRecordingStartFuture = null;
      }
    }
  }

  Future<void> _finishVoiceRecordingAndSend() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    if (!_isRecordingVoice || _isStoppingVoiceRecording) {
      return;
    }

    setState(() {
      _isRecordingVoice = false;
      _isStoppingVoiceRecording = true;
    });
    _stopVoiceRecordingTicker(reset: false);

    try {
      final Future<void>? startFuture = _voiceRecordingStartFuture;
      if (startFuture != null) {
        await startFuture;
      }
      final PrivateClawRecordedAudio? recording =
          await PrivateClawAudioRecorder.stopRecording();
      if (recording == null) {
        return;
      }
      final File file = File(recording.path);
      final Uint8List bytes = await file.readAsBytes();
      await _deleteVoiceRecordingFile(file);
      if (bytes.isEmpty) {
        throw StateError('Voice recording is empty.');
      }
      if (bytes.length > _maxInlineAttachmentBytes) {
        if (!mounted) {
          return;
        }
        setState(() {
          _statusText = l10n.voiceRecordingTooLarge;
        });
        return;
      }

      final PrivateClawSessionClient? client = _client;
      if (client == null) {
        throw StateError('Session is not connected.');
      }

      final ChatAttachment attachment = ChatAttachment(
        id: _nextAttachmentId(),
        name: _voiceRecordingAttachmentName(recording.path),
        mimeType: recording.mimeType,
        sizeBytes: bytes.length,
        dataBase64: base64Encode(bytes),
      );
      await client.sendUserMessage(
        '',
        attachments: <ChatAttachment>[attachment],
      );
      _scheduleScrollToBottom();
    } on PrivateClawAudioRecorderTooShort {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.voiceRecordingTooShort;
      });
    } on PrivateClawAudioRecorderPermissionDenied {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.voiceRecordingPermissionDenied;
      });
    } on UnsupportedError {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.voiceRecordingUnsupported;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusText = l10n.voiceRecordingFailed(error.toString());
      });
    } finally {
      if (!mounted) {
        return;
      }
      setState(() {
        _isStoppingVoiceRecording = false;
        _voiceRecordingElapsed = Duration.zero;
        _voiceRecordingTick = 0;
      });
    }
  }

  Future<void> _cancelVoiceRecording({
    required bool updateStatus,
    bool setUiState = true,
  }) async {
    if (!_isRecordingVoice && !_isStoppingVoiceRecording) {
      return;
    }

    final AppLocalizations? l10n = mounted
        ? AppLocalizations.of(context)
        : null;
    void clearRecordingState() {
      _isRecordingVoice = false;
      _isStoppingVoiceRecording = false;
      _resetVoiceHoldOverlayState();
      _stopVoiceRecordingTicker(reset: true);
      if (updateStatus && l10n != null) {
        _statusText = l10n.voiceRecordingCancelled;
      }
    }

    if (setUiState && mounted) {
      setState(clearRecordingState);
    } else {
      clearRecordingState();
    }
    final Future<void>? startFuture = _voiceRecordingStartFuture;
    if (startFuture != null) {
      try {
        await startFuture;
      } on Object catch (error, stackTrace) {
        debugPrint(
          '[privateclaw-app] voice recording start failed before cancel: $error',
        );
        debugPrintStack(stackTrace: stackTrace);
      }
    }
    await PrivateClawAudioRecorder.stopRecording(discard: true);
  }

  void _startVoiceRecordingTicker() {
    _voiceRecordingTicker?.cancel();
    _voiceRecordingTicker = Timer.periodic(const Duration(milliseconds: 180), (
      Timer timer,
    ) {
      if (!mounted || !_isRecordingVoice) {
        timer.cancel();
        return;
      }
      setState(() {
        _voiceRecordingTick += 1;
        _voiceRecordingElapsed += const Duration(milliseconds: 180);
      });
    });
  }

  void _stopVoiceRecordingTicker({required bool reset}) {
    _voiceRecordingTicker?.cancel();
    _voiceRecordingTicker = null;
    if (!reset) {
      return;
    }
    _voiceRecordingElapsed = Duration.zero;
    _voiceRecordingTick = 0;
  }

  Future<void> _deleteVoiceRecordingFile(File file) async {
    try {
      if (await file.exists()) {
        await file.delete();
      }
    } on FileSystemException catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to delete voice recording: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  String _voiceRecordingAttachmentName(String path) {
    final String fileName = path.split(Platform.pathSeparator).last;
    if (fileName.isNotEmpty) {
      return fileName;
    }
    return 'voice-note-${DateFormat('yyyyMMdd-HHmmss').format(DateTime.now())}.m4a';
  }

  Future<void> _openPrivateClawWebsite() async {
    final bool launched = await privateClawWebsiteLauncher(
      Uri.parse(_privateClawWebsiteUrl),
      mode: LaunchMode.externalApplication,
    );
    if (launched || !mounted) {
      return;
    }
    ScaffoldMessenger.maybeOf(
      context,
    )?.showSnackBar(const SnackBar(content: Text(_privateClawWebsiteUrl)));
  }

  Widget _buildPluginInstallWebsiteLink(BuildContext context) {
    return TextButton.icon(
      key: const ValueKey<String>('plugin-install-site-link'),
      onPressed: () {
        unawaited(_openPrivateClawWebsite());
      },
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        minimumSize: const Size(0, 32),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
      icon: const Icon(Icons.open_in_new, size: 16),
      label: const Text('privateclaw.us'),
    );
  }

  Widget _buildSessionRenewPrompt(BuildContext context, AppLocalizations l10n) {
    final Duration? remaining = _sessionRemainingDuration;
    if (remaining == null || _sessionRenewCommand == null) {
      return const SizedBox.shrink();
    }

    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      key: const ValueKey<String>('session-renew-prompt'),
      decoration: BoxDecoration(
        color: colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                const Icon(Icons.schedule_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.sessionRenewPromptTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              l10n.sessionRenewPromptBody(_formatRemainingDuration(remaining)),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const ValueKey<String>('session-renew-button'),
              onPressed: _canSendSessionRenewCommand
                  ? () {
                      unawaited(_sendSessionRenewCommand());
                    }
                  : null,
              icon: _isRenewingSession
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              label: Text(
                _isRenewingSession
                    ? l10n.sessionRenewButtonPending
                    : l10n.sessionRenewButton,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _nextAttachmentId() {
    _attachmentCounter += 1;
    return 'attachment-${DateTime.now().microsecondsSinceEpoch}-$_attachmentCounter';
  }

  String _inferMimeType(String filename) {
    final String extension = filename.contains('.')
        ? filename.split('.').last.toLowerCase()
        : '';
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
        return 'audio/mp4';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'txt':
        return 'text/plain';
      case 'md':
      case 'markdown':
        return 'text/markdown';
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      case 'xml':
        return 'application/xml';
      default:
        return 'application/octet-stream';
    }
  }

  Color _statusColor(BuildContext context) {
    switch (_sessionStatus) {
      case PrivateClawSessionStatus.active:
        return Theme.of(context).colorScheme.primaryContainer;
      case PrivateClawSessionStatus.error:
        return Theme.of(context).colorScheme.errorContainer;
      case PrivateClawSessionStatus.closed:
        return Theme.of(context).colorScheme.surfaceContainerHighest;
      case PrivateClawSessionStatus.reconnecting:
      case PrivateClawSessionStatus.connecting:
      case PrivateClawSessionStatus.relayAttached:
        return Theme.of(context).colorScheme.tertiaryContainer;
      case PrivateClawSessionStatus.idle:
        return Theme.of(context).colorScheme.surfaceContainerHighest;
    }
  }

  IconData _statusIcon() {
    switch (_sessionStatus) {
      case PrivateClawSessionStatus.active:
        return Icons.lock;
      case PrivateClawSessionStatus.error:
        return Icons.error_outline;
      case PrivateClawSessionStatus.closed:
        return Icons.link_off;
      case PrivateClawSessionStatus.reconnecting:
      case PrivateClawSessionStatus.connecting:
      case PrivateClawSessionStatus.relayAttached:
        return Icons.sync;
      case PrivateClawSessionStatus.idle:
        return Icons.qr_code_2;
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final double keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final double emojiPanelHeight = _isEmojiPickerVisible
        ? (keyboardInset > 0 ? keyboardInset : _lastKeyboardInsetHeight)
        : 0;
    final double bottomInset = _isEmojiPickerVisible ? 0 : keyboardInset;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        centerTitle: true,
        title: const _PrivateClawAppBarIcon(),
      ),
      body: GestureDetector(
        onTap: () {
          _closeComposerPanels(clearFocus: true);
        },
        child: SafeArea(
          bottom: false,
          child: Stack(
            children: <Widget>[
              AnimatedPadding(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding: EdgeInsets.only(bottom: bottomInset),
                child: Column(
                  children: <Widget>[
                    if (!_canCollapsePairingPanel)
                      _buildPairingSection(context, l10n),
                    Expanded(child: _buildMessageList(l10n)),
                    _buildComposer(l10n),
                    if (_isEmojiPickerVisible)
                      _buildEmojiPickerPanel(l10n, height: emojiPanelHeight),
                    if (_isPhotoTrayVisible && _supportsRecentPhotoTray)
                      _buildPhotoTrayPanel(l10n),
                  ],
                ),
              ),
              if (_canCollapsePairingPanel)
                _buildManagedSessionOverlay(context, l10n),
              if (_isRecordingVoice) _buildVoiceRecordingOverlay(context, l10n),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVoiceRecordingOverlay(
    BuildContext context,
    AppLocalizations l10n,
  ) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    final bool usesTapToToggle = _usesTapToToggleVoiceRecording;
    return Positioned.fill(
      child: IgnorePointer(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: <Widget>[
              const Spacer(),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                height: _recordingPanelHeight,
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 32),
                decoration: BoxDecoration(
                  color: theme.scaffoldBackgroundColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(32),
                  ),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.12),
                      blurRadius: 24,
                      offset: const Offset(0, -10),
                    ),
                  ],
                ),
                child: Column(
                  children: <Widget>[
                    Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: colorScheme.outlineVariant,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(height: 22),
                    Text(
                      _formatVoiceRecordingElapsed(),
                      key: const ValueKey<String>('voice-record-duration'),
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 20),
                    _VoiceWaveformBars(
                      samples: _buildVoiceWaveformSamples(),
                      activeColor: _isVoiceCancelArmed
                          ? colorScheme.error
                          : colorScheme.primary,
                      inactiveColor: colorScheme.surfaceContainerHighest,
                    ),
                    const Spacer(),
                    _VoiceRecordingActionBadge(
                      key: const ValueKey<String>('voice-record-hint'),
                      icon: usesTapToToggle
                          ? Icons.send_rounded
                          : _isVoiceCancelArmed
                          ? Icons.delete_outline
                          : Icons.north_rounded,
                      label: usesTapToToggle
                          ? l10n.voiceRecordTapAgainToSend
                          : _isVoiceCancelArmed
                          ? l10n.voiceRecordingReleaseToCancel
                          : l10n.voiceRecordingSlideUpToCancel,
                      backgroundColor: usesTapToToggle
                          ? colorScheme.primaryContainer
                          : _isVoiceCancelArmed
                          ? colorScheme.errorContainer
                          : colorScheme.primaryContainer,
                      foregroundColor: usesTapToToggle
                          ? colorScheme.onPrimaryContainer
                          : _isVoiceCancelArmed
                          ? colorScheme.onErrorContainer
                          : colorScheme.onPrimaryContainer,
                    ),
                    const SizedBox(height: 16),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: usesTapToToggle
                            ? colorScheme.primary
                            : _isVoiceCancelArmed
                            ? colorScheme.error
                            : colorScheme.primary,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 12,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            Icon(
                              usesTapToToggle
                                  ? Icons.send_rounded
                                  : _isVoiceCancelArmed
                                  ? Icons.delete_outline
                                  : Icons.mic,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 10),
                            Text(
                              usesTapToToggle
                                  ? l10n.voiceRecordTapAgainToSend
                                  : _isVoiceCancelArmed
                                  ? l10n.voiceRecordingReleaseToCancel
                                  : l10n.voiceRecordReleaseToSend,
                              key: const ValueKey<String>(
                                'voice-record-release-chip',
                              ),
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildManagedSessionOverlay(
    BuildContext context,
    AppLocalizations l10n,
  ) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    if (_isPairingPanelCollapsed) {
      return Positioned(
        top: 20,
        right: 0,
        child: Tooltip(
          message: l10n.sessionLabel,
          child: Material(
            color: colorScheme.primaryContainer,
            elevation: 4,
            borderRadius: const BorderRadius.horizontal(
              left: Radius.circular(18),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              key: const ValueKey<String>('session-panel-handle'),
              onTap: () {
                setState(() {
                  _isPairingPanelCollapsed = false;
                });
              },
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 10, vertical: 16),
                child: Icon(Icons.chevron_left),
              ),
            ),
          ),
        ),
      );
    }

    final double overlayWidth = MediaQuery.sizeOf(context).width > 420
        ? 360
        : MediaQuery.sizeOf(context).width - 32;
    return Positioned(
      top: 16,
      right: 16,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: overlayWidth,
          maxHeight: MediaQuery.sizeOf(context).height * 0.72,
        ),
        child: Material(
          key: const ValueKey<String>('session-panel-overlay'),
          color: colorScheme.surface,
          elevation: 6,
          borderRadius: BorderRadius.circular(24),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    const Icon(Icons.lock_clock_outlined),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        l10n.sessionLabel,
                        style: theme.textTheme.titleMedium,
                      ),
                    ),
                    IconButton(
                      key: const ValueKey<String>('session-panel-close'),
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).closeButtonTooltip,
                      onPressed: () {
                        setState(() {
                          _isPairingPanelCollapsed = true;
                        });
                      },
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                if (_invite?.groupMode == true) ...<Widget>[
                  const SizedBox(height: 8),
                  Text(
                    l10n.groupChatSummary(_participants.length),
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    FilledButton.icon(
                      onPressed: _openScanner,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: Text(l10n.scanQrButton),
                    ),
                    FilledButton.tonalIcon(
                      key: const ValueKey<String>('session-disconnect-button'),
                      onPressed: _disconnect,
                      icon: const Icon(Icons.link_off),
                      label: Text(l10n.disconnectTooltip),
                    ),
                    if (_canShowSessionQr)
                      FilledButton.tonalIcon(
                        key: const ValueKey<String>('session-qr-trigger'),
                        onPressed: _showSessionQrSheet,
                        icon: const Icon(Icons.qr_code_2),
                        label: Text(l10n.showSessionQrButton),
                      ),
                  ],
                ),
                if (_invite != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(
                    '${l10n.sessionLabel}: ${_invite!.sessionId}',
                    style: theme.textTheme.bodyMedium,
                  ),
                  Text(
                    '${l10n.expiresLabel}: ${_formatDateTime(_invite!.expiresAt)}',
                    style: theme.textTheme.bodySmall,
                  ),
                  _buildRelayServerInfo(context),
                ],
                if (_identity != null) ...<Widget>[
                  const SizedBox(height: 8),
                  _buildCurrentIdentitySummary(context, l10n),
                ],
                if (_invite?.groupMode == true &&
                    _participants.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 12),
                  _buildParticipantChips(),
                ],
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _statusColor(context),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: <Widget>[
                      Icon(_statusIcon()),
                      const SizedBox(width: 12),
                      Expanded(child: Text(_statusText)),
                      const SizedBox(width: 8),
                      _buildPluginInstallWebsiteLink(context),
                    ],
                  ),
                ),
                if (_showsSessionRenewPrompt) ...<Widget>[
                  const SizedBox(height: 12),
                  _buildSessionRenewPrompt(context, l10n),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<PrivateClawIdentity> _ensureIdentity() async {
    final PrivateClawIdentity? existing = _identity;
    if (existing != null) {
      return existing;
    }

    final PrivateClawIdentity loaded = await _identityStore.loadOrCreate();
    if (mounted) {
      setState(() {
        _identity = loaded;
      });
    } else {
      _identity = loaded;
    }
    return loaded;
  }

  Widget _buildCurrentIdentitySummary(
    BuildContext context,
    AppLocalizations l10n,
  ) {
    final PrivateClawIdentity? identity = _identity;
    if (identity == null) {
      return const SizedBox.shrink();
    }

    return Row(
      children: <Widget>[
        PrivateClawAvatar.generated(
          key: const ValueKey<String>('current-identity-avatar'),
          seedId: identity.appId,
          label: identity.displayName ?? identity.appId,
          radius: 14,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            l10n.currentAppLabel(identity.displayName ?? identity.appId),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }

  Widget _buildParticipantChips() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _participants
          .map(
            (PrivateClawParticipant participant) => Chip(
              key: ValueKey<String>('participant-chip-${participant.appId}'),
              avatar: PrivateClawAvatar.generated(
                key: ValueKey<String>(
                  'participant-avatar-${participant.appId}',
                ),
                seedId: participant.appId,
                label: participant.displayName,
                radius: 12,
              ),
              label: Text(participant.displayName),
            ),
          )
          .toList(growable: false),
    );
  }

  Widget _buildPairingSection(BuildContext context, AppLocalizations l10n) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      l10n.entryTitle,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
              ),
              if (!_hasManagedSessionContext) ...<Widget>[
                const SizedBox(height: 12),
                TextField(
                  key: const ValueKey<String>('invite-input-field'),
                  controller: _inviteController,
                  minLines: 2,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: l10n.inviteInputLabel,
                    hintText: l10n.inviteInputHint,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: <Widget>[
                  FilledButton.icon(
                    onPressed: _openScanner,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: Text(l10n.scanQrButton),
                  ),
                  if (_hasManagedSessionContext)
                    FilledButton.tonalIcon(
                      key: const ValueKey<String>('session-disconnect-button'),
                      onPressed: _disconnect,
                      icon: const Icon(Icons.link_off),
                      label: Text(l10n.disconnectTooltip),
                    )
                  else
                    FilledButton.tonalIcon(
                      key: const ValueKey<String>('connect-session-button'),
                      onPressed: () {
                        unawaited(_connectFromInput(_inviteController.text));
                      },
                      icon: const Icon(Icons.login),
                      label: Text(l10n.connectSessionButton),
                    ),
                  if (_canShowSessionQr)
                    FilledButton.tonalIcon(
                      key: const ValueKey<String>('session-qr-trigger'),
                      onPressed: _showSessionQrSheet,
                      icon: const Icon(Icons.qr_code_2),
                      label: Text(l10n.showSessionQrButton),
                    ),
                ],
              ),
              if (_invite != null) ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  '${l10n.sessionLabel}: ${_invite!.sessionId}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (_invite!.groupMode)
                  Text(
                    l10n.groupModeLabel,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                Text(
                  '${l10n.expiresLabel}: ${_formatDateTime(_invite!.expiresAt)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                _buildRelayServerInfo(context),
              ],
              if (_identity != null) ...<Widget>[
                const SizedBox(height: 8),
                _buildCurrentIdentitySummary(context, l10n),
              ],
              if (_invite?.groupMode == true &&
                  _participants.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                _buildParticipantChips(),
              ],
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _statusColor(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: <Widget>[
                    Icon(_statusIcon()),
                    const SizedBox(width: 12),
                    Expanded(child: Text(_statusText)),
                    const SizedBox(width: 8),
                    _buildPluginInstallWebsiteLink(context),
                  ],
                ),
              ),
              if (_showsSessionRenewPrompt) ...<Widget>[
                const SizedBox(height: 12),
                _buildSessionRenewPrompt(context, l10n),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMessageList(AppLocalizations l10n) {
    if (_messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            l10n.encryptedChatPlaceholder,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      );
    }

    return ListView.separated(
      controller: _scrollController,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      itemCount: _messages.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (BuildContext context, int index) {
        final ChatMessage message = _messages[index];
        return ChatMessageBubble(
          key: ValueKey<String>(message.id),
          message: message,
        );
      },
    );
  }

  Widget _buildComposer(AppLocalizations l10n) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    final Color composerControlColor = colorScheme.surfaceContainerHighest;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (_selectedAttachments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SizedBox(
                height: 72,
                child: ListView.separated(
                  key: const ValueKey<String>('composer-attachment-strip'),
                  scrollDirection: Axis.horizontal,
                  itemCount: _selectedAttachments.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (BuildContext context, int index) {
                    final ChatAttachment attachment =
                        _selectedAttachments[index];
                    return _ComposerAttachmentPreview(
                      attachment: attachment,
                      onDeleted: () => _removeAttachment(attachment.id),
                    );
                  },
                ),
              ),
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: composerControlColor,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: colorScheme.outlineVariant),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      key: const ValueKey<String>('composer-input-field'),
                      controller: _messageController,
                      focusNode: _composerFocusNode,
                      enabled: _canSend,
                      onTap: () {
                        _hideEmojiPicker();
                        _hidePhotoTray();
                      },
                      keyboardType: TextInputType.multiline,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.newline,
                      decoration: InputDecoration(
                        hintText: _canSend
                            ? l10n.sendHintActive
                            : l10n.sendHintInactive,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        isCollapsed: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    key: const ValueKey<String>('composer-expand-button'),
                    visualDensity: VisualDensity.compact,
                    onPressed: _canSend ? _openFullscreenComposer : null,
                    icon: const Icon(Icons.open_in_full),
                    tooltip: l10n.composerExpandTooltip,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              _buildComposerActionButton(
                key: const ValueKey<String>('emoji-picker-button'),
                icon: Icons.emoji_emotions_outlined,
                tooltip: l10n.emojiPickerTooltip,
                isActive: _isEmojiPickerVisible,
                onPressed: _canSend ? _openEmojiPicker : null,
              ),
              if (_supportsVoiceRecording) ...<Widget>[
                const SizedBox(width: 8),
                _buildVoiceComposerButton(l10n),
              ],
              const SizedBox(width: 8),
              _buildComposerActionButton(
                key: const ValueKey<String>('composer-photo-button'),
                icon: Icons.photo_library_outlined,
                tooltip: l10n.photoTrayTooltip,
                isActive: _supportsRecentPhotoTray && _isPhotoTrayVisible,
                isEnabled: _canSend,
                onPressed: _handlePhotoComposerButtonPressed,
              ),
              const SizedBox(width: 8),
              _buildComposerActionButton(
                key: const ValueKey<String>('composer-file-button'),
                icon: Icons.attach_file,
                tooltip: l10n.filePickerTooltip,
                isEnabled: _canSend,
                onPressed: _handleFileComposerButtonPressed,
              ),
              const Spacer(),
              IconButton.filled(
                key: const ValueKey<String>('composer-send-button'),
                onPressed: _canSend && _hasDraftContent ? _sendMessage : null,
                icon: _hasPendingReply
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_upward_rounded),
                tooltip: l10n.sendTooltip,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEmojiPickerPanel(
    AppLocalizations l10n, {
    required double height,
  }) {
    final ThemeData theme = Theme.of(context);
    return SizedBox(
      key: const ValueKey<String>('emoji-picker-panel'),
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(
            top: BorderSide(color: theme.colorScheme.outlineVariant),
          ),
        ),
        child: _CommonEmojiSheet(
          frequentEmojis: _frequentEmoji,
          defaultEmojis: _defaultEmoji,
          selectedTab: _emojiPickerTab,
          onTabChanged: (_EmojiPickerTab tab) {
            setState(() {
              _emojiPickerTab = tab;
            });
          },
          onSelected: (String emoji) {
            _insertEmoji(emoji);
          },
        ),
      ),
    );
  }

  Widget _buildPhotoTrayPanel(AppLocalizations l10n) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    return SizedBox(
      key: const ValueKey<String>('photo-tray-panel'),
      height: _photoTrayHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Text(
                    l10n.photoTrayTooltip,
                    style: theme.textTheme.titleMedium,
                  ),
                  const Spacer(),
                  TextButton.icon(
                    key: const ValueKey<String>('photo-tray-camera-button'),
                    onPressed: _canSend ? _pickFromCamera : null,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(l10n.photoTrayCameraButton),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    key: const ValueKey<String>('photo-tray-gallery-button'),
                    onPressed: _canSend ? _pickFromGallery : null,
                    icon: const Icon(Icons.collections_outlined),
                    label: Text(l10n.photoTrayGalleryButton),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: _isLoadingRecentPhotos
                    ? const Center(child: CircularProgressIndicator())
                    : _recentPhotoAssets.isEmpty
                    ? Center(
                        child: Text(
                          _photoTrayStatusText.isEmpty
                              ? l10n.photoTrayNoImages
                              : _photoTrayStatusText,
                          style: theme.textTheme.bodyMedium,
                        ),
                      )
                    : ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _recentPhotoAssets.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 12),
                        itemBuilder: (BuildContext context, int index) {
                          final AssetEntity asset = _recentPhotoAssets[index];
                          return _ComposerPhotoTile(
                            assetId: asset.id,
                            thumbnailFuture: _thumbnailFutureForAsset(asset),
                            isSelected: _photoAttachmentIdsByAssetId
                                .containsKey(asset.id),
                            isLoading: _loadingPhotoAssetIds.contains(asset.id),
                            onTap: _canSend
                                ? () {
                                    unawaited(
                                      _toggleRecentPhotoAttachment(asset),
                                    );
                                  }
                                : null,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVoiceComposerButton(AppLocalizations l10n) {
    final ThemeData theme = Theme.of(context);
    final bool enabled = _canSend && !_isStoppingVoiceRecording;
    final ColorScheme colorScheme = theme.colorScheme;
    final bool usesTapToToggle = _usesTapToToggleVoiceRecording;
    final IconData icon = _isStoppingVoiceRecording
        ? Icons.hourglass_top
        : usesTapToToggle && _isRecordingVoice
        ? Icons.send_rounded
        : Icons.mic_none;
    final String tooltip = usesTapToToggle
        ? (_isRecordingVoice
              ? l10n.voiceRecordTapAgainToSend
              : l10n.voiceRecordTapToStart)
        : l10n.voiceRecordHoldToSend;

    if (usesTapToToggle) {
      return _buildComposerActionButton(
        key: const ValueKey<String>('voice-record-button'),
        icon: icon,
        tooltip: tooltip,
        isActive: _isRecordingVoice,
        isEnabled: enabled,
        onPressed: enabled
            ? () {
                unawaited(_handleTapVoiceRecording());
              }
            : _showInactiveComposerStatus,
        foregroundColor: _isRecordingVoice
            ? colorScheme.onPrimaryContainer
            : null,
        backgroundColor: _isRecordingVoice
            ? colorScheme.primaryContainer
            : null,
      );
    }

    return Listener(
      key: const ValueKey<String>('voice-record-button'),
      behavior: HitTestBehavior.opaque,
      onPointerDown: (PointerDownEvent event) {
        if (!enabled) {
          _showInactiveComposerStatus();
          return;
        }
        unawaited(_handleVoiceHoldStart(event.position));
      },
      onPointerMove: enabled
          ? (PointerMoveEvent event) {
              _handleVoiceHoldMove(event.position);
            }
          : null,
      onPointerUp: enabled
          ? (_) {
              unawaited(_handleVoiceHoldEnd());
            }
          : null,
      onPointerCancel: enabled
          ? (_) {
              unawaited(_handleVoiceHoldCancel());
            }
          : null,
      child: _buildComposerActionButton(
        icon: icon,
        tooltip: tooltip,
        isActive: _isRecordingVoice,
        isEnabled: enabled,
        onPressed: enabled ? () {} : _showInactiveComposerStatus,
        foregroundColor: _isRecordingVoice
            ? colorScheme.onPrimaryContainer
            : null,
        backgroundColor: _isRecordingVoice
            ? colorScheme.primaryContainer
            : null,
      ),
    );
  }

  Widget _buildComposerActionButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback? onPressed,
    Key? key,
    bool isActive = false,
    bool isEnabled = true,
    Color? backgroundColor,
    Color? foregroundColor,
  }) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Opacity(
        opacity: isEnabled ? 1 : 0.45,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color:
                backgroundColor ??
                (isActive
                    ? colorScheme.primaryContainer
                    : colorScheme.surfaceContainerHighest),
            borderRadius: BorderRadius.circular(18),
          ),
          child: IconButton(
            key: key,
            onPressed: onPressed,
            icon: Icon(icon),
            color:
                foregroundColor ??
                (isActive
                    ? colorScheme.onPrimaryContainer
                    : colorScheme.onSurfaceVariant),
            constraints: const BoxConstraints.tightFor(width: 52, height: 52),
            padding: EdgeInsets.zero,
          ),
        ),
      ),
    );
  }

  Future<void> _openFullscreenComposer() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String? nextText = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        fullscreenDialog: true,
        builder: (BuildContext context) {
          return _FullscreenComposerPage(
            initialText: _messageController.text,
            title: l10n.composerFullscreenTitle,
            hintText: _canSend ? l10n.sendHintActive : l10n.sendHintInactive,
          );
        },
      ),
    );
    if (!mounted || nextText == null) {
      return;
    }
    _messageController.value = TextEditingValue(
      text: nextText,
      selection: TextSelection.collapsed(offset: nextText.length),
    );
    _composerFocusNode.requestFocus();
  }

  String _formatVoiceRecordingElapsed() {
    final Duration safeValue = _voiceRecordingElapsed.isNegative
        ? Duration.zero
        : _voiceRecordingElapsed;
    final int minutes = safeValue.inMinutes;
    final int seconds = safeValue.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  List<double> _buildVoiceWaveformSamples() {
    return List<double>.generate(24, (int index) {
      final double oscillation =
          (math.sin((_voiceRecordingTick * 0.42) + index * 0.75) + 1) / 2;
      final double modulation =
          (math.cos((_voiceRecordingTick * 0.19) + index * 0.33) + 1) / 2;
      final double emphasis = _isVoiceCancelArmed ? 0.78 : 1;
      return (0.16 + ((oscillation * 0.54) + (modulation * 0.26)) * emphasis)
          .clamp(0.14, 0.92);
    });
  }

  String _formatDateTime(DateTime value) {
    final Locale locale = Localizations.localeOf(context);
    return DateFormat.yMd(locale.toString()).add_jm().format(value.toLocal());
  }

  String _formatRemainingDuration(Duration value) {
    final Duration safeValue = value.isNegative ? Duration.zero : value;
    final int totalMinutes = safeValue.inMinutes;
    final int hours = totalMinutes ~/ 60;
    final int minutes = totalMinutes % 60;
    if (hours <= 0) {
      return '${minutes}m';
    }
    if (minutes == 0) {
      return '${hours}h';
    }
    return '${hours}h ${minutes}m';
  }

  String _nextSystemMessageId(String label) {
    return '$label-${DateTime.now().microsecondsSinceEpoch}';
  }
}

class _PrivateClawAppBarIcon extends StatelessWidget {
  const _PrivateClawAppBarIcon();

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      key: const ValueKey<String>('app-bar-icon'),
      borderRadius: BorderRadius.circular(8),
      child: Image.asset(
        privateClawAppIconAsset,
        width: 28,
        height: 28,
        fit: BoxFit.cover,
      ),
    );
  }
}

class _CommonEmojiSheet extends StatelessWidget {
  const _CommonEmojiSheet({
    required this.frequentEmojis,
    required this.defaultEmojis,
    required this.selectedTab,
    required this.onTabChanged,
    required this.onSelected,
  });

  final List<String> frequentEmojis;
  final List<String> defaultEmojis;
  final _EmojiPickerTab selectedTab;
  final ValueChanged<_EmojiPickerTab> onTabChanged;
  final ValueChanged<String> onSelected;

  List<String> get _visibleEmojis =>
      selectedTab == _EmojiPickerTab.frequent ? frequentEmojis : defaultEmojis;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text(l10n.emojiPickerTitle, style: theme.textTheme.titleMedium),
                const SizedBox(width: 12),
                ChoiceChip(
                  label: Text(l10n.emojiPickerFrequentTab),
                  selected: selectedTab == _EmojiPickerTab.frequent,
                  onSelected: (_) {
                    onTabChanged(_EmojiPickerTab.frequent);
                  },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.emojiPickerDefaultTab),
                  selected: selectedTab == _EmojiPickerTab.defaults,
                  onSelected: (_) {
                    onTabChanged(_EmojiPickerTab.defaults);
                  },
                ),
              ],
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _visibleEmojis
                    .map(
                      (String emoji) => TextButton(
                        onPressed: () => onSelected(emoji),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(48, 48),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                        child: Text(
                          emoji,
                          style: theme.textTheme.headlineSmall,
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComposerAttachmentPreview extends StatelessWidget {
  const _ComposerAttachmentPreview({
    required this.attachment,
    required this.onDeleted,
  });

  final ChatAttachment attachment;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Uint8List? imageBytes = attachment.isImage
        ? attachment.decodeBytes()
        : null;
    final bool showsImage = imageBytes != null && imageBytes.isNotEmpty;
    final double width = showsImage ? 72 : 188;
    return SizedBox(
      width: width,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: showsImage
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(17),
                      child: Image.memory(imageBytes, fit: BoxFit.cover),
                    )
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: <Widget>[
                          Icon(_attachmentIconForPreview(attachment)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              attachment.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
          Positioned(
            top: -6,
            right: -6,
            child: Material(
              color: theme.colorScheme.surface,
              shape: const CircleBorder(),
              elevation: 2,
              child: InkWell(
                onTap: onDeleted,
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close, size: 16),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ComposerPhotoTile extends StatelessWidget {
  const _ComposerPhotoTile({
    required this.assetId,
    required this.thumbnailFuture,
    required this.isSelected,
    required this.isLoading,
    required this.onTap,
  });

  final String assetId;
  final Future<Uint8List?> thumbnailFuture;
  final bool isSelected;
  final bool isLoading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey<String>('photo-tray-tile-$assetId'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: 120,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(19),
            child: Stack(
              fit: StackFit.expand,
              children: <Widget>[
                FutureBuilder<Uint8List?>(
                  future: thumbnailFuture,
                  builder:
                      (
                        BuildContext context,
                        AsyncSnapshot<Uint8List?> snapshot,
                      ) {
                        final Uint8List? bytes = snapshot.data;
                        if (bytes == null || bytes.isEmpty) {
                          return DecoratedBox(
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHighest,
                            ),
                            child: const Center(
                              child: Icon(Icons.photo_outlined),
                            ),
                          );
                        }
                        return Image.memory(bytes, fit: BoxFit.cover);
                      },
                ),
                if (isSelected)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.2),
                    ),
                  ),
                if (isLoading) const Center(child: CircularProgressIndicator()),
                Positioned(
                  top: 8,
                  right: 8,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 120),
                    opacity: isSelected ? 1 : 0,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceWaveformBars extends StatelessWidget {
  const _VoiceWaveformBars({
    required this.samples,
    required this.activeColor,
    required this.inactiveColor,
  });

  final List<double> samples;
  final Color activeColor;
  final Color inactiveColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Row(
        children: samples
            .map(
              (double sample) => Expanded(
                child: Align(
                  alignment: Alignment.center,
                  child: Container(
                    width: 4,
                    height: 16 + (sample * 40),
                    decoration: BoxDecoration(
                      color: Color.lerp(inactiveColor, activeColor, sample),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

class _VoiceRecordingActionBadge extends StatelessWidget {
  const _VoiceRecordingActionBadge({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, color: foregroundColor),
            const SizedBox(width: 8),
            Text(
              label,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: foregroundColor,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FullscreenComposerPage extends StatefulWidget {
  const _FullscreenComposerPage({
    required this.initialText,
    required this.title,
    required this.hintText,
  });

  final String initialText;
  final String title;
  final String hintText;

  @override
  State<_FullscreenComposerPage> createState() =>
      _FullscreenComposerPageState();
}

class _FullscreenComposerPageState extends State<_FullscreenComposerPage> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialText,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<bool> _handleWillPop() async {
    Navigator.of(context).pop(_controller.text);
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final Color composerControlColor = Theme.of(
      context,
    ).colorScheme.surfaceContainerHighest;
    return WillPopScope(
      onWillPop: _handleWillPop,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          actions: <Widget>[
            IconButton(
              onPressed: () {
                Navigator.of(context).pop(_controller.text);
              },
              icon: const Icon(Icons.check),
            ),
          ],
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: DecoratedBox(
              key: const ValueKey<String>('fullscreen-composer-shell'),
              decoration: BoxDecoration(
                color: composerControlColor,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                child: TextField(
                  key: const ValueKey<String>(
                    'fullscreen-composer-input-field',
                  ),
                  controller: _controller,
                  autofocus: true,
                  keyboardType: TextInputType.multiline,
                  textInputAction: TextInputAction.newline,
                  textAlignVertical: TextAlignVertical.top,
                  expands: true,
                  minLines: null,
                  maxLines: null,
                  decoration: InputDecoration(
                    hintText: widget.hintText,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    isCollapsed: true,
                    alignLabelWithHint: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

IconData _attachmentIconForPreview(ChatAttachment attachment) {
  if (attachment.isImage) {
    return Icons.image_outlined;
  }
  if (attachment.isAudio) {
    return Icons.mic_none;
  }
  if (attachment.isVideo) {
    return Icons.videocam_outlined;
  }
  return Icons.attach_file;
}

class _SlashCommandsSheet extends StatefulWidget {
  const _SlashCommandsSheet({required this.commands});

  final List<PrivateClawSlashCommand> commands;

  @override
  State<_SlashCommandsSheet> createState() => _SlashCommandsSheetState();
}

class _SlashCommandsSheetState extends State<_SlashCommandsSheet> {
  final TextEditingController _searchController = TextEditingController();

  List<PrivateClawSlashCommand> get _filteredCommands {
    final String query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      return widget.commands;
    }
    return widget.commands
        .where((PrivateClawSlashCommand command) {
          final String haystack = '${command.slash} ${command.description}'
              .toLowerCase();
          return haystack.contains(query);
        })
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final List<PrivateClawSlashCommand> commands = _filteredCommands;
    final double keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final double screenHeight = MediaQuery.sizeOf(context).height;
    final double sheetHeight = screenHeight > 700 ? 520 : screenHeight * 0.72;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: keyboardInset),
      child: SizedBox(
        height: sheetHeight,
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: TextField(
                key: const ValueKey<String>('slash-command-search'),
                controller: _searchController,
                autofocus: true,
                onChanged: (_) {
                  setState(() {});
                },
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: MaterialLocalizations.of(context).searchFieldLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            Expanded(
              child: commands.isEmpty
                  ? const Center(child: Icon(Icons.search_off))
                  : ListView.separated(
                      padding: const EdgeInsets.only(bottom: 16),
                      itemCount: commands.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (BuildContext context, int index) {
                        final PrivateClawSlashCommand item = commands[index];
                        return ListTile(
                          leading: const Icon(Icons.terminal),
                          title: Text(item.slash),
                          subtitle: Text(item.description),
                          trailing: item.acceptsArgs
                              ? const Icon(Icons.edit_outlined)
                              : null,
                          onTap: () {
                            Navigator.of(context).pop(item);
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
