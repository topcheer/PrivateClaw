import 'chat_message.dart';

bool _hasCompletedReplyFor(List<ChatMessage> messages, String messageId) {
  return messages.any(
    (ChatMessage item) =>
        item.replyTo == messageId &&
        item.sender != ChatSender.user &&
        !item.isPending &&
        !item.isThinkingTrace,
  );
}

void _clearPendingForReplyTo(List<ChatMessage> messages, String replyTo) {
  final int repliedMessageIndex = messages.indexWhere(
    (ChatMessage item) => item.id == replyTo && item.sender == ChatSender.user,
  );
  if (repliedMessageIndex >= 0 && messages[repliedMessageIndex].isPending) {
    messages[repliedMessageIndex] = messages[repliedMessageIndex].copyWith(
      isPending: false,
    );
  }
  messages.removeWhere(
    (ChatMessage item) =>
        item.sender == ChatSender.assistant &&
        item.isPending &&
        item.replyTo == replyTo,
  );
}

List<ChatMessage> upsertChatTimelineMessage({
  required List<ChatMessage> messages,
  required ChatMessage message,
}) {
  final List<ChatMessage> nextMessages = List<ChatMessage>.from(messages);

  if (message.isPending && message.replyTo != null) {
    final int repliedMessageIndex = nextMessages.indexWhere(
      (ChatMessage item) =>
          item.id == message.replyTo && item.sender == ChatSender.user,
    );
    if (repliedMessageIndex >= 0) {
      nextMessages[repliedMessageIndex] = nextMessages[repliedMessageIndex]
          .copyWith(
            isPending: !_hasCompletedReplyFor(nextMessages, message.replyTo!),
          );
      nextMessages.removeWhere(
        (ChatMessage item) =>
            item.sender == ChatSender.assistant &&
            item.isPending &&
            item.replyTo == message.replyTo,
      );
      return nextMessages;
    }
  }

  if (message.replyTo != null &&
      message.sender != ChatSender.user &&
      !message.isThinkingTrace &&
      !message.isPending) {
    _clearPendingForReplyTo(nextMessages, message.replyTo!);
  }

  final int existingMessageIndex = nextMessages.indexWhere(
    (ChatMessage item) => item.id == message.id,
  );
  if (existingMessageIndex >= 0) {
    if (message.isThinkingTrace &&
        !message.isThinkingActive &&
        !message.hasThinkingEntries) {
      nextMessages.removeAt(existingMessageIndex);
      return nextMessages;
    }

    final ChatMessage existingMessage = nextMessages[existingMessageIndex];
    final bool shouldResolveLatePending =
        message.sender == ChatSender.user &&
        (message.isPending || existingMessage.isPending) &&
        _hasCompletedReplyFor(nextMessages, message.id);
    final bool shouldKeepUserPending =
        message.sender == ChatSender.user &&
        !shouldResolveLatePending &&
        (message.isPending ||
            (existingMessage.sender == ChatSender.user &&
                existingMessage.id == message.id &&
                existingMessage.isPending));

    nextMessages[existingMessageIndex] = message.copyWith(
      isPending: shouldResolveLatePending
          ? false
          : shouldKeepUserPending
          ? true
          : message.isPending,
    );
    return nextMessages;
  }

  if (message.isThinkingTrace &&
      !message.isThinkingActive &&
      !message.hasThinkingEntries) {
    return nextMessages;
  }

  if (message.isPending) {
    final bool shouldResolveLatePending =
        message.sender == ChatSender.user &&
        _hasCompletedReplyFor(nextMessages, message.id);
    nextMessages.add(
      shouldResolveLatePending ? message.copyWith(isPending: false) : message,
    );
    return nextMessages;
  }

  nextMessages.add(message);
  return nextMessages;
}
