import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/chat_attachment.dart';
import 'package:privateclaw_app/models/chat_message.dart';
import 'package:privateclaw_app/widgets/chat_message_bubble.dart';
import 'package:privateclaw_app/widgets/privateclaw_avatar.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  tearDown(() {
    attachmentUrlLauncher =
        (Uri url, {LaunchMode mode = LaunchMode.platformDefault}) {
          return launchUrl(url, mode: mode);
        };
    attachmentHandoffPresenter =
        ({required ChatAttachment attachment, required Uri source}) async {
          return false;
        };
  });

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

  testWidgets(
    'ChatMessageBubble opens image attachments in a fullscreen viewer',
    (WidgetTester tester) async {
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
                id: 'assistant-image-viewer-1',
                sender: ChatSender.assistant,
                text: '',
                sentAt: DateTime.utc(2026, 1, 1),
                attachments: <ChatAttachment>[
                  ChatAttachment(
                    id: 'attachment-image-viewer-1',
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

      final Finder imageFinder = find.byKey(
        const ValueKey<String>('attachment-image-attachment-image-viewer-1'),
      );
      await tester.ensureVisible(imageFinder);
      await tester.tap(imageFinder);
      await tester.pumpAndSettle();

      expect(
        find.byKey(
          const ValueKey<String>('attachment-viewer-attachment-image-viewer-1'),
        ),
        findsOneWidget,
      );
      expect(find.text('pixel.png'), findsOneWidget);
    },
  );

  testWidgets(
    'ChatMessageBubble opens generic attachments through the launcher',
    (WidgetTester tester) async {
      Uri? launchedUri;
      LaunchMode? launchedMode;
      bool nativePresenterCalled = false;
      attachmentUrlLauncher =
          (Uri url, {LaunchMode mode = LaunchMode.platformDefault}) async {
            launchedUri = url;
            launchedMode = mode;
            return true;
          };
      attachmentHandoffPresenter =
          ({required ChatAttachment attachment, required Uri source}) async {
            nativePresenterCalled = true;
            return false;
          };

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChatMessageBubble(
              message: ChatMessage(
                id: 'assistant-file-1',
                sender: ChatSender.assistant,
                text: '',
                sentAt: DateTime.utc(2026, 1, 1),
                attachments: <ChatAttachment>[
                  ChatAttachment(
                    id: 'attachment-file-open-1',
                    name: 'notes.txt',
                    mimeType: 'text/plain',
                    sizeBytes: 5,
                    uri: 'https://example.com/notes.txt',
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await tester.tap(
        find.byKey(
          const ValueKey<String>('attachment-open-attachment-file-open-1'),
        ),
      );
      await tester.pumpAndSettle();

      expect(launchedUri, isNotNull);
      expect(launchedUri!.scheme, 'https');
      expect(launchedMode, LaunchMode.externalApplication);
      expect(nativePresenterCalled, isFalse);
    },
  );

  testWidgets('local handoff smoke', (WidgetTester tester) async {
    ChatAttachment? presentedAttachment;
    Uri? presentedSource;
    bool launcherCalled = false;
    attachmentUrlLauncher =
        (Uri url, {LaunchMode mode = LaunchMode.platformDefault}) async {
          launcherCalled = true;
          return false;
        };
    attachmentHandoffPresenter =
        ({required ChatAttachment attachment, required Uri source}) async {
          presentedAttachment = attachment;
          presentedSource = source;
          return true;
        };
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatMessageBubble(
            message: ChatMessage(
              id: 'assistant-file-local-1',
              sender: ChatSender.assistant,
              text: '',
              sentAt: DateTime.utc(2026, 1, 1),
              attachments: <ChatAttachment>[
                ChatAttachment(
                  id: 'attachment-file-local-open-1',
                  name: 'notes.txt',
                  mimeType: 'text/plain',
                  sizeBytes: 5,
                  uri: 'file:///tmp/notes.txt',
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.tap(
      find.byKey(
        const ValueKey<String>('attachment-open-attachment-file-local-open-1'),
      ),
    );
    await tester.pumpAndSettle();
    expect(launcherCalled, isFalse);
    expect(presentedAttachment, isNotNull);
    expect(presentedAttachment!.id, 'attachment-file-local-open-1');
    expect(presentedSource, isNotNull);
    expect(presentedSource!.scheme, 'file');
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

  testWidgets('ChatMessageBubble renders a collapsible thinking trace', (
    WidgetTester tester,
  ) async {
    final ChatMessage streamingMessage = ChatMessage(
      id: 'thinking-1',
      sender: ChatSender.assistant,
      text: '',
      sentAt: DateTime.utc(2026, 1, 1, 0, 0, 2),
      replyTo: 'user-1',
      thinkingStatus: ChatThinkingStatus.streaming,
      thinkingSummary: 'read: Opened README excerpt',
      thinkingEntries: <ChatThinkingEntry>[
        ChatThinkingEntry(
          id: 'trace-entry-1',
          kind: ChatThinkingEntryKind.thought,
          title: 'Thinking',
          text: 'Plan the answer structure',
          sentAt: DateTime.utc(2026, 1, 1, 0, 0),
        ),
        ChatThinkingEntry(
          id: 'trace-entry-2',
          kind: ChatThinkingEntryKind.action,
          title: 'Tool • read',
          text: 'Opened README excerpt',
          sentAt: DateTime.utc(2026, 1, 1, 0, 0, 1),
          toolName: 'read',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: ChatMessageBubble(message: streamingMessage)),
      ),
    );

    expect(find.text('Tool • read'), findsOneWidget);
    expect(find.text('read: Opened README excerpt'), findsOneWidget);
    expect(find.text('Plan the answer structure'), findsNothing);

    await tester.tap(find.text('Tool • read'));
    await tester.pump();

    expect(find.text('Plan the answer structure'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatMessageBubble(
            message: streamingMessage.copyWith(
              thinkingStatus: ChatThinkingStatus.completed,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Plan the answer structure'), findsNothing);
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
