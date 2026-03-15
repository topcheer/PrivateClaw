import 'dart:async';
import 'dart:convert';
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
import 'services/privateclaw_debug_bootstrap.dart';
import 'services/privateclaw_identity_store.dart';
import 'services/privateclaw_firebase_options.dart';
import 'services/privateclaw_notification_service.dart';
import 'services/privateclaw_session_client.dart';
import 'store_screenshot_preview.dart';
import 'widgets/chat_message_bubble.dart';
import 'widgets/invite_scanner_sheet.dart';
import 'widgets/session_qr_sheet.dart';

const int _maxInlineAttachmentBytes = 5 * 1024 * 1024;
const Duration _sessionRenewWarningThreshold = Duration(minutes: 30);
const String _sessionRenewCommandSlash = '/renew-session';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (privateClawSupportsFirebasePushOnCurrentPlatform()) {
    FirebaseMessaging.onBackgroundMessage(privateClawBackgroundMessageHandler);
  }
  await PrivateClawNotificationService.instance.bootstrap();
  final StoreScreenshotConfig screenshotConfig =
      StoreScreenshotConfig.fromEnvironment();
  runApp(PrivateClawApp(screenshotConfig: screenshotConfig));
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
  });

  final StoreScreenshotConfig screenshotConfig;

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
      home: PrivateClawHomePage(previewData: screenshotConfig.previewData),
    );
  }
}

class PrivateClawHomePage extends StatefulWidget {
  const PrivateClawHomePage({super.key, this.previewData});

  final PrivateClawPreviewData? previewData;

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

  bool get _canSend => _sessionStatus == PrivateClawSessionStatus.active;
  bool get _hasPendingReply =>
      _messages.any((ChatMessage message) => message.isPending);
  bool get _hasDraftContent =>
      _messageController.text.trim().isNotEmpty ||
      _selectedAttachments.isNotEmpty;
  bool get _canCollapsePairingPanel =>
      _invite != null &&
      (_sessionStatus == PrivateClawSessionStatus.active ||
          (_hasConnectedSession &&
              (_sessionStatus == PrivateClawSessionStatus.reconnecting ||
                  _sessionStatus == PrivateClawSessionStatus.relayAttached)));
  bool get _canShowSessionQr =>
      _invite != null &&
      (_hasConnectedSession ||
          _sessionStatus == PrivateClawSessionStatus.active ||
          _sessionStatus == PrivateClawSessionStatus.reconnecting ||
          _sessionStatus == PrivateClawSessionStatus.relayAttached);
  bool get _isPreviewMode => widget.previewData != null;
  bool get _showsDisconnectAction =>
      _client != null ||
      (_isPreviewMode &&
          _invite != null &&
          _sessionStatus != PrivateClawSessionStatus.idle);
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
    setState(() {});
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

  Future<void> _connectFromInput(String rawInvite) async {
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

    await _disposeClient(reason: 'switch_session');
    await _activeSessionStore.clear();

    try {
      final PrivateClawInvite invite = PrivateClawInvite.fromScan(trimmed);
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
      pushTokenProvider: _notificationService.getPushToken,
    );
    final StreamSubscription<PrivateClawSessionEvent> subscription = client
        .events
        .listen(_handleClientEvent);

    setState(() {
      _hasConnectedSession = !resetConversationState && _hasConnectedSession;
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

    try {
      await _notificationService.prepareForSession();
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] notification setup failed: $error');
      debugPrintStack(stackTrace: stackTrace);
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
      );
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] failed to restore session: $error');
      debugPrintStack(stackTrace: stackTrace);
      if (!mounted) {
        return;
      }
      final AppLocalizations l10n = AppLocalizations.of(context)!;
      setState(() {
        _identity = record.identity;
        _invite = record.invite;
        _sessionStatus = PrivateClawSessionStatus.error;
        _statusText = l10n.connectFailed(error.toString());
        _isPairingPanelCollapsed = false;
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
          _isPairingPanelCollapsed = false;
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
    _scheduleScrollToBottom();
  }

  void _upsertMessage(ChatMessage message) {
    final int existingMessageIndex = _messages.indexWhere(
      (ChatMessage item) => item.id == message.id,
    );
    if (existingMessageIndex >= 0) {
      _messages[existingMessageIndex] = message;
      return;
    }

    if (message.isPending) {
      final int existingPendingIndex = _messages.indexWhere(
        (ChatMessage item) => item.id == message.id,
      );
      if (existingPendingIndex >= 0) {
        _messages[existingPendingIndex] = message;
        return;
      }
      _messages.add(message);
      return;
    }

    if (message.replyTo != null) {
      _messages.removeWhere(
        (ChatMessage item) => item.isPending && item.replyTo == message.replyTo,
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

  Future<void> _openSlashCommands() async {
    if (!_canSend || _availableCommands.isEmpty) {
      return;
    }

    final PrivateClawSlashCommand? command =
        await showModalBottomSheet<PrivateClawSlashCommand>(
          context: context,
          useSafeArea: true,
          showDragHandle: true,
          builder: (BuildContext context) {
            return ListView.separated(
              shrinkWrap: true,
              itemCount: _availableCommands.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (BuildContext context, int index) {
                final PrivateClawSlashCommand item = _availableCommands[index];
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
            );
          },
        );

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

    return Scaffold(
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text(l10n.appTitle),
        actions: <Widget>[
          if (_showsDisconnectAction)
            IconButton(
              tooltip: l10n.disconnectTooltip,
              onPressed: _disconnect,
              icon: const Icon(Icons.link_off),
            ),
        ],
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SafeArea(
          bottom: false,
          child: AnimatedPadding(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            padding: EdgeInsets.only(bottom: keyboardInset),
            child: Column(
              children: <Widget>[
                _buildPairingSection(context, l10n),
                Expanded(child: _buildMessageList(l10n)),
                _buildComposer(l10n),
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

  Widget _buildPairingSection(BuildContext context, AppLocalizations l10n) {
    if (_canCollapsePairingPanel && _isPairingPanelCollapsed) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton.tonal(
                    onPressed: () {
                      setState(() {
                        _isPairingPanelCollapsed = false;
                      });
                    },
                    child: Row(
                      children: <Widget>[
                        Icon(_statusIcon()),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              if (_invite?.groupMode == true)
                                Text(
                                  l10n.groupChatSummary(_participants.length),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              Text(
                                _statusText,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (_invite != null)
                                Text(
                                  _invite!.sessionId,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                        const Icon(Icons.expand_more),
                      ],
                    ),
                  ),
                ),
                if (_canShowSessionQr)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: IconButton.filledTonal(
                      key: const ValueKey<String>('session-qr-trigger'),
                      tooltip: l10n.showSessionQrButton,
                      onPressed: _showSessionQrSheet,
                      icon: const Icon(Icons.qr_code_2),
                    ),
                  ),
              ],
            ),
            if (_showsSessionRenewPrompt) ...<Widget>[
              const SizedBox(height: 12),
              _buildSessionRenewPrompt(context, l10n),
            ],
          ],
        ),
      );
    }

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
                  if (_canCollapsePairingPanel)
                    IconButton(
                      onPressed: () {
                        setState(() {
                          _isPairingPanelCollapsed = true;
                        });
                      },
                      icon: const Icon(Icons.expand_less),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _inviteController,
                minLines: 2,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: l10n.inviteInputLabel,
                  hintText: l10n.inviteInputHint,
                  border: const OutlineInputBorder(),
                ),
              ),
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
              ],
              if (_identity != null) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  l10n.currentAppLabel(
                    _identity!.displayName ?? _identity!.appId,
                  ),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if (_invite?.groupMode == true &&
                  _participants.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _participants
                      .map(
                        (PrivateClawParticipant participant) => Chip(
                          avatar: Icon(
                            participant.appId == _identity?.appId
                                ? Icons.person
                                : Icons.group,
                            size: 18,
                          ),
                          label: Text(participant.displayName),
                        ),
                      )
                      .toList(growable: false),
                ),
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
                onPressed: _canSend ? _pickAttachments : null,
                icon: const Icon(Icons.attach_file),
              ),
              if (_availableCommands.isNotEmpty)
                IconButton(
                  onPressed: _canSend ? _openSlashCommands : null,
                  icon: const Icon(Icons.terminal),
                ),
              Expanded(
                child: TextField(
                  controller: _messageController,
                  focusNode: _composerFocusNode,
                  enabled: _canSend,
                  minLines: 1,
                  maxLines: 1,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) {
                    unawaited(_sendMessage());
                  },
                  decoration: InputDecoration(
                    hintText: _canSend
                        ? l10n.sendHintActive
                        : l10n.sendHintInactive,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              IconButton.filled(
                onPressed: _canSend && _hasDraftContent ? _sendMessage : null,
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
          ),
        ],
      ),
    );
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
