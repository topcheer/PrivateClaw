import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../l10n/app_localizations.dart';
import '../models/chat_attachment.dart';
import '../services/privateclaw_app_directories.dart';

final Map<String, Future<Uri?>> _attachmentUriCache = <String, Future<Uri?>>{};
final Map<String, ImageProvider<Object>?> _attachmentImageProviderCache =
    <String, ImageProvider<Object>?>{};
const MethodChannel _attachmentHandoffChannel = MethodChannel(
  'gg.ai.privateclaw/attachment_handoff',
);

typedef AttachmentUrlLauncher =
    Future<bool> Function(Uri url, {LaunchMode mode});
typedef AttachmentHandoffPresenter =
    Future<bool> Function({
      required ChatAttachment attachment,
      required Uri source,
    });

Future<bool> _defaultAttachmentUrlLauncher(
  Uri url, {
  LaunchMode mode = LaunchMode.platformDefault,
}) {
  return launchUrl(url, mode: mode);
}

AttachmentUrlLauncher attachmentUrlLauncher = _defaultAttachmentUrlLauncher;

Future<bool> _defaultAttachmentHandoffPresenter({
  required ChatAttachment attachment,
  required Uri source,
}) async {
  if (!(Platform.isIOS || Platform.isAndroid)) {
    return false;
  }

  final Map<String, Object?> arguments = <String, Object?>{
    'name': attachment.name,
    'mimeType': attachment.mimeType,
    if (source.scheme == 'file') 'filePath': source.toFilePath(),
    if (source.scheme != 'file') 'url': source.toString(),
  };
  final bool? presented = await _attachmentHandoffChannel.invokeMethod<bool>(
    'present',
    arguments,
  );
  return presented == true;
}

AttachmentHandoffPresenter attachmentHandoffPresenter =
    _defaultAttachmentHandoffPresenter;

class AttachmentCard extends StatelessWidget {
  const AttachmentCard({required this.attachment, super.key});

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

    return _GenericAttachmentCard(
      attachment: attachment,
      icon: icon,
      onTap: _canOpenAttachment(attachment)
          ? () {
              unawaited(_openAttachment(context, attachment));
            }
          : null,
    );
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
      return Material(
        color: Colors.transparent,
        child: InkWell(
          key: ValueKey<String>('attachment-image-${attachment.id}'),
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            Navigator.of(context).push<void>(
              MaterialPageRoute<void>(
                builder: (BuildContext context) => _ImageAttachmentViewerPage(
                  attachment: attachment,
                  imageProvider: imageProvider,
                ),
              ),
            );
          },
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 160, minHeight: 96),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Hero(
                tag: _attachmentHeroTag(attachment.id),
                child: Image(
                  image: imageProvider,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return _GenericAttachmentCard(
      attachment: attachment,
      icon: Icons.image_outlined,
      onTap: _canOpenAttachment(attachment)
          ? () {
              unawaited(_openAttachment(context, attachment));
            }
          : null,
    );
  }
}

class _GenericAttachmentCard extends StatelessWidget {
  const _GenericAttachmentCard({
    required this.attachment,
    required this.icon,
    this.onTap,
  });

  final ChatAttachment attachment;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final Widget content = DecoratedBox(
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
            if (onTap != null) ...<Widget>[
              const SizedBox(width: 12),
              const Icon(Icons.open_in_new_rounded, size: 18),
            ],
          ],
        ),
      ),
    );

    if (onTap == null) {
      return content;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey<String>('attachment-open-${attachment.id}'),
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: content,
      ),
    );
  }
}

class _ImageAttachmentViewerPage extends StatelessWidget {
  const _ImageAttachmentViewerPage({
    required this.attachment,
    required this.imageProvider,
  });

  final ChatAttachment attachment;
  final ImageProvider<Object> imageProvider;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: ValueKey<String>('attachment-viewer-${attachment.id}'),
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(attachment.name),
      ),
      body: SafeArea(
        child: Center(
          child: InteractiveViewer(
            minScale: 0.8,
            maxScale: 4,
            child: Hero(
              tag: _attachmentHeroTag(attachment.id),
              child: Image(
                image: imageProvider,
                fit: BoxFit.contain,
                gaplessPlayback: true,
              ),
            ),
          ),
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

bool _canOpenAttachment(ChatAttachment attachment) {
  return attachment.hasInlineData || attachment.hasRemoteUri;
}

String _attachmentHeroTag(String attachmentId) {
  return 'attachment-hero-$attachmentId';
}

Future<void> _openAttachment(
  BuildContext context,
  ChatAttachment attachment,
) async {
  try {
    final Uri? source = await _resolveAttachmentUri(attachment);
    if (source == null) {
      throw StateError('Attachment source is unavailable.');
    }

    if (_shouldPreferNativeAttachmentHandoff(source)) {
      final bool presented = await attachmentHandoffPresenter(
        attachment: attachment,
        source: source,
      );
      if (presented) {
        return;
      }
    } else {
      final bool launched = await attachmentUrlLauncher(
        source,
        mode: LaunchMode.externalApplication,
      );
      if (launched) {
        return;
      }
      final bool presented = await attachmentHandoffPresenter(
        attachment: attachment,
        source: source,
      );
      if (presented) {
        return;
      }
    }
  } on PlatformException {
    // Fall through to the shared user-visible error.
  } on MissingPluginException {
    // Fall through to the shared user-visible error.
  } on FileSystemException {
    // Fall through to the shared user-visible error.
  } on StateError {
    // Fall through to the shared user-visible error.
  } on ArgumentError {
    // Fall through to the shared user-visible error.
  } on UnsupportedError {
    // Fall through to the shared user-visible error.
  } on Exception {
    // Fall through to the shared user-visible error.
  }

  if (!context.mounted) {
    return;
  }
  final ScaffoldMessengerState? messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) {
    return;
  }
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      content: Text(
        AppLocalizations.of(context)!.attachmentOpenFailed(attachment.name),
      ),
    ),
  );
}

bool _shouldPreferNativeAttachmentHandoff(Uri source) {
  return source.scheme == 'file';
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
