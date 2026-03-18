import 'chat_attachment.dart';

enum ChatSender { user, assistant, system }

enum ChatThinkingEntryKind { thought, action, result, error }

enum ChatThinkingStatus { started, streaming, completed, failed }

class ChatThinkingEntry {
  const ChatThinkingEntry({
    required this.id,
    required this.kind,
    required this.title,
    required this.text,
    required this.sentAt,
    this.toolName,
  });

  final String id;
  final ChatThinkingEntryKind kind;
  final String title;
  final String text;
  final DateTime sentAt;
  final String? toolName;

  ChatThinkingEntry copyWith({
    String? id,
    ChatThinkingEntryKind? kind,
    String? title,
    String? text,
    DateTime? sentAt,
    Object? toolName = _noValue,
  }) {
    return ChatThinkingEntry(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      text: text ?? this.text,
      sentAt: sentAt ?? this.sentAt,
      toolName: identical(toolName, _noValue) ? this.toolName : toolName as String?,
    );
  }
}

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
    this.thinkingStatus,
    this.thinkingSummary,
    this.thinkingEntries = const <ChatThinkingEntry>[],
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
  final ChatThinkingStatus? thinkingStatus;
  final String? thinkingSummary;
  final List<ChatThinkingEntry> thinkingEntries;

  bool get isThinkingTrace => thinkingStatus != null;

  bool get isThinkingActive =>
      thinkingStatus == ChatThinkingStatus.started ||
      thinkingStatus == ChatThinkingStatus.streaming;

  ChatThinkingEntry? get latestThinkingEntry =>
      thinkingEntries.isEmpty ? null : thinkingEntries.last;

  bool get hasThinkingEntries => thinkingEntries.isNotEmpty;

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
    Object? thinkingStatus = _noValue,
    Object? thinkingSummary = _noValue,
    List<ChatThinkingEntry>? thinkingEntries,
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
      thinkingStatus: identical(thinkingStatus, _noValue)
          ? this.thinkingStatus
          : thinkingStatus as ChatThinkingStatus?,
      thinkingSummary: identical(thinkingSummary, _noValue)
          ? this.thinkingSummary
          : thinkingSummary as String?,
      thinkingEntries: thinkingEntries ?? this.thinkingEntries,
    );
  }
}

const Object _noValue = Object();
