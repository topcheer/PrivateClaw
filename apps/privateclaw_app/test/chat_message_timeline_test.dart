import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/models/chat_message_timeline.dart';

void main() {
  final DateTime sentAt = DateTime.utc(2030, 1, 1, 12);

  ChatMessage buildUserMessage({
    required String id,
    required String text,
    bool isPending = false,
  }) {
    return ChatMessage(
      id: id,
      sender: ChatSender.user,
      text: text,
      sentAt: sentAt,
      isPending: isPending,
      isOwnMessage: true,
      senderId: 'app-one',
      senderLabel: 'Tester',
    );
  }

  ChatMessage buildAssistantMessage({
    required String id,
    required String text,
    String? replyTo,
    bool isPending = false,
  }) {
    return ChatMessage(
      id: id,
      sender: ChatSender.assistant,
      text: text,
      sentAt: sentAt,
      replyTo: replyTo,
      isPending: isPending,
    );
  }

  test('assistant reply clears a matching pending user message', () {
    final List<ChatMessage> messages = <ChatMessage>[
      buildUserMessage(id: 'user-1', text: 'hello', isPending: true),
    ];

    final List<ChatMessage> updatedMessages = upsertChatTimelineMessage(
      messages: messages,
      message: buildAssistantMessage(
        id: 'assistant-1',
        text: 'hi there',
        replyTo: 'user-1',
      ),
    );

    expect(updatedMessages[0].isPending, isFalse);
    expect(updatedMessages[1].replyTo, 'user-1');
  });

  test(
    'participant echo keeps the local user bubble pending until completion',
    () {
      final List<ChatMessage> pendingMessages = upsertChatTimelineMessage(
        messages: <ChatMessage>[
          buildUserMessage(id: 'user-1', text: 'hello', isPending: true),
        ],
        message: ChatMessage(
          id: 'user-1',
          sender: ChatSender.user,
          text: 'hello',
          sentAt: sentAt,
          replyTo: 'user-1',
          isOwnMessage: true,
          senderId: 'app-one',
          senderLabel: 'Tester',
        ),
      );

      expect(pendingMessages.single.isPending, isTrue);

      final List<ChatMessage> resolvedMessages = upsertChatTimelineMessage(
        messages: pendingMessages,
        message: buildAssistantMessage(
          id: 'assistant-1',
          text: 'done',
          replyTo: 'user-1',
        ),
      );

      expect(resolvedMessages.first.isPending, isFalse);
    },
  );

  test(
    'late local pending insertion stays resolved when a final reply already exists',
    () {
      final List<ChatMessage> updatedMessages = upsertChatTimelineMessage(
        messages: <ChatMessage>[
          buildAssistantMessage(
            id: 'assistant-1',
            text: 'already done',
            replyTo: 'user-1',
          ),
        ],
        message: buildUserMessage(id: 'user-1', text: 'hello', isPending: true),
      );

      expect(updatedMessages.first.sender, ChatSender.assistant);
      expect(updatedMessages.last.sender, ChatSender.user);
      expect(updatedMessages.last.isPending, isFalse);
    },
  );

  test(
    'duplicate final replies still clear a user bubble that became pending again',
    () {
      final List<ChatMessage> updatedMessages = upsertChatTimelineMessage(
        messages: <ChatMessage>[
          buildUserMessage(id: 'user-1', text: 'hello', isPending: true),
          buildAssistantMessage(
            id: 'assistant-1',
            text: 'done',
            replyTo: 'user-1',
          ),
        ],
        message: buildAssistantMessage(
          id: 'assistant-1',
          text: 'done',
          replyTo: 'user-1',
        ),
      );

      expect(updatedMessages.first.isPending, isFalse);
    },
  );
}
