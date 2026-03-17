import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/chat_attachment.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/widgets/chat_message_bubble.dart';
import 'package:privateclaw_app/widgets/privateclaw_avatar.dart';

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

  testWidgets(
    'ChatMessageBubble keeps own pending text visible with inline wait indicator',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChatMessageBubble(
              message: ChatMessage(
                id: 'user-pending-1',
                sender: ChatSender.user,
                text: '正在发送这条消息',
                sentAt: DateTime.utc(2026, 1, 1),
                isPending: true,
                isOwnMessage: true,
              ),
            ),
          ),
        ),
      );

      expect(find.text('正在发送这条消息'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    },
  );

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
    expect(
      find.byWidgetPredicate(
        (Widget widget) => widget is Image && widget.image is MemoryImage,
      ),
      findsOneWidget,
    );
  });

  testWidgets('ChatMessageBubble reuses cached inline image providers', (
    WidgetTester tester,
  ) async {
    const String pixelBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0v8AAAAASUVORK5CYII=';

    Future<ImageProvider<Object>> pumpMessage(ChatMessage message) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ChatMessageBubble(message: message)),
        ),
      );
      await tester.pump();
      return tester
          .widgetList<Image>(
            find.byWidgetPredicate(
              (Widget widget) => widget is Image && widget.image is MemoryImage,
            ),
          )
          .first
          .image;
    }

    final ImageProvider<Object> firstProvider = await pumpMessage(
      ChatMessage(
        id: 'assistant-image-1',
        sender: ChatSender.assistant,
        text: '',
        sentAt: DateTime.utc(2026, 1, 1),
        attachments: const <ChatAttachment>[
          ChatAttachment(
            id: 'attachment-cache-1',
            name: 'pixel.png',
            mimeType: 'image/png',
            sizeBytes: 68,
            dataBase64: pixelBase64,
          ),
        ],
      ),
    );

    final ImageProvider<Object> secondProvider = await pumpMessage(
      ChatMessage(
        id: 'assistant-image-2',
        sender: ChatSender.assistant,
        text: '',
        sentAt: DateTime.utc(2026, 1, 2),
        attachments: const <ChatAttachment>[
          ChatAttachment(
            id: 'attachment-cache-1',
            name: 'pixel.png',
            mimeType: 'image/png',
            sizeBytes: 68,
            dataBase64: pixelBase64,
          ),
        ],
      ),
    );

    expect(identical(firstProvider, secondProvider), isTrue);
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
    expect(find.text('流萤'), findsOneWidget);
    expect(
      tester
          .widget<PrivateClawAvatar>(
            find.byKey(const ValueKey<String>('message-avatar-participant-1')),
          )
          .kind,
      PrivateClawAvatarKind.generated,
    );
  });

  testWidgets(
    'ChatMessageBubble uses the app icon avatar for assistant messages',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChatMessageBubble(
              message: ChatMessage(
                id: 'assistant-avatar-1',
                sender: ChatSender.assistant,
                text: 'Hello from the assistant',
                sentAt: DateTime.utc(2026, 1, 1),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Hello from the assistant'), findsOneWidget);
      expect(
        tester
            .widget<PrivateClawAvatar>(
              find.byKey(
                const ValueKey<String>('message-avatar-assistant-avatar-1'),
              ),
            )
            .kind,
        PrivateClawAvatarKind.assistant,
      );
    },
  );
}
