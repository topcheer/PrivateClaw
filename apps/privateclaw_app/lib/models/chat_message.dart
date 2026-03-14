import 'chat_attachment.dart';

enum ChatSender { user, assistant, system }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.sentAt,
    this.replyTo,
    this.isPending = false,
    this.isOwnMessage = false,
    this.senderId,
    this.senderLabel,
    this.attachments = const <ChatAttachment>[],
  });

  final String id;
  final ChatSender sender;
  final String text;
  final DateTime sentAt;
  final String? replyTo;
  final bool isPending;
  final bool isOwnMessage;
  final String? senderId;
  final String? senderLabel;
  final List<ChatAttachment> attachments;

  ChatMessage copyWith({
    String? id,
    ChatSender? sender,
    String? text,
    DateTime? sentAt,
    Object? replyTo = _noValue,
    bool? isPending,
    bool? isOwnMessage,
    Object? senderId = _noValue,
    Object? senderLabel = _noValue,
    List<ChatAttachment>? attachments,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      sender: sender ?? this.sender,
      text: text ?? this.text,
      sentAt: sentAt ?? this.sentAt,
      replyTo: identical(replyTo, _noValue) ? this.replyTo : replyTo as String?,
      isPending: isPending ?? this.isPending,
      isOwnMessage: isOwnMessage ?? this.isOwnMessage,
      senderId: identical(senderId, _noValue) ? this.senderId : senderId as String?,
      senderLabel: identical(senderLabel, _noValue)
          ? this.senderLabel
          : senderLabel as String?,
      attachments: attachments ?? this.attachments,
    );
  }
}

const Object _noValue = Object();
