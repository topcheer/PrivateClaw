import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/status.dart' as status;

import '../models/chat_attachment.dart';
import '../models/chat_message.dart';
import '../models/privateclaw_identity.dart';
import '../models/privateclaw_invite.dart';
import '../models/privateclaw_participant.dart';
import '../models/privateclaw_slash_command.dart';
import 'privateclaw_crypto.dart';

const Duration _connectTimeout = Duration(seconds: 15);
const Duration _pingInterval = Duration(seconds: 20);
const Duration _initialReconnectDelay = Duration(seconds: 1);
const Duration _maxReconnectDelay = Duration(seconds: 30);

enum PrivateClawSessionStatus {
  idle,
  connecting,
  reconnecting,
  relayAttached,
  active,
  closed,
  error,
}

enum PrivateClawSessionNotice {
  connectingRelay,
  relayAttached,
  connectionError,
  sessionClosed,
  relayError,
  unknownRelayEvent,
  unknownPayload,
  welcome,
}

typedef PrivateClawPushTokenProvider = Future<String?> Function();

class PrivateClawSessionEvent {
  const PrivateClawSessionEvent({
    this.message,
    this.notice,
    this.details,
    this.connectionStatus,
    this.updatedInvite,
    this.commands,
    this.renewedExpiresAt,
    this.renewedReplyTo,
    this.participants,
    this.assignedIdentity,
  });

  final ChatMessage? message;
  final PrivateClawSessionNotice? notice;
  final String? details;
  final PrivateClawSessionStatus? connectionStatus;
  final PrivateClawInvite? updatedInvite;
  final List<PrivateClawSlashCommand>? commands;
  final DateTime? renewedExpiresAt;
  final String? renewedReplyTo;
  final List<PrivateClawParticipant>? participants;
  final PrivateClawIdentity? assignedIdentity;
}

class PrivateClawSessionClient {
  PrivateClawSessionClient(
    this.invite, {
    required PrivateClawIdentity identity,
    this.pushTokenProvider,
  }) : _identity = identity;

  PrivateClawInvite invite;
  PrivateClawIdentity _identity;
  final PrivateClawPushTokenProvider? pushTokenProvider;
  final StreamController<PrivateClawSessionEvent> _eventsController =
      StreamController<PrivateClawSessionEvent>.broadcast();

  Stream<PrivateClawSessionEvent> get events => _eventsController.stream;

  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  PrivateClawCrypto? _crypto;
  Timer? _reconnectTimer;
  bool _disposed = false;
  bool _sawTerminalClose = false;
  bool _hasEstablishedSession = false;
  int _messageCounter = 0;
  int _connectionGeneration = 0;
  Duration _reconnectDelay = _initialReconnectDelay;
  String? _registeredPushToken;

  PrivateClawIdentity get identity => _identity;

  Future<void> connect() async {
    if (_disposed) {
      throw StateError('PrivateClaw session client has been disposed.');
    }

    _sawTerminalClose = false;
    _hasEstablishedSession = false;
    await _resetCrypto(invite.sessionKey);
    await _openSocket(PrivateClawSessionStatus.connecting);
  }

  Future<void> _openSocket(PrivateClawSessionStatus statusValue) async {
    if (_disposed) {
      return;
    }
    if (_channel != null &&
        statusValue == PrivateClawSessionStatus.connecting) {
      return;
    }

    _connectionGeneration += 1;
    final int generation = _connectionGeneration;

    await _subscription?.cancel();
    _subscription = null;
    _channel = null;

    _emitEvent(
      PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectingRelay,
        connectionStatus: statusValue,
      ),
    );

    final IOWebSocketChannel channel = IOWebSocketChannel.connect(
      _buildSocketUri(),
      pingInterval: _pingInterval,
      connectTimeout: _connectTimeout,
    );
    _channel = channel;
    _subscription = channel.stream.listen(
      (dynamic rawMessage) {
        unawaited(_handleRawMessage(rawMessage, generation));
      },
      onError: (Object error, StackTrace stackTrace) {
        _handleSocketError(error, generation);
      },
      onDone: () {
        _handleSocketDone(generation);
      },
      cancelOnError: false,
    );
  }

  void _handleSocketError(Object error, int generation) {
    if (_disposed ||
        _sawTerminalClose ||
        generation != _connectionGeneration ||
        _eventsController.isClosed) {
      return;
    }
    if (_hasEstablishedSession) {
      return;
    }

    _emitEvent(
      PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectionError,
        details: error.toString(),
        connectionStatus: PrivateClawSessionStatus.error,
      ),
    );
  }

  void _handleSocketDone(int generation) {
    if (_disposed ||
        _sawTerminalClose ||
        generation != _connectionGeneration ||
        _eventsController.isClosed) {
      return;
    }

    _channel = null;
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_disposed || _sawTerminalClose || _reconnectTimer != null) {
      return;
    }

    final Duration delay = _reconnectDelay;
    _emitEvent(
      const PrivateClawSessionEvent(
        notice: PrivateClawSessionNotice.connectingRelay,
        connectionStatus: PrivateClawSessionStatus.reconnecting,
      ),
    );

    _reconnectTimer = Timer(delay, () {
      _reconnectTimer = null;
      unawaited(_openSocket(PrivateClawSessionStatus.reconnecting));
    });

    final int nextDelayMs = math.min(
      _maxReconnectDelay.inMilliseconds,
      _reconnectDelay.inMilliseconds * 2,
    );
    _reconnectDelay = Duration(milliseconds: nextDelayMs);
  }

  Future<void> _handleRawMessage(dynamic rawMessage, int generation) async {
    if (_disposed ||
        generation != _connectionGeneration ||
        rawMessage is! String) {
      return;
    }

    final Object? decoded = jsonDecode(rawMessage);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Relay event must be a JSON object.');
    }

    switch (decoded['type']) {
      case 'relay:attached':
        final String? expiresAt = decoded['expiresAt'] as String?;
        if (expiresAt != null && expiresAt.isNotEmpty) {
          invite = invite.copyWith(expiresAt: _parseTimestamp(expiresAt));
        }
        _hasEstablishedSession = true;
        _reconnectDelay = _initialReconnectDelay;
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.relayAttached,
            connectionStatus: PrivateClawSessionStatus.relayAttached,
            updatedInvite: invite,
          ),
        );
        await _sendEncrypted(<String, Object?>{
          'kind': 'client_hello',
          'appVersion': 'privateclaw_flutter/0.1.0',
          'appId': _identity.appId,
          'deviceLabel': 'PrivateClaw',
          if (_identity.displayName != null)
            'displayName': _identity.displayName,
          'sentAt': DateTime.now().toUtc().toIso8601String(),
        });
        unawaited(_registerPushTokenIfAvailable(force: true));
        return;
      case 'relay:frame':
        final Object? envelope = decoded['envelope'];
        if (envelope is! Map<String, dynamic>) {
          throw const FormatException(
            'Relay frame is missing an encrypted envelope.',
          );
        }
        final Map<String, dynamic> payload = await _crypto!.decrypt(envelope);
        await _handlePayload(payload);
        return;
      case 'relay:error':
        final Object? message = decoded['message'];
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.relayError,
            details: (message ?? 'unknown_error').toString(),
            connectionStatus: PrivateClawSessionStatus.error,
          ),
        );
        return;
      case 'relay:session_closed':
        final Object? reason = decoded['reason'];
        _sawTerminalClose = true;
        _hasEstablishedSession = false;
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.sessionClosed,
            details: (reason ?? 'unknown_reason').toString(),
            connectionStatus: PrivateClawSessionStatus.closed,
          ),
        );
        await dispose(notifyRemote: false);
        return;
      default:
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.unknownRelayEvent,
            details: (decoded['type'] ?? 'unknown_event').toString(),
            connectionStatus: PrivateClawSessionStatus.error,
          ),
        );
    }
  }

  Future<void> _handlePayload(Map<String, dynamic> payload) async {
    final Object? kind = payload['kind'];
    _logReceivedPayload(payload);
    switch (kind) {
      case 'server_welcome':
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.welcome,
            details: payload['message'] as String?,
            connectionStatus: PrivateClawSessionStatus.active,
          ),
        );
        return;
      case 'assistant_message':
        _emitEvent(
          PrivateClawSessionEvent(
            message: ChatMessage(
              id: payload['messageId'] as String? ?? _nextLocalMessageId(),
              sender: ChatSender.assistant,
              text: payload['text'] as String? ?? '',
              sentAt: _parseTimestamp(payload['sentAt'] as String?),
              replyTo: payload['replyTo'] as String?,
              isPending: payload['pending'] as bool? ?? false,
              attachments: _parseAttachments(payload['attachments']),
            ),
          ),
        );
        return;
      case 'participant_message':
        final String senderAppId =
            payload['senderAppId'] as String? ?? 'unknown-app';
        final String senderDisplayName =
            payload['senderDisplayName'] as String? ?? senderAppId;
        final String messageId =
            payload['messageId'] as String? ?? _nextLocalMessageId();
        final bool isOwnMessage = senderAppId == _identity.appId;
        _emitEvent(
          PrivateClawSessionEvent(
            message: ChatMessage(
              id: messageId,
              sender: ChatSender.user,
              text: payload['text'] as String? ?? '',
              sentAt: _parseTimestamp(payload['sentAt'] as String?),
              replyTo: payload['clientMessageId'] as String?,
              attachments: _parseAttachments(payload['attachments']),
              isOwnMessage: isOwnMessage,
              senderId: senderAppId,
              senderLabel: senderDisplayName,
            ),
          ),
        );
        return;
      case 'system_message':
        final String message = payload['message'] as String? ?? '';
        _emitEvent(
          PrivateClawSessionEvent(
            message: ChatMessage(
              id: payload['messageId'] as String? ?? _nextLocalMessageId(),
              sender: ChatSender.system,
              text: message,
              sentAt: _parseTimestamp(payload['sentAt'] as String?),
              replyTo: payload['replyTo'] as String?,
            ),
          ),
        );
        return;
      case 'provider_capabilities':
        invite = invite.copyWith(
          expiresAt: _parseTimestamp(payload['expiresAt'] as String?),
          groupMode: payload['groupMode'] as bool? ?? invite.groupMode,
          providerLabel:
              payload['providerLabel'] as String? ?? invite.providerLabel,
        );
        PrivateClawIdentity? assignedIdentity;
        final String? currentAppId = payload['currentAppId'] as String?;
        final String? currentDisplayName =
            payload['currentDisplayName'] as String?;
        if (currentAppId == _identity.appId &&
            currentDisplayName != null &&
            currentDisplayName.isNotEmpty &&
            currentDisplayName != _identity.displayName) {
          _identity = _identity.copyWith(displayName: currentDisplayName);
          assignedIdentity = _identity;
        }
        _emitEvent(
          PrivateClawSessionEvent(
            connectionStatus: PrivateClawSessionStatus.active,
            updatedInvite: invite,
            commands: _parseCommands(payload['commands']),
            participants: _parseParticipants(payload['participants']),
            assignedIdentity: assignedIdentity,
          ),
        );
        return;
      case 'session_renewed':
        final DateTime expiresAt = _parseTimestamp(
          payload['expiresAt'] as String?,
        );
        final String newSessionKey = payload['newSessionKey'] as String? ?? '';
        if (newSessionKey.isEmpty) {
          throw const FormatException(
            'Session renewal payload is missing the next session key.',
          );
        }
        invite = invite.copyWith(
          sessionKey: newSessionKey,
          expiresAt: expiresAt,
        );
        await _resetCrypto(newSessionKey);
        _emitEvent(
          PrivateClawSessionEvent(
            connectionStatus: PrivateClawSessionStatus.active,
            updatedInvite: invite,
            renewedExpiresAt: expiresAt,
            renewedReplyTo: payload['replyTo'] as String?,
          ),
        );
        await _sendEncrypted(<String, Object?>{
          'kind': 'client_hello',
          'appVersion': 'privateclaw_flutter/0.1.0',
          'appId': _identity.appId,
          'deviceLabel': 'PrivateClaw',
          if (_identity.displayName != null)
            'displayName': _identity.displayName,
          'sentAt': DateTime.now().toUtc().toIso8601String(),
        });
        return;
      default:
        _emitEvent(
          PrivateClawSessionEvent(
            notice: PrivateClawSessionNotice.unknownPayload,
            details: (kind ?? 'unknown_payload').toString(),
            connectionStatus: PrivateClawSessionStatus.error,
          ),
        );
    }
  }

  void _logReceivedPayload(Map<String, dynamic> payload) {
    final String? kind = payload['kind'] as String?;
    switch (kind) {
      case 'participant_message':
        debugPrint(
          '[privateclaw-app] received participant_message '
          'sender=${payload['senderAppId'] ?? 'unknown-app'} '
          'messageId=${payload['messageId'] ?? 'unknown-message'}',
        );
        return;
      case 'assistant_message':
        debugPrint(
          '[privateclaw-app] received assistant_message '
          'messageId=${payload['messageId'] ?? 'unknown-message'} '
          'replyTo=${payload['replyTo'] ?? 'none'}',
        );
        return;
      case 'system_message':
        debugPrint(
          '[privateclaw-app] received system_message '
          'messageId=${payload['messageId'] ?? 'unknown-message'} '
          'severity=${payload['severity'] ?? 'unknown'}',
        );
        return;
      case 'provider_capabilities':
        debugPrint(
          '[privateclaw-app] received provider_capabilities '
          'currentAppId=${payload['currentAppId'] ?? 'none'}',
        );
        return;
    }
  }

  Future<void> sendUserMessage(
    String text, {
    List<ChatAttachment> attachments = const <ChatAttachment>[],
  }) async {
    final String trimmed = text.trim();
    if (trimmed.isEmpty && attachments.isEmpty) {
      return;
    }

    final DateTime sentAt = DateTime.now().toUtc();
    final String clientMessageId = _nextLocalMessageId();
    await _sendEncrypted(<String, Object?>{
      'kind': 'user_message',
      'text': trimmed,
      'clientMessageId': clientMessageId,
      'sentAt': sentAt.toIso8601String(),
      'appId': _identity.appId,
      if (_identity.displayName != null) 'displayName': _identity.displayName,
      if (attachments.isNotEmpty)
        'attachments': attachments
            .map((ChatAttachment attachment) => attachment.toPayload())
            .toList(growable: false),
    });

    if (_eventsController.isClosed) {
      return;
    }

    _emitEvent(
      PrivateClawSessionEvent(
        message: ChatMessage(
          id: clientMessageId,
          sender: ChatSender.user,
          text: trimmed,
          sentAt: sentAt,
          attachments: attachments,
          isPending: true,
          isOwnMessage: true,
          senderId: _identity.appId,
          senderLabel: _identity.displayName,
        ),
      ),
    );
  }

  Future<void> refreshPushRegistration() async {
    await _registerPushTokenIfAvailable(force: true);
  }

  Future<void> unregisterPushRegistration() async {
    _registeredPushToken = null;
    _sendControl(<String, Object?>{'type': 'app:unregister_push'});
  }

  Future<void> _sendEncrypted(Map<String, Object?> payload) async {
    final PrivateClawCrypto? crypto = _crypto;
    final IOWebSocketChannel? channel = _channel;
    if (crypto == null || channel == null) {
      throw StateError('PrivateClaw session is not connected.');
    }

    final Map<String, dynamic> envelope = await crypto.encrypt(payload);
    channel.sink.add(
      jsonEncode(<String, Object?>{'type': 'app:frame', 'envelope': envelope}),
    );
  }

  Future<void> _registerPushTokenIfAvailable({bool force = false}) async {
    final PrivateClawPushTokenProvider? provider = pushTokenProvider;
    debugPrint(
      '[privateclaw-app] attempting push registration '
      'session=${invite.sessionId} appId=${_identity.appId} hasProvider=${provider != null}',
    );
    if (provider == null) {
      debugPrint('[privateclaw-app] push registration skipped: no provider');
      return;
    }

    try {
      final String? token = (await provider())?.trim();
      if (token == null || token.isEmpty) {
        debugPrint(
          '[privateclaw-app] push registration skipped: token unavailable',
        );
        return;
      }
      if (!force && token == _registeredPushToken) {
        debugPrint(
          '[privateclaw-app] push registration skipped: token unchanged',
        );
        return;
      }

      debugPrint(
        '[privateclaw-app] registering push token '
        'session=${invite.sessionId} appId=${_identity.appId} tokenLength=${token.length}',
      );
      _sendControl(<String, Object?>{
        'type': 'app:register_push',
        'token': token,
      });
      _registeredPushToken = token;
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] push registration failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  void _sendControl(Map<String, Object?> payload) {
    final IOWebSocketChannel? channel = _channel;
    if (channel == null) {
      return;
    }
    channel.sink.add(jsonEncode(payload));
  }

  Future<void> _resetCrypto(String sessionKey) async {
    _crypto = await PrivateClawCrypto.fromSession(
      sessionId: invite.sessionId,
      sessionKey: sessionKey,
    );
  }

  Uri _buildSocketUri() {
    final Uri baseUri = Uri.parse(invite.appWsUrl);
    final Map<String, String> queryParameters = <String, String>{
      ...baseUri.queryParameters,
      'appId': _identity.appId,
    };
    return baseUri.replace(queryParameters: queryParameters);
  }

  void _emitEvent(PrivateClawSessionEvent event) {
    if (_eventsController.isClosed) {
      return;
    }
    _eventsController.add(event);
  }

  Future<void> dispose({
    String reason = 'client_closed',
    bool notifyRemote = true,
  }) async {
    if (_disposed) {
      return;
    }
    _disposed = true;

    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    if (notifyRemote) {
      try {
        await _sendEncrypted(<String, Object?>{
          'kind': 'session_close',
          'reason': reason,
          'appId': _identity.appId,
          'sentAt': DateTime.now().toUtc().toIso8601String(),
        });
      } catch (_) {
        // Best effort only during shutdown.
      }
    }

    await _subscription?.cancel();
    await _channel?.sink.close(status.normalClosure);
    _channel = null;
    if (!_eventsController.isClosed) {
      await _eventsController.close();
    }
  }

  List<ChatAttachment> _parseAttachments(Object? value) {
    if (value is! List<Object?>) {
      return const <ChatAttachment>[];
    }

    final List<ChatAttachment> attachments = <ChatAttachment>[];
    for (final Object? item in value) {
      try {
        attachments.add(ChatAttachment.fromPayload(item));
      } catch (_) {
        continue;
      }
    }
    return attachments;
  }

  List<PrivateClawSlashCommand> _parseCommands(Object? value) {
    if (value is! List<Object?>) {
      return const <PrivateClawSlashCommand>[];
    }

    final List<PrivateClawSlashCommand> commands = <PrivateClawSlashCommand>[];
    for (final Object? item in value) {
      try {
        commands.add(PrivateClawSlashCommand.fromPayload(item));
      } catch (_) {
        continue;
      }
    }
    return commands;
  }

  List<PrivateClawParticipant> _parseParticipants(Object? value) {
    if (value is! List<Object?>) {
      return const <PrivateClawParticipant>[];
    }

    final List<PrivateClawParticipant> participants =
        <PrivateClawParticipant>[];
    for (final Object? item in value) {
      if (item is! Map<String, dynamic>) {
        continue;
      }
      try {
        participants.add(PrivateClawParticipant.fromJson(item));
      } catch (_) {
        continue;
      }
    }
    return participants;
  }

  DateTime _parseTimestamp(String? value) {
    if (value == null || value.isEmpty) {
      return DateTime.now().toUtc();
    }
    return DateTime.tryParse(value)?.toUtc() ?? DateTime.now().toUtc();
  }

  String _nextLocalMessageId() {
    _messageCounter += 1;
    return 'client-${DateTime.now().microsecondsSinceEpoch}-$_messageCounter';
  }
}
