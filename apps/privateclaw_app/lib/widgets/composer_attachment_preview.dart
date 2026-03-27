import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../models/chat_attachment.dart';

IconData attachmentIconForPreview(ChatAttachment attachment) {
  if (attachment.isImage) {
    return Icons.image_outlined;
  }
  if (attachment.isAudio) {
    return Icons.mic_none;
  }
  if (attachment.isVideo) {
    return Icons.videocam_outlined;
  }
  return Icons.attach_file;
}

class ComposerAttachmentPreview extends StatelessWidget {
  const ComposerAttachmentPreview({
    required this.attachment,
    required this.onDeleted,
    super.key,
  });

  final ChatAttachment attachment;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Uint8List? imageBytes = attachment.isImage
        ? attachment.decodeBytes()
        : null;
    final bool showsImage = imageBytes != null && imageBytes.isNotEmpty;
    final double width = showsImage ? 72 : 188;
    return SizedBox(
      width: width,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: showsImage
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(17),
                      child: Image.memory(imageBytes, fit: BoxFit.cover),
                    )
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: <Widget>[
                          Icon(attachmentIconForPreview(attachment)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              attachment.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
          Positioned(
            top: -6,
            right: -6,
            child: Material(
              color: theme.colorScheme.surface,
              shape: const CircleBorder(),
              elevation: 2,
              child: InkWell(
                onTap: onDeleted,
                customBorder: const CircleBorder(),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close, size: 16),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
