import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:privateclaw_local_notifications/privateclaw_local_notifications.dart';

import '../models/chat_attachment.dart';
import '../models/chat_message.dart';
import '../models/privateclaw_identity.dart';
import '../models/privateclaw_invite.dart';
import 'privateclaw_active_session_store.dart';
import 'privateclaw_firebase_options.dart';
import 'privateclaw_notified_message_store.dart';
import 'privateclaw_session_client.dart';

const String _privateClawWakeMessageType = 'privateclaw.wake';
const String _privateClawNotificationChannelId = 'privateclaw_messages';
const String _privateClawNotificationChannelName = 'PrivateClaw messages';
const String _privateClawNotificationChannelDescription =
    'Encrypted chat message notifications for PrivateClaw.';
const Duration _backgroundFetchFirstMessageGracePeriod = Duration(seconds: 6);
const Duration _backgroundFetchQuietPeriod = Duration(milliseconds: 900);
const Duration _backgroundFetchTimeout = Duration(seconds: 10);
const Duration _pushTokenRequestTimeout = Duration(seconds: 15);
const Duration _apnsTokenPollInterval = Duration(milliseconds: 500);
const int _apnsTokenPollAttempts = 10;

bool privateClawSupportsDesktopLocalNotificationsOnCurrentPlatform() {
  return Platform.isMacOS;
}

@pragma('vm:entry-point')
Future<void> privateClawBackgroundMessageHandler(RemoteMessage message) async {
  await PrivateClawNotificationService.instance.handleBackgroundMessage(
    message,
  );
}

Duration privateClawBackgroundFetchSettleDelay({
  required bool hasReceivedNotifiableMessage,
}) {
  return hasReceivedNotifiableMessage
      ? _backgroundFetchQuietPeriod
      : _backgroundFetchFirstMessageGracePeriod;
}

List<ChatMessage> privateClawFilterUnnotifiedMessages({
  required Iterable<ChatMessage> messages,
  required Set<String> notifiedMessageIds,
}) {
  final Set<String> seenMessageIds = <String>{...notifiedMessageIds};
  final List<ChatMessage> freshMessages = <ChatMessage>[];
  for (final ChatMessage message in messages) {
    final String messageId = message.id.trim();
    if (messageId.isEmpty) {
      freshMessages.add(message);
      continue;
    }
    if (seenMessageIds.add(messageId)) {
      freshMessages.add(message);
    }
  }
  return freshMessages;
}

class PrivateClawNotificationService {
  PrivateClawNotificationService._();

  static final PrivateClawNotificationService instance =
      PrivateClawNotificationService._();

  final PrivateClawActiveSessionStore _activeSessionStore =
      const PrivateClawActiveSessionStore();
  final PrivateClawNotifiedMessageStore _notifiedMessageStore =
      const PrivateClawNotifiedMessageStore();
  final PrivateClawLocalNotifications _localNotifications =
      const PrivateClawLocalNotifications();

  Future<void>? _bootstrapFuture;
  Future<void>? _permissionFuture;
  bool _firebaseUnavailable = false;
  bool _desktopLocalNotificationsUnavailable = false;

  bool get _supportsRemotePush =>
      privateClawSupportsFirebasePushOnCurrentPlatform();
  bool get _supportsDesktopLocalNotifications =>
      privateClawSupportsDesktopLocalNotificationsOnCurrentPlatform();

  bool get isConfigured =>
      (_supportsDesktopLocalNotifications &&
          !_desktopLocalNotificationsUnavailable) ||
      (_supportsRemotePush && !_firebaseUnavailable);

  Future<void> bootstrap() {
    if (!isConfigured) {
      return Future<void>.value();
    }
    return _bootstrapFuture ??= _bootstrapInternal();
  }

  Future<void> _bootstrapInternal() async {
    if (_supportsDesktopLocalNotifications) {
      return;
    }
    final FirebaseOptions? options =
        privateClawFirebaseOptionsForCurrentPlatform();
    try {
      if (Firebase.apps.isEmpty) {
        if (options != null) {
          await Firebase.initializeApp(options: options);
        } else {
          await Firebase.initializeApp();
        }
      }
      await FirebaseMessaging.instance.setAutoInitEnabled(true);
      if (Platform.isIOS || Platform.isMacOS) {
        await FirebaseMessaging.instance
            .setForegroundNotificationPresentationOptions(
              alert: false,
              badge: false,
              sound: false,
            );
      }
    } on FirebaseException catch (error, stackTrace) {
      _disableFirebase(
        '[privateclaw-app] Firebase disabled: '
        '${error.code}${error.message == null ? '' : ' ${error.message}'}',
      );
      debugPrintStack(stackTrace: stackTrace);
      return;
    } on PlatformException catch (error, stackTrace) {
      _disableFirebase(
        '[privateclaw-app] Firebase disabled: '
        '${error.code}${error.message == null ? '' : ' ${error.message}'}',
      );
      debugPrintStack(stackTrace: stackTrace);
      return;
    }
  }

  void _disableFirebase(String message) {
    _firebaseUnavailable = true;
    debugPrint(message.trim());
  }

  void _disableDesktopLocalNotifications(String message) {
    _desktopLocalNotificationsUnavailable = true;
    debugPrint(message.trim());
  }

  Future<void> prepareForSession() async {
    if (!isConfigured) {
      return;
    }
    await bootstrap();
    if (!isConfigured) {
      return;
    }
    _permissionFuture ??= _requestNotificationPermission();
    await _permissionFuture;
  }

  Future<void> _requestNotificationPermission() async {
    if (_supportsDesktopLocalNotifications) {
      try {
        final bool granted = await _localNotifications.requestPermission();
        if (!granted) {
          _disableDesktopLocalNotifications(
            '[privateclaw-app] local notifications disabled: permission denied',
          );
          return;
        }
        debugPrint(
          '[privateclaw-app] local notification permission: granted',
        );
      } on PlatformException catch (error, stackTrace) {
        _disableDesktopLocalNotifications(
          '[privateclaw-app] local notifications disabled: '
          '${error.code}${error.message == null ? '' : ' ${error.message}'}',
        );
        debugPrintStack(stackTrace: stackTrace);
      }
      return;
    }
    final NotificationSettings settings = await FirebaseMessaging.instance
        .requestPermission(
          alert: true,
          badge: true,
          sound: true,
          provisional: false,
        );
    debugPrint(
      '[privateclaw-app] notification permission: '
      '${settings.authorizationStatus.name}',
    );
  }

  Future<String?> getPushToken() async {
    if (!_supportsRemotePush) {
      debugPrint(
        '[privateclaw-app] push token request skipped: remote push unsupported on this platform',
      );
      return null;
    }
    if (!isConfigured) {
      debugPrint(
        '[privateclaw-app] push token request skipped: Firebase disabled',
      );
      return null;
    }

    await prepareForSession();
    if (!isConfigured) {
      return null;
    }
    if (Platform.isIOS) {
      final bool hasApnsToken = await _waitForApnsToken();
      if (!hasApnsToken) {
        debugPrint(
          '[privateclaw-app] push token request skipped: APNs token unavailable',
        );
        return null;
      }
    }

    debugPrint('[privateclaw-app] requesting FirebaseMessaging token');
    final String? token = await _getFirebaseTokenWithTimeout();
    if (token == null) {
      debugPrint('[privateclaw-app] FirebaseMessaging.getToken returned null');
      return null;
    }
    final String normalizedToken = token.trim();
    if (normalizedToken.isEmpty) {
      debugPrint(
        '[privateclaw-app] FirebaseMessaging.getToken returned empty token',
      );
      return null;
    }
    debugPrint(
      '[privateclaw-app] FirebaseMessaging token ready length=${normalizedToken.length}',
    );
    return normalizedToken;
  }

  Future<String?> _getFirebaseTokenWithTimeout() async {
    try {
      return await FirebaseMessaging.instance.getToken().timeout(
        _pushTokenRequestTimeout,
      );
    } on TimeoutException {
      debugPrint('[privateclaw-app] FirebaseMessaging.getToken timed out');
      return null;
    }
  }

  Future<void> handleBackgroundMessage(RemoteMessage message) async {
    if (!isConfigured || !_isWakeMessage(message)) {
      return;
    }

    await bootstrap();
    if (!isConfigured) {
      return;
    }
    final String? sessionId = message.data['sessionId']?.trim();
    if (sessionId == null || sessionId.isEmpty) {
      return;
    }
    debugPrint('[privateclaw-app] background wake received session=$sessionId');

    final PrivateClawActiveSessionRecord? storedRecord =
        await _activeSessionStore.load();
    if (storedRecord == null || storedRecord.invite.sessionId != sessionId) {
      debugPrint(
        '[privateclaw-app] background wake ignored: no matching stored session',
      );
      return;
    }
    if (storedRecord.invite.expiresAt.isBefore(DateTime.now().toUtc())) {
      await _activeSessionStore.clear();
      await _notifiedMessageStore.clear(
        sessionId: storedRecord.invite.sessionId,
      );
      debugPrint(
        '[privateclaw-app] background wake ignored: stored session expired',
      );
      return;
    }

    await _fetchBufferedMessagesAndNotify(storedRecord);
  }

  Future<void> _fetchBufferedMessagesAndNotify(
    PrivateClawActiveSessionRecord storedRecord,
  ) async {
    final PrivateClawNotifiedMessageRecord? notifiedRecord =
        await _notifiedMessageStore.load();
    final Set<String> previouslyNotifiedMessageIds =
        notifiedRecord?.sessionId == storedRecord.invite.sessionId
        ? notifiedRecord!.messageIds.toSet()
        : <String>{};
    debugPrint(
      '[privateclaw-app] background wake fetch started '
      'session=${storedRecord.invite.sessionId}',
    );
    PrivateClawActiveSessionRecord currentRecord = storedRecord;
    final List<ChatMessage> incomingMessages = <ChatMessage>[];
    bool hasReceivedNotifiableMessage = false;
    final PrivateClawSessionClient client = PrivateClawSessionClient(
      storedRecord.invite,
      identity: storedRecord.identity,
    );
    final Completer<void> settled = Completer<void>();
    Timer? settleTimer;
    Timer? timeoutTimer;

    void scheduleSettleCheck() {
      settleTimer?.cancel();
      settleTimer = Timer(
        privateClawBackgroundFetchSettleDelay(
          hasReceivedNotifiableMessage: hasReceivedNotifiableMessage,
        ),
        () {
          if (!settled.isCompleted) {
            settled.complete();
          }
        },
      );
    }

    Future<void> persistCurrentRecord() async {
      await _activeSessionStore.save(
        invite: currentRecord.invite,
        identity: currentRecord.identity,
      );
    }

    final StreamSubscription<PrivateClawSessionEvent> subscription = client
        .events
        .listen((PrivateClawSessionEvent event) {
          if (event.updatedInvite != null) {
            currentRecord = currentRecord.copyWith(invite: event.updatedInvite);
            unawaited(persistCurrentRecord());
          }
          if (event.assignedIdentity != null) {
            currentRecord = currentRecord.copyWith(
              identity: event.assignedIdentity,
            );
            unawaited(persistCurrentRecord());
          }
          if (event.message != null && _isNotifiableMessage(event.message!)) {
            incomingMessages.add(event.message!);
            hasReceivedNotifiableMessage = true;
            scheduleSettleCheck();
          }
          if (event.connectionStatus ==
                  PrivateClawSessionStatus.relayAttached ||
              event.connectionStatus == PrivateClawSessionStatus.active) {
            scheduleSettleCheck();
          }
          if (event.connectionStatus == PrivateClawSessionStatus.closed ||
              event.connectionStatus == PrivateClawSessionStatus.idle) {
            unawaited(_activeSessionStore.clear());
            unawaited(
              _notifiedMessageStore.clear(
                sessionId: currentRecord.invite.sessionId,
              ),
            );
            if (!settled.isCompleted) {
              settled.complete();
            }
          }
        });

    timeoutTimer = Timer(_backgroundFetchTimeout, () {
      if (!settled.isCompleted) {
        settled.complete();
      }
    });

    try {
      await client.connect();
      scheduleSettleCheck();
      await settled.future;
    } catch (error, stackTrace) {
      debugPrint('[privateclaw-app] background wake fetch failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    } finally {
      settleTimer?.cancel();
      timeoutTimer.cancel();
      await subscription.cancel();
      await client.dispose(reason: 'background_wake_pull', notifyRemote: false);
    }

    final List<ChatMessage> freshMessages = privateClawFilterUnnotifiedMessages(
      messages: incomingMessages,
      notifiedMessageIds: previouslyNotifiedMessageIds,
    );

    if (freshMessages.isNotEmpty) {
      debugPrint(
        '[privateclaw-app] background wake fetched '
        '${freshMessages.length} notifiable message(s)',
      );
      await _showNotificationSummary(
        invite: currentRecord.invite,
        messages: freshMessages,
      );
      await _notifiedMessageStore.remember(
        sessionId: currentRecord.invite.sessionId,
        messageIds: freshMessages.map((ChatMessage message) => message.id),
      );
      return;
    }

    if (incomingMessages.isNotEmpty) {
      debugPrint(
        '[privateclaw-app] background wake completed with only previously notified messages',
      );
      return;
    }

    debugPrint(
      '[privateclaw-app] background wake completed with no notifiable messages',
    );
  }

  Future<void> showForegroundNotification({
    required PrivateClawInvite invite,
    required ChatMessage message,
  }) async {
    if (!_supportsDesktopLocalNotifications || !_isNotifiableMessage(message)) {
      return;
    }
    await _showNotificationSummary(
      invite: invite,
      messages: <ChatMessage>[message],
    );
  }

  Future<void> _showNotificationSummary({
    required PrivateClawInvite invite,
    required List<ChatMessage> messages,
  }) async {
    final bool isChinese = _isChineseLocale();
    final ChatMessage latestMessage = messages.last;
    final String title = _notificationTitle(invite, latestMessage);
    final String body = messages.length == 1
        ? _summarizeMessage(latestMessage, isChinese: isChinese)
        : isChinese
        ? '收到 ${messages.length} 条新的加密消息'
        : '${messages.length} new encrypted messages';

    await _localNotifications.show(
      id: invite.sessionId.hashCode & 0x7fffffff,
      title: title,
      body: body,
      payload: invite.sessionId,
      channelId: _privateClawNotificationChannelId,
      channelName: _privateClawNotificationChannelName,
      channelDescription: _privateClawNotificationChannelDescription,
    );
    debugPrint(
      '[privateclaw-app] local notification posted '
      'session=${invite.sessionId} count=${messages.length}',
    );
  }

  String _notificationTitle(PrivateClawInvite invite, ChatMessage message) {
    if (message.sender == ChatSender.user &&
        (message.senderLabel?.trim().isNotEmpty ?? false)) {
      return message.senderLabel!.trim();
    }
    final String? providerLabel = invite.providerLabel?.trim();
    if (providerLabel != null && providerLabel.isNotEmpty) {
      return providerLabel;
    }
    return 'PrivateClaw';
  }

  String _summarizeMessage(ChatMessage message, {required bool isChinese}) {
    final String text = message.text.trim();
    if (text.isNotEmpty) {
      return text;
    }
    if (message.attachments.isEmpty) {
      return isChinese ? '收到新的加密消息' : 'New encrypted message';
    }
    if (message.attachments.length == 1) {
      final ChatAttachment attachment = message.attachments.single;
      return isChinese
          ? '收到附件：${attachment.name}'
          : 'Attachment: ${attachment.name}';
    }
    return isChinese
        ? '收到 ${message.attachments.length} 个附件'
        : '${message.attachments.length} attachments';
  }

  bool _isWakeMessage(RemoteMessage message) {
    return message.data['type'] == _privateClawWakeMessageType;
  }

  bool _isNotifiableMessage(ChatMessage message) {
    if (message.isPending) {
      return false;
    }
    switch (message.sender) {
      case ChatSender.assistant:
        return true;
      case ChatSender.user:
        return !message.isOwnMessage;
      case ChatSender.system:
        return false;
    }
  }

  bool _isChineseLocale() {
    return PlatformDispatcher.instance.locale.languageCode
        .toLowerCase()
        .startsWith('zh');
  }

  Future<bool> _waitForApnsToken() async {
    for (int index = 0; index < _apnsTokenPollAttempts; index += 1) {
      final String? apnsToken = await FirebaseMessaging.instance.getAPNSToken();
      if (apnsToken != null && apnsToken.trim().isNotEmpty) {
        return true;
      }
      await Future<void>.delayed(_apnsTokenPollInterval);
    }
    return false;
  }
}
