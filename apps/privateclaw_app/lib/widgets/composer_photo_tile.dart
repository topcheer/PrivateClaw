import 'dart:typed_data';

import 'package:flutter/material.dart';

class ComposerPhotoTile extends StatelessWidget {
  const ComposerPhotoTile({
    required this.assetId,
    required this.thumbnailFuture,
    required this.isSelected,
    required this.isLoading,
    required this.onTap,
    super.key,
  });

  final String assetId;
  final Future<Uint8List?> thumbnailFuture;
  final bool isSelected;
  final bool isLoading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey<String>('photo-tray-tile-$assetId'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: 120,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outlineVariant,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(19),
            child: Stack(
              fit: StackFit.expand,
              children: <Widget>[
                FutureBuilder<Uint8List?>(
                  future: thumbnailFuture,
                  builder:
                      (
                        BuildContext context,
                        AsyncSnapshot<Uint8List?> snapshot,
                      ) {
                        final Uint8List? bytes = snapshot.data;
                        if (bytes == null || bytes.isEmpty) {
                          return DecoratedBox(
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHighest,
                            ),
                            child: const Center(
                              child: Icon(Icons.photo_outlined),
                            ),
                          );
                        }
                        return Image.memory(bytes, fit: BoxFit.cover);
                      },
                ),
                if (isSelected)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.2),
                    ),
                  ),
                if (isLoading) const Center(child: CircularProgressIndicator()),
                Positioned(
                  top: 8,
                  right: 8,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 120),
                    opacity: isSelected ? 1 : 0,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
