import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/chat_attachment.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/widgets/chat_message_bubble.dart';

void main() {
  testWidgets('ChatMessageBubble shows a pending assistant indicator', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatMessageBubble(
            message: ChatMessage(
              id: 'pending-1',
              sender: ChatSender.assistant,
              text: '',
              sentAt: DateTime.utc(2026, 1, 1),
              isPending: true,
              replyTo: 'user-1',
            ),
          ),
        ),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('ChatMessageBubble renders markdown text and image attachments', (
    WidgetTester tester,
  ) async {
    final Uint8List imageBytes = Uint8List.fromList(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0v8AAAAASUVORK5CYII=',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatMessageBubble(
            message: ChatMessage(
              id: 'assistant-1',
              sender: ChatSender.assistant,
              text: '**Bold reply**',
              sentAt: DateTime.utc(2026, 1, 1),
              attachments: <ChatAttachment>[
                ChatAttachment(
                  id: 'attachment-1',
                  name: 'pixel.png',
                  mimeType: 'image/png',
                  sizeBytes: imageBytes.length,
                  dataBase64: base64Encode(imageBytes),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(find.text('Bold reply'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('ChatMessageBubble shows participant labels for group messages', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatMessageBubble(
            message: ChatMessage(
              id: 'participant-1',
              sender: ChatSender.user,
              text: 'Hello team',
              sentAt: DateTime.utc(2026, 1, 1),
              senderId: 'app-2',
              senderLabel: '流萤狐',
            ),
          ),
        ),
      ),
    );

    expect(find.text('流萤狐'), findsOneWidget);
    expect(find.text('Hello team'), findsOneWidget);
  });
}
