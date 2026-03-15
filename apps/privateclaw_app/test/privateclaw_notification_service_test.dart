import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/services/privateclaw_notification_service.dart';
import 'package:privateclaw_app/services/privateclaw_notified_message_store.dart';

void main() {
  test('background fetch waits longer for the first notifiable message', () {
    expect(
      privateClawBackgroundFetchSettleDelay(
        hasReceivedNotifiableMessage: false,
      ),
      const Duration(seconds: 6),
    );
    expect(
      privateClawBackgroundFetchSettleDelay(hasReceivedNotifiableMessage: true),
      const Duration(milliseconds: 900),
    );
  });

  test(
    'background fetch filters previously notified messages by message id',
    () {
      final DateTime sentAt = DateTime.utc(2026, 3, 15, 8, 0);
      final List<ChatMessage> freshMessages =
          privateClawFilterUnnotifiedMessages(
            messages: <ChatMessage>[
              ChatMessage(
                id: 'assistant-old',
                sender: ChatSender.assistant,
                text: 'old replay',
                sentAt: sentAt,
              ),
              ChatMessage(
                id: 'assistant-old',
                sender: ChatSender.assistant,
                text: 'old replay duplicate',
                sentAt: sentAt,
              ),
              ChatMessage(
                id: 'assistant-new',
                sender: ChatSender.assistant,
                text: 'new reply',
                sentAt: sentAt,
              ),
              ChatMessage(
                id: 'participant-new',
                sender: ChatSender.user,
                text: 'new participant',
                sentAt: sentAt,
                senderId: 'peer-app',
                senderLabel: 'Peer',
              ),
            ],
            notifiedMessageIds: <String>{'assistant-old'},
          );

      expect(
        freshMessages.map((ChatMessage message) => message.id).toList(),
        <String>['assistant-new', 'participant-new'],
      );
    },
  );

  test('notified message store merges ids by recency and enforces a cap', () {
    expect(
      privateClawMergeNotifiedMessageIds(
        existingIds: <String>['m1', 'm2'],
        newIds: <String>['m2', 'm3', 'm4'],
        maxEntries: 3,
      ),
      <String>['m2', 'm3', 'm4'],
    );
  });
}
