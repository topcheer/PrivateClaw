import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:intl/intl.dart';
import 'package:just_audio/just_audio.dart';
import 'package:video_player/video_player.dart';

import '../l10n/app_localizations.dart';
import '../models/chat_attachment.dart';
import '../models/chat_message.dart';
import '../services/privateclaw_app_directories.dart';
import 'privateclaw_avatar.dart';

final Map<String, Future<Uri?>> _attachmentUriCache = <String, Future<Uri?>>{};
final Map<String, ImageProvider<Object>?> _attachmentImageProviderCache =
    <String, ImageProvider<Object>?>{};

class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.sender == ChatSender.user;
    final bool isOwnUserMessage = isUser && message.isOwnMessage;
    final bool isPeerUserMessage = isUser && !message.isOwnMessage;
    final bool isSystem = message.sender == ChatSender.system;
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
              if (message.isPending && !isUser) ...<Widget>[
                const _PendingBubbleIndicator(),
                const SizedBox(height: 8),
              ],
              if (message.text.trim().isNotEmpty) ..._buildTextContent(context),
              if (message.attachments.isNotEmpty) ...<Widget>[
                if (message.text.trim().isNotEmpty) const SizedBox(height: 12),
                ...message.attachments.map(
                  (ChatAttachment attachment) => Padding(
                    key: ValueKey<String>('attachment-${attachment.id}'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _AttachmentCard(
                      key: ValueKey<String>(attachment.id),
                      attachment: attachment,
                    ),
                  ),
                ),
              ],
              if (message.isPending && isUser) ...<Widget>[
                if (message.text.trim().isNotEmpty ||
                    message.attachments.isNotEmpty)
                  const SizedBox(height: 8),
                const _PendingBubbleIndicator(),
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
          widgets.add(_MarkdownSegment(data: before));
          widgets.add(const SizedBox(height: 8));
        }
      }

      final String mermaidSource = (match.group(1) ?? '').trim();
      if (mermaidSource.isNotEmpty) {
        widgets.add(_MermaidSegment(source: mermaidSource));
        widgets.add(const SizedBox(height: 8));
      }
      offset = match.end;
    }

    if (offset < text.length) {
      final String after = text.substring(offset).trim();
      if (after.isNotEmpty) {
        widgets.add(_MarkdownSegment(data: after));
        widgets.add(const SizedBox(height: 8));
      }
    }

    if (widgets.isEmpty) {
      widgets.add(_MarkdownSegment(data: text));
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

class _MarkdownSegment extends StatelessWidget {
  const _MarkdownSegment({required this.data});

  final String data;

  @override
  Widget build(BuildContext context) {
    return MarkdownBody(
      data: data,
      selectable: true,
      imageBuilder: (Uri uri, String? title, String? alt) {
        final Uri? resolvedUri = Uri.tryParse(uri.toString());
        final Widget image = resolvedUri != null && resolvedUri.scheme == 'file'
            ? Image.file(
                File(resolvedUri.toFilePath()),
                fit: BoxFit.cover,
                gaplessPlayback: true,
              )
            : Image.network(
                uri.toString(),
                fit: BoxFit.cover,
                gaplessPlayback: true,
              );
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: image,
          ),
        );
      },
      styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
        p: Theme.of(context).textTheme.bodyLarge,
        codeblockDecoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}

class _MermaidSegment extends StatelessWidget {
  const _MermaidSegment({required this.source});

  final String source;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(
              Icons.account_tree_outlined,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 8),
            SelectableText(source),
          ],
        ),
      ),
    );
  }
}

class _PendingBubbleIndicator extends StatelessWidget {
  const _PendingBubbleIndicator();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        color: Theme.of(context).colorScheme.primary,
      ),
    );
  }
}

class _AttachmentCard extends StatelessWidget {
  const _AttachmentCard({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    if (attachment.isImage) {
      return _ImageAttachmentCard(attachment: attachment);
    }

    if (attachment.isAudio) {
      return _AudioAttachmentCard(attachment: attachment);
    }

    if (attachment.isVideo) {
      return _VideoAttachmentCard(attachment: attachment);
    }

    final IconData icon = attachment.isAudio
        ? Icons.audiotrack
        : attachment.isVideo
        ? Icons.videocam
        : Icons.attach_file;

    return _GenericAttachmentCard(attachment: attachment, icon: icon);
  }
}

class _ImageAttachmentCard extends StatelessWidget {
  const _ImageAttachmentCard({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    final ImageProvider<Object>? imageProvider =
        _resolveAttachmentImageProvider(attachment);
    if (imageProvider != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image(
          image: imageProvider,
          fit: BoxFit.cover,
          gaplessPlayback: true,
        ),
      );
    }

    return _GenericAttachmentCard(
      attachment: attachment,
      icon: Icons.image_outlined,
    );
  }
}

class _GenericAttachmentCard extends StatelessWidget {
  const _GenericAttachmentCard({required this.attachment, required this.icon});

  final ChatAttachment attachment;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.45),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: <Widget>[
            Icon(icon),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    attachment.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    '${attachment.mimeType} • ${_formatSize(attachment.sizeBytes)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingAttachmentCard extends StatelessWidget {
  const _LoadingAttachmentCard({
    required this.attachment,
    required this.icon,
    required this.label,
  });

  final ChatAttachment attachment;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.45),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: <Widget>[
            Icon(icon),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    attachment.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(label, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: 12),
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}

class _AudioAttachmentCard extends StatefulWidget {
  const _AudioAttachmentCard({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  State<_AudioAttachmentCard> createState() => _AudioAttachmentCardState();
}

class _AudioAttachmentCardState extends State<_AudioAttachmentCard>
    with AutomaticKeepAliveClientMixin<_AudioAttachmentCard> {
  AudioPlayer? _player;
  Future<void>? _initialization;
  Object? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _initialization = _initialize();
  }

  Future<void> _initialize() async {
    try {
      final Uri? source = await _resolveAttachmentUri(widget.attachment);
      if (source == null) {
        throw StateError('Attachment source is unavailable.');
      }

      final AudioPlayer player = AudioPlayer();
      if (source.scheme == 'file') {
        await player.setFilePath(source.toFilePath());
      } else {
        await player.setUrl(source.toString());
      }

      if (!mounted) {
        await player.dispose();
        return;
      }

      setState(() {
        _player = player;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error;
      });
    }
  }

  @override
  void dispose() {
    unawaited(_player?.dispose());
    super.dispose();
  }

  Future<void> _togglePlayback() async {
    final AudioPlayer? player = _player;
    if (player == null) {
      return;
    }

    if (player.playing) {
      await player.pause();
      return;
    }

    await player.play();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final AudioPlayer? player = _player;
    if (_error != null) {
      return _GenericAttachmentCard(
        attachment: widget.attachment,
        icon: Icons.audiotrack,
      );
    }

    if (player == null) {
      return FutureBuilder<void>(
        future: _initialization,
        builder: (BuildContext context, AsyncSnapshot<void> snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return _LoadingAttachmentCard(
              attachment: widget.attachment,
              icon: Icons.audiotrack,
              label: AppLocalizations.of(context)!.preparingAudioAttachment,
            );
          }

          final AudioPlayer? readyPlayer = _player;
          if (readyPlayer == null) {
            return _GenericAttachmentCard(
              attachment: widget.attachment,
              icon: Icons.audiotrack,
            );
          }

          return _buildPlayerCard(context, readyPlayer);
        },
      );
    }

    return _buildPlayerCard(context, player);
  }

  Widget _buildPlayerCard(BuildContext context, AudioPlayer player) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.45),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                StreamBuilder<PlayerState>(
                  stream: player.playerStateStream,
                  builder:
                      (
                        BuildContext context,
                        AsyncSnapshot<PlayerState> snapshot,
                      ) {
                        final bool isPlaying =
                            snapshot.data?.playing ?? player.playing;
                        return IconButton(
                          onPressed: _togglePlayback,
                          icon: Icon(
                            isPlaying ? Icons.pause_circle : Icons.play_circle,
                          ),
                        );
                      },
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        widget.attachment.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${widget.attachment.mimeType} • ${_formatSize(widget.attachment.sizeBytes)}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            StreamBuilder<Duration>(
              stream: player.positionStream,
              builder: (BuildContext context, AsyncSnapshot<Duration> snapshot) {
                final Duration position = snapshot.data ?? Duration.zero;
                final Duration duration = player.duration ?? Duration.zero;
                final double progress = duration.inMilliseconds <= 0
                    ? 0
                    : position.inMilliseconds / duration.inMilliseconds;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    LinearProgressIndicator(
                      value: progress.clamp(0.0, 1.0).toDouble(),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_formatDuration(position)} / ${_formatDuration(duration)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _VideoAttachmentCard extends StatefulWidget {
  const _VideoAttachmentCard({required this.attachment, super.key});

  final ChatAttachment attachment;

  @override
  State<_VideoAttachmentCard> createState() => _VideoAttachmentCardState();
}

class _VideoAttachmentCardState extends State<_VideoAttachmentCard>
    with AutomaticKeepAliveClientMixin<_VideoAttachmentCard> {
  VideoPlayerController? _controller;
  Future<void>? _initialization;
  Object? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _initialization = _initialize();
  }

  Future<void> _initialize() async {
    try {
      final Uri? source = await _resolveAttachmentUri(widget.attachment);
      if (source == null) {
        throw StateError('Attachment source is unavailable.');
      }

      final VideoPlayerController controller = source.scheme == 'file'
          ? VideoPlayerController.file(File(source.toFilePath()))
          : VideoPlayerController.networkUrl(source);
      await controller.initialize();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _controller = controller;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error;
      });
    }
  }

  @override
  void dispose() {
    unawaited(_controller?.dispose());
    super.dispose();
  }

  Future<void> _togglePlayback() async {
    final VideoPlayerController? controller = _controller;
    if (controller == null) {
      return;
    }

    if (controller.value.isPlaying) {
      await controller.pause();
      return;
    }

    await controller.play();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final VideoPlayerController? controller = _controller;
    if (_error != null) {
      return _GenericAttachmentCard(
        attachment: widget.attachment,
        icon: Icons.videocam,
      );
    }

    if (controller == null) {
      return FutureBuilder<void>(
        future: _initialization,
        builder: (BuildContext context, AsyncSnapshot<void> snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return _LoadingAttachmentCard(
              attachment: widget.attachment,
              icon: Icons.videocam,
              label: AppLocalizations.of(context)!.preparingVideoAttachment,
            );
          }

          final VideoPlayerController? readyController = _controller;
          if (readyController == null) {
            return _GenericAttachmentCard(
              attachment: widget.attachment,
              icon: Icons.videocam,
            );
          }

          return _buildPlayerCard(context, readyController);
        },
      );
    }

    return _buildPlayerCard(context, controller);
  }

  Widget _buildPlayerCard(
    BuildContext context,
    VideoPlayerController controller,
  ) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.45),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: AspectRatio(
                aspectRatio: controller.value.aspectRatio == 0
                    ? 16 / 9
                    : controller.value.aspectRatio,
                child: VideoPlayer(controller),
              ),
            ),
            VideoProgressIndicator(controller, allowScrubbing: true),
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                IconButton(
                  onPressed: _togglePlayback,
                  icon: Icon(
                    controller.value.isPlaying
                        ? Icons.pause_circle
                        : Icons.play_circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        widget.attachment.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${widget.attachment.mimeType} • ${_formatSize(widget.attachment.sizeBytes)}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _formatSize(int sizeBytes) {
  if (sizeBytes >= 1024 * 1024) {
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  if (sizeBytes >= 1024) {
    return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
  }
  return '$sizeBytes B';
}

String _formatDuration(Duration value) {
  String twoDigits(int input) => input.toString().padLeft(2, '0');
  final int minutes = value.inMinutes.remainder(60);
  final int seconds = value.inSeconds.remainder(60);

  if (value.inHours > 0) {
    return '${value.inHours}:${twoDigits(minutes)}:${twoDigits(seconds)}';
  }

  return '${value.inMinutes}:${twoDigits(seconds)}';
}

Future<Uri?> _resolveAttachmentUri(ChatAttachment attachment) {
  return _attachmentUriCache.putIfAbsent(attachment.id, () async {
    if (attachment.hasRemoteUri) {
      return Uri.tryParse(attachment.uri!);
    }

    final List<int>? bytes = attachment.decodeBytes();
    if (bytes == null) {
      return null;
    }

    final Directory tempDirectory = await getPrivateClawTemporaryDirectory();
    await tempDirectory.create(recursive: true);
    final String safeName = attachment.name.replaceAll(
      RegExp(r'[^A-Za-z0-9._-]'),
      '_',
    );
    final File file = File('${tempDirectory.path}/${attachment.id}_$safeName');
    await file.writeAsBytes(bytes, flush: true);
    return file.uri;
  });
}

ImageProvider<Object>? _resolveAttachmentImageProvider(
  ChatAttachment attachment,
) {
  return _attachmentImageProviderCache.putIfAbsent(attachment.id, () {
    final imageBytes = attachment.decodeBytes();
    if (imageBytes != null) {
      return MemoryImage(imageBytes);
    }

    if (!attachment.hasRemoteUri) {
      return null;
    }

    final Uri? source = Uri.tryParse(attachment.uri!);
    if (source != null && source.scheme == 'file') {
      return FileImage(File(source.toFilePath()));
    }

    return NetworkImage(attachment.uri!);
  });
}
