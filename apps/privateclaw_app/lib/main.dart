import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart';

import 'l10n/app_localizations.dart';
import 'models/chat_attachment.dart';
import 'models/chat_message.dart';
import 'models/privateclaw_identity.dart';
import 'models/privateclaw_invite.dart';
import 'models/privateclaw_participant.dart';
import 'models/privateclaw_slash_command.dart';
import 'services/privateclaw_active_session_store.dart';
import 'services/privateclaw_audio_recorder.dart';
import 'services/privateclaw_debug_bootstrap.dart';
import 'services/privateclaw_identity_store.dart';
import 'services/privateclaw_firebase_options.dart';
import 'services/privateclaw_notification_service.dart';
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
const List<String> _commonEmoji = <String>[
  '😀',
  '😂',
  '🥹',
  '😍',
  '🤔',
  '😴',
  '😭',
  '😡',
  '👍',
  '👎',
  '🙏',
  '👏',
  '💪',
  '🎉',
  '🔥',
  '❤️',
  '💯',
  '✨',
  '🤖',
  '🦀',
  '🐾',
  '🌙',
  '☀️',
  '🍀',
];

enum _ComposerInputMode { text, voice }

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

bool privateClawShouldSuspendLiveSession(AppLifecycleState state) {
  return state == AppLifecycleState.paused ||
      state == AppLifecycleState.hidden ||
      state == AppLifecycleState.detached;
}

class PrivateClawApp extends StatelessWidget {
  const PrivateClawApp({
    super.key,
    this.screenshotConfig = const StoreScreenshotConfig(),
    this.skipNotificationsInDebug = false,
  });

  final StoreScreenshotConfig screenshotConfig;
  final bool skipNotificationsInDebug;

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
      ),
    );
  }
}

class PrivateClawHomePage extends StatefulWidget {
  const PrivateClawHomePage({
    super.key,
    this.previewData,
    this.skipNotificationsInDebug = false,
  });

  final PrivateClawPreviewData? previewData;
  final bool skipNotificationsInDebug;

  @override
  State<PrivateClawHomePage> createState() => _PrivateClawHomePageState();
}

class _PrivateClawHomePageState extends State<PrivateClawHomePage>
    with WidgetsBindingObserver {
  final PrivateClawActiveSessionStore _activeSessionStore =
      const PrivateClawActiveSessionStore();
  final PrivateClawIdentityStore _identityStore =
      const PrivateClawIdentityStore();
  final PrivateClawNotificationService _notificationService =
      PrivateClawNotificationService.instance;
  final TextEditingController _inviteController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();
  final FocusNode _composerFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessage> _messages = <ChatMessage>[];
  final List<ChatAttachment> _selectedAttachments = <ChatAttachment>[];
  final List<PrivateClawSlashCommand> _availableCommands =
      <PrivateClawSlashCommand>[];
  final List<PrivateClawParticipant> _participants = <PrivateClawParticipant>[];

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
  _ComposerInputMode _composerInputMode = _ComposerInputMode.text;
  bool _isRecordingVoice = false;
  bool _isStoppingVoiceRecording = false;
  Future<void>? _voiceRecordingStartFuture;
  bool _isEmojiPickerVisible = false;
  double _lastKeyboardInsetHeight = 320;
  Offset? _voiceHoldStartGlobalPosition;
  bool _isVoiceCancelArmed = false;
  bool _isSlashCommandsSheetOpen = false;
  String _previousComposerText = '';
  final PrivateClawDebugPendingInviteData? _debugPendingInvite =
      loadPrivateClawDebugPendingInviteFromEnvironment();

  bool get _canSend => _sessionStatus == PrivateClawSessionStatus.active;
  bool get _hasPendingReply =>
      _messages.any((ChatMessage message) => message.isPending);
  bool get _hasDraftContent =>
      _messageController.text.trim().isNotEmpty ||
      _selectedAttachments.isNotEmpty;
  bool get _isVoiceInputMode => _composerInputMode == _ComposerInputMode.voice;
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
  bool get _hasLiveSessionContext =>
      _invite != null &&
      (_hasConnectedSession ||
          _sessionStatus == PrivateClawSessionStatus.active ||
          _sessionStatus == PrivateClawSessionStatus.reconnecting ||
          _sessionStatus == PrivateClawSessionStatus.relayAttached);
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

    if (!privateClawShouldSuspendLiveSession(state)) {
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
        !_isVoiceInputMode &&
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
    final PrivateClawSessionClient client = PrivateClawSessionClient(
      invite,
      identity: identity,
      pushTokenProvider: widget.skipNotificationsInDebug
          ? null
          : _notificationService.getPushToken,
    );
    final StreamSubscription<PrivateClawSessionEvent> subscription = client
        .events
        .listen(_handleClientEvent);

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
    if (_isPreviewMode || _client != null) {
      return;
    }

    final PrivateClawActiveSessionRecord? record =
        await _loadDebugBootstrapSessionIfAvailable() ??
        await _activeSessionStore.load();
    if (record == null) {
      return;
    }
    if (record.invite.expiresAt.isBefore(DateTime.now().toUtc())) {
      await _activeSessionStore.clear();
      return;
    }

    try {
      await _identityStore.save(record.identity);
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
        _upsertMessage(event.message!);
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

  void _upsertMessage(ChatMessage message) {
    if (message.isPending && message.replyTo != null) {
      final int repliedMessageIndex = _messages.indexWhere(
        (ChatMessage item) =>
            item.id == message.replyTo && item.sender == ChatSender.user,
      );
      if (repliedMessageIndex >= 0) {
        _messages[repliedMessageIndex] = _messages[repliedMessageIndex]
            .copyWith(isPending: true);
        _messages.removeWhere(
          (ChatMessage item) =>
              item.sender == ChatSender.assistant &&
              item.isPending &&
              item.replyTo == message.replyTo,
        );
        return;
      }
    }

    final int existingMessageIndex = _messages.indexWhere(
      (ChatMessage item) => item.id == message.id,
    );
    if (existingMessageIndex >= 0) {
      final ChatMessage existing = _messages[existingMessageIndex];
      _messages[existingMessageIndex] = message.copyWith(
        isPending:
            existing.sender == ChatSender.user &&
                existing.id == message.id &&
                existing.isPending
            ? true
            : message.isPending,
      );
      return;
    }

    if (message.isPending) {
      _messages.add(message);
      return;
    }

    if (message.replyTo != null) {
      final int repliedMessageIndex = _messages.indexWhere(
        (ChatMessage item) =>
            item.id == message.replyTo && item.sender == ChatSender.user,
      );
      if (repliedMessageIndex >= 0 &&
          _messages[repliedMessageIndex].isPending) {
        _messages[repliedMessageIndex] = _messages[repliedMessageIndex]
            .copyWith(isPending: false);
      }
      _messages.removeWhere(
        (ChatMessage item) =>
            item.sender == ChatSender.assistant &&
            item.isPending &&
            item.replyTo == message.replyTo,
      );
    }
    _messages.add(message);
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
    final String? scannedInvite = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (BuildContext context) {
        return InviteScannerSheet(
          onDetected: (String value) {
            Navigator.of(context).pop(value);
          },
        );
      },
    );

    if (!mounted || scannedInvite == null) {
      return;
    }

    _inviteController.text = scannedInvite;
    await _connectFromInput(scannedInvite);
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

  Future<void> _pickAttachments() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    try {
      final FilePickerResult? result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        withData: true,
        type: FileType.any,
      );
      if (result == null || result.files.isEmpty) {
        return;
      }

      final List<ChatAttachment> nextAttachments = <ChatAttachment>[];
      for (final PlatformFile file in result.files) {
        final Uint8List? bytes = file.bytes;
        if (bytes == null || bytes.isEmpty) {
          continue;
        }
        if (bytes.length > _maxInlineAttachmentBytes) {
          setState(() {
            _statusText = l10n.sendFailed('attachment_too_large:${file.name}');
          });
          continue;
        }

        nextAttachments.add(
          ChatAttachment(
            id: _nextAttachmentId(),
            name: file.name,
            mimeType: _inferMimeType(file.name),
            sizeBytes: bytes.length,
            dataBase64: base64Encode(bytes),
          ),
        );
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

  Future<void> _sendMessage() async {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final PrivateClawSessionClient? client = _client;
    final String text = _messageController.text.trim();
    final List<ChatAttachment> attachments = List<ChatAttachment>.from(
      _selectedAttachments,
    );
    if (client == null || (text.isEmpty && attachments.isEmpty)) {
      return;
    }

    _messageController.clear();
    setState(() {
      _selectedAttachments.clear();
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
      _sessionStatus = PrivateClawSessionStatus.idle;
      _statusText = l10n.sessionDisconnected;
      _isPairingPanelCollapsed = false;
      _isRenewingSession = false;
    });
    _sessionExpiryRefreshTimer?.cancel();
  }

  Future<void> _openEmojiPicker() async {
    if (_isVoiceInputMode) {
      return;
    }

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
      _isEmojiPickerVisible = true;
    });
    _composerFocusNode.unfocus();
  }

  Future<void> _openSlashCommands() async {
    if (!_canSend || _availableCommands.isEmpty || _isVoiceInputMode) {
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
    });
  }

  void _toggleComposerInputMode() {
    if (!_canSend) {
      return;
    }

    setState(() {
      _isEmojiPickerVisible = false;
      _composerInputMode = _isVoiceInputMode
          ? _ComposerInputMode.text
          : _ComposerInputMode.voice;
    });
    if (_isVoiceInputMode) {
      _composerFocusNode.unfocus();
      return;
    }
    _composerFocusNode.requestFocus();
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
      _voiceHoldStartGlobalPosition = globalPosition;
      _isVoiceCancelArmed = false;
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
  }

  void _hideEmojiPicker() {
    if (!_isEmojiPickerVisible) {
      return;
    }
    setState(() {
      _isEmojiPickerVisible = false;
    });
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
    });

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
    } on UnsupportedError {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRecordingVoice = false;
        _resetVoiceHoldOverlayState();
        _statusText = l10n.voiceRecordingUnsupported;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isRecordingVoice = false;
        _resetVoiceHoldOverlayState();
        _statusText = l10n.voiceRecordingFailed(error.toString());
      });
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
          FocusScope.of(context).unfocus();
          _hideEmojiPicker();
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
    return Positioned.fill(
      child: IgnorePointer(
        child: ColoredBox(
          color: Colors.black.withValues(alpha: 0.18),
          child: SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 120),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    _VoiceRecordingOverlayChip(
                      key: const ValueKey<String>('voice-record-cancel-chip'),
                      label: l10n.relayWarningCancelButton,
                      icon: Icons.close,
                      highlighted: _isVoiceCancelArmed,
                      backgroundColor: _isVoiceCancelArmed
                          ? theme.colorScheme.errorContainer
                          : theme.colorScheme.surfaceContainerHigh,
                      foregroundColor: _isVoiceCancelArmed
                          ? theme.colorScheme.onErrorContainer
                          : theme.colorScheme.onSurface,
                    ),
                    const SizedBox(height: 12),
                    _VoiceRecordingOverlayChip(
                      key: const ValueKey<String>('voice-record-release-chip'),
                      label: l10n.voiceRecordReleaseToSend,
                      icon: Icons.north,
                      highlighted: !_isVoiceCancelArmed,
                      backgroundColor: _isVoiceCancelArmed
                          ? theme.colorScheme.surfaceContainerHigh
                          : theme.colorScheme.primaryContainer,
                      foregroundColor: _isVoiceCancelArmed
                          ? theme.colorScheme.onSurfaceVariant
                          : theme.colorScheme.onPrimaryContainer,
                    ),
                  ],
                ),
              ),
            ),
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
    final Color composerControlColor =
        theme.colorScheme.surfaceContainerHighest;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (_selectedAttachments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _selectedAttachments
                      .map(
                        (ChatAttachment attachment) => InputChip(
                          avatar: Icon(_attachmentIcon(attachment)),
                          label: SizedBox(
                            width: 160,
                            child: Text(
                              attachment.name,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          onDeleted: () => _removeAttachment(attachment.id),
                        ),
                      )
                      .toList(growable: false),
                ),
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                onPressed: _canSend ? _pickAttachments : null,
                icon: const Icon(Icons.attach_file),
              ),
              IconButton(
                key: const ValueKey<String>('composer-input-mode-toggle'),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                onPressed: _canSend ? _toggleComposerInputMode : null,
                icon: Icon(
                  _isVoiceInputMode ? Icons.keyboard_outlined : Icons.mic_none,
                ),
                tooltip: _isVoiceInputMode
                    ? l10n.switchToTextInputTooltip
                    : l10n.switchToVoiceInputTooltip,
              ),
              Expanded(
                child: _isVoiceInputMode
                    ? _buildVoiceComposerButton(
                        l10n,
                        backgroundColor: composerControlColor,
                      )
                    : DecoratedBox(
                        decoration: BoxDecoration(
                          color: composerControlColor,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: <Widget>[
                            Expanded(
                              child: TextField(
                                key: const ValueKey<String>(
                                  'composer-input-field',
                                ),
                                controller: _messageController,
                                focusNode: _composerFocusNode,
                                enabled: _canSend,
                                onTap: _hideEmojiPicker,
                                keyboardType: TextInputType.multiline,
                                minLines: 1,
                                maxLines: 5,
                                textInputAction: TextInputAction.newline,
                                decoration: InputDecoration(
                                  hintText: _canSend
                                      ? l10n.sendHintActive
                                      : l10n.sendHintInactive,
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  disabledBorder: InputBorder.none,
                                  contentPadding: const EdgeInsets.fromLTRB(
                                    16,
                                    12,
                                    4,
                                    12,
                                  ),
                                ),
                              ),
                            ),
                            IconButton(
                              key: const ValueKey<String>(
                                'emoji-picker-button',
                              ),
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(
                                minWidth: 40,
                                minHeight: 40,
                              ),
                              onPressed: _canSend ? _openEmojiPicker : null,
                              icon: const Icon(Icons.emoji_emotions_outlined),
                              tooltip: l10n.emojiPickerTooltip,
                            ),
                          ],
                        ),
                      ),
              ),
              if (!_isVoiceInputMode && _hasDraftContent) ...<Widget>[
                const SizedBox(width: 4),
                IconButton.filled(
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(
                    minWidth: 40,
                    minHeight: 40,
                  ),
                  onPressed: _canSend ? _sendMessage : null,
                  icon: _hasPendingReply
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  tooltip: l10n.sendTooltip,
                ),
              ],
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
          emojis: _commonEmoji,
          onSelected: (String emoji) {
            _insertEmoji(emoji);
          },
        ),
      ),
    );
  }

  Widget _buildVoiceComposerButton(
    AppLocalizations l10n, {
    required Color backgroundColor,
  }) {
    final ThemeData theme = Theme.of(context);
    final bool enabled = _canSend && !_isStoppingVoiceRecording;
    final Color foregroundColor = theme.colorScheme.onSurface;

    return Listener(
      key: const ValueKey<String>('voice-record-button'),
      behavior: HitTestBehavior.opaque,
      onPointerDown: enabled
          ? (PointerDownEvent event) {
              unawaited(_handleVoiceHoldStart(event.position));
            }
          : null,
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        constraints: const BoxConstraints(minHeight: 56),
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            if (_isStoppingVoiceRecording)
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: foregroundColor,
                ),
              )
            else
              Icon(
                _isRecordingVoice ? Icons.mic : Icons.mic_none,
                color: foregroundColor,
              ),
            const SizedBox(width: 12),
            Flexible(
              child: Text(
                _voiceComposerLabel(l10n),
                key: const ValueKey<String>('voice-record-label'),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: foregroundColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _voiceComposerLabel(AppLocalizations l10n) {
    if (_isStoppingVoiceRecording) {
      return l10n.voiceRecordSending;
    }
    if (_isRecordingVoice) {
      return l10n.voiceRecordReleaseToSend;
    }
    if (!_canSend) {
      return l10n.voiceRecordUnavailable;
    }
    return l10n.voiceRecordHoldToSend;
  }

  IconData _attachmentIcon(ChatAttachment attachment) {
    if (attachment.isImage) {
      return Icons.image_outlined;
    }
    if (attachment.isAudio) {
      return Icons.audiotrack;
    }
    if (attachment.isVideo) {
      return Icons.videocam_outlined;
    }
    return Icons.attach_file;
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
  const _CommonEmojiSheet({required this.emojis, required this.onSelected});

  final List<String> emojis;
  final ValueChanged<String> onSelected;

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
            Text(l10n.emojiPickerTitle, style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: emojis
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

class _VoiceRecordingOverlayChip extends StatelessWidget {
  const _VoiceRecordingOverlayChip({
    required this.label,
    required this.icon,
    required this.highlighted,
    required this.backgroundColor,
    required this.foregroundColor,
    super.key,
  });

  final String label;
  final IconData icon;
  final bool highlighted;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: 220,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(18),
        boxShadow: highlighted
            ? <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.18),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ]
            : const <BoxShadow>[],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
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
    );
  }
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
