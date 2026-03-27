import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

class MarkdownSegment extends StatelessWidget {
  const MarkdownSegment({required this.data, super.key});

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

class MermaidSegment extends StatelessWidget {
  const MermaidSegment({required this.source, super.key});

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

class PendingBubbleIndicator extends StatelessWidget {
  const PendingBubbleIndicator({super.key});

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
