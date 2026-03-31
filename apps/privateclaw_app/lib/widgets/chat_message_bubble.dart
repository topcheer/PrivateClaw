import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_localizations.dart';
import '../models/chat_attachment.dart';
import '../models/chat_message.dart';
import '../services/privateclaw_platform_utils.dart';
import 'attachment_card.dart';
import 'chat_content_segments.dart';
import 'privateclaw_avatar.dart';
import 'thinking_trace_card.dart';

const String _assistantReportInappropriateContentUrl =
    'https://groups.google.com/g/gg-studio-ai-products';

typedef ChatMessageBubbleReportLauncher =
    Future<bool> Function(Uri url, {LaunchMode mode});

Future<bool> _defaultChatMessageBubbleReportLauncher(
  Uri url, {
  LaunchMode mode = LaunchMode.platformDefault,
}) {
  return launchUrl(url, mode: mode);
}

ChatMessageBubbleReportLauncher chatMessageBubbleReportLauncher =
    _defaultChatMessageBubbleReportLauncher;

class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.sender == ChatSender.user;
    final bool isOwnUserMessage = isUser && message.isOwnMessage;
    final bool isPeerUserMessage = isUser && !message.isOwnMessage;
    final bool isSystem = message.sender == ChatSender.system;
    final bool hasTextContent = message.text.trim().isNotEmpty;
    final bool hasAttachments = message.attachments.isNotEmpty;
    final bool showAssistantDisclaimer =
        message.sender == ChatSender.assistant &&
        !message.isPending &&
        !message.isThinkingTrace &&
        (hasTextContent || hasAttachments) &&
        privateClawShowsAssistantDisclaimerForTargetPlatform(
          privateClawTargetPlatformResolver(),
        );
    final Color bubbleColor;
    final Alignment alignment;

    if (isOwnUserMessage) {
      bubbleColor = Theme.of(context).colorScheme.primaryContainer;
      alignment = Alignment.centerRight;
    } else if (isPeerUserMessage) {
      bubbleColor = Theme.of(context).colorScheme.tertiaryContainer;
      alignment = Alignment.centerLeft;
    } else if (isSystem) {
      bubbleColor = Theme.of(context).colorScheme.surfaceContainerHighest;
      alignment = Alignment.center;
    } else {
      bubbleColor = Theme.of(context).colorScheme.secondaryContainer;
      alignment = Alignment.centerLeft;
    }

    final Widget bubble = ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: isUser
                ? (isOwnUserMessage
                      ? CrossAxisAlignment.end
                      : CrossAxisAlignment.start)
                : CrossAxisAlignment.start,
            children: <Widget>[
              if (message.senderLabel != null &&
                  message.senderLabel!.trim().isNotEmpty &&
                  !isSystem) ...<Widget>[
                Text(
                  message.senderLabel!,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              if (message.isThinkingTrace)
                ThinkingTraceCard(message: message)
              else ...<Widget>[
                if (message.isPending && !isUser) ...<Widget>[
                  const PendingBubbleIndicator(),
                  const SizedBox(height: 8),
                ],
                if (hasTextContent) ..._buildTextContent(context),
                if (hasAttachments) ...<Widget>[
                  if (hasTextContent) const SizedBox(height: 12),
                  ...message.attachments.map(
                    (ChatAttachment attachment) => Padding(
                      key: ValueKey<String>('attachment-${attachment.id}'),
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AttachmentCard(
                        key: ValueKey<String>(attachment.id),
                        attachment: attachment,
                      ),
                    ),
                  ),
                ],
                if (showAssistantDisclaimer) ...<Widget>[
                  if (hasTextContent || hasAttachments)
                    const SizedBox(height: 12),
                  _AssistantMessageDisclaimer(messageId: message.id),
                ],
                if (message.isPending && isUser) ...<Widget>[
                  if (hasTextContent || hasAttachments)
                    const SizedBox(height: 8),
                  const PendingBubbleIndicator(),
                ],
              ],
              const SizedBox(height: 6),
              Text(
                _formatMessageTimestamp(context, message.sentAt),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );

    if (isSystem) {
      return Align(alignment: alignment, child: bubble);
    }

    final Widget avatar = message.sender == ChatSender.assistant
        ? PrivateClawAvatar.assistant(
            key: ValueKey<String>('message-avatar-${message.id}'),
            semanticLabel: 'assistant avatar',
          )
        : PrivateClawAvatar.generated(
            key: ValueKey<String>('message-avatar-${message.id}'),
            seedId: message.senderId ?? message.id,
            label: message.senderLabel ?? message.senderId,
            semanticLabel: message.senderLabel ?? message.senderId,
          );

    return Align(
      alignment: alignment,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          if (!isOwnUserMessage) ...<Widget>[avatar, const SizedBox(width: 8)],
          Flexible(
            child: Align(alignment: alignment, child: bubble),
          ),
          if (isOwnUserMessage) ...<Widget>[const SizedBox(width: 8), avatar],
        ],
      ),
    );
  }

  List<Widget> _buildTextContent(BuildContext context) {
    final List<Widget> widgets = <Widget>[];
    final RegExp mermaidFence = RegExp(
      r'```mermaid\s*([\s\S]*?)```',
      multiLine: true,
    );
    final String text = message.text;
    int offset = 0;

    for (final RegExpMatch match in mermaidFence.allMatches(text)) {
      final int start = match.start;
      if (start > offset) {
        final String before = text.substring(offset, start).trim();
        if (before.isNotEmpty) {
          widgets.add(MarkdownSegment(data: before));
          widgets.add(const SizedBox(height: 8));
        }
      }

      final String mermaidSource = (match.group(1) ?? '').trim();
      if (mermaidSource.isNotEmpty) {
        widgets.add(MermaidSegment(source: mermaidSource));
        widgets.add(const SizedBox(height: 8));
      }
      offset = match.end;
    }

    if (offset < text.length) {
      final String after = text.substring(offset).trim();
      if (after.isNotEmpty) {
        widgets.add(MarkdownSegment(data: after));
        widgets.add(const SizedBox(height: 8));
      }
    }

    if (widgets.isEmpty) {
      widgets.add(MarkdownSegment(data: text));
      widgets.add(const SizedBox(height: 8));
    }

    widgets.removeLast();
    return widgets;
  }

  String _formatMessageTimestamp(BuildContext context, DateTime value) {
    final Locale locale = Localizations.localeOf(context);
    return DateFormat.yMd(locale.toString()).add_jm().format(value.toLocal());
  }
}

class _AssistantMessageDisclaimer extends StatelessWidget {
  const _AssistantMessageDisclaimer({required this.messageId});

  final String messageId;

  Future<void> _openReportLink(BuildContext context) async {
    final bool launched = await chatMessageBubbleReportLauncher(
      Uri.parse(_assistantReportInappropriateContentUrl),
      mode: LaunchMode.externalApplication,
    );
    if (launched || !context.mounted) {
      return;
    }
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      const SnackBar(content: Text(_assistantReportInappropriateContentUrl)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations localizations = AppLocalizations.of(context)!;
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    final TextStyle baseStyle = (theme.textTheme.bodySmall ?? const TextStyle())
        .copyWith(color: colorScheme.onSurfaceVariant);
    final TextStyle linkStyle = baseStyle.copyWith(
      color: colorScheme.primary,
      fontWeight: FontWeight.w600,
      decoration: TextDecoration.underline,
      decorationColor: colorScheme.primary,
    );

    return DecoratedBox(
      key: ValueKey<String>('assistant-disclaimer-$messageId'),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: colorScheme.outlineVariant.withValues(alpha: 0.7),
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: <Widget>[
            Text(
              localizations.assistantMessageAiGeneratedLabel,
              style: baseStyle,
            ),
            Text('·', style: baseStyle),
            TextButton(
              key: ValueKey<String>('assistant-disclaimer-report-$messageId'),
              onPressed: () {
                unawaited(_openReportLink(context));
              },
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
              child: Text(
                localizations.assistantMessageReportInappropriateContent,
                style: linkStyle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
