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
    this.attachments = const <ChatAttachment>[],
  });

  final String id;
  final ChatSender sender;
  final String text;
  final DateTime sentAt;
  final String? replyTo;
  final bool isPending;
  final List<ChatAttachment> attachments;

  ChatMessage copyWith({
    String? id,
    ChatSender? sender,
    String? text,
    DateTime? sentAt,
    Object? replyTo = _noValue,
    bool? isPending,
    List<ChatAttachment>? attachments,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      sender: sender ?? this.sender,
      text: text ?? this.text,
      sentAt: sentAt ?? this.sentAt,
      replyTo: identical(replyTo, _noValue) ? this.replyTo : replyTo as String?,
      isPending: isPending ?? this.isPending,
      attachments: attachments ?? this.attachments,
    );
  }
}

const Object _noValue = Object();
