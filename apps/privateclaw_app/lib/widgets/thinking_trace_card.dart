import 'package:flutter/material.dart';

import '../models/chat_message.dart';

class ThinkingTraceCard extends StatefulWidget {
  const ThinkingTraceCard({required this.message, super.key});

  final ChatMessage message;

  @override
  State<ThinkingTraceCard> createState() => _ThinkingTraceCardState();
}

class _ThinkingTraceCardState extends State<ThinkingTraceCard> {
  bool _isExpanded = false;

  @override
  void didUpdateWidget(covariant ThinkingTraceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.message.isThinkingActive &&
        !widget.message.isThinkingActive) {
      _isExpanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colorScheme = theme.colorScheme;
    final ChatThinkingEntry? latestEntry = widget.message.latestThinkingEntry;
    final _ThinkingTraceVisuals visuals = _thinkingTraceVisuals(
      latestEntry?.kind,
      isActive: widget.message.isThinkingActive,
      hasError: widget.message.thinkingStatus == ChatThinkingStatus.failed,
      colorScheme: colorScheme,
    );
    final String summary =
        widget.message.thinkingSummary?.trim().isNotEmpty == true
        ? widget.message.thinkingSummary!.trim()
        : latestEntry?.text.trim().isNotEmpty == true
        ? latestEntry!.text.trim()
        : '…';
    final bool canExpand = widget.message.thinkingEntries.isNotEmpty;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: visuals.borderColor),
        gradient: LinearGradient(
          colors: <Color>[
            visuals.backgroundColor,
            visuals.backgroundColor.withValues(alpha: 0.72),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: canExpand
                  ? () {
                      setState(() {
                        _isExpanded = !_isExpanded;
                      });
                    }
                  : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    _ThinkingTraceLeadingIcon(
                      visuals: visuals,
                      isActive: widget.message.isThinkingActive,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Row(
                            children: <Widget>[
                              Expanded(
                                child: Text(
                                  latestEntry?.title ??
                                      (widget.message.isThinkingActive
                                          ? 'Thinking'
                                          : 'Trace'),
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: visuals.foregroundColor,
                                  ),
                                ),
                              ),
                              if (canExpand)
                                Icon(
                                  _isExpanded
                                      ? Icons.expand_less_rounded
                                      : Icons.expand_more_rounded,
                                  color: visuals.foregroundColor,
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            summary,
                            maxLines: _isExpanded ? null : 3,
                            overflow: _isExpanded
                                ? TextOverflow.visible
                                : TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: colorScheme.onSurface.withValues(
                                alpha: 0.88,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: <Widget>[
                              _ThinkingTracePill(
                                icon: visuals.icon,
                                label: widget.message.isThinkingActive
                                    ? 'Live'
                                    : widget.message.thinkingStatus ==
                                          ChatThinkingStatus.failed
                                    ? 'Failed'
                                    : 'Done',
                                foregroundColor: visuals.foregroundColor,
                                backgroundColor: visuals.backgroundColor,
                              ),
                              if (latestEntry?.toolName != null)
                                _ThinkingTracePill(
                                  icon: Icons.build_outlined,
                                  label: latestEntry!.toolName!,
                                  foregroundColor: colorScheme.primary,
                                  backgroundColor: colorScheme.primaryContainer,
                                ),
                              _ThinkingTracePill(
                                icon: Icons.format_list_bulleted_rounded,
                                label:
                                    '${widget.message.thinkingEntries.length}',
                                foregroundColor: colorScheme.onSurfaceVariant,
                                backgroundColor:
                                    colorScheme.surfaceContainerHighest,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_isExpanded &&
                widget.message.thinkingEntries.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              ...widget.message.thinkingEntries.map(
                (ChatThinkingEntry entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ThinkingTraceEntryTile(entry: entry),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ThinkingTraceLeadingIcon extends StatelessWidget {
  const _ThinkingTraceLeadingIcon({
    required this.visuals,
    required this.isActive,
  });

  final _ThinkingTraceVisuals visuals;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    if (isActive) {
      return SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.2,
          color: visuals.foregroundColor,
        ),
      );
    }
    return Icon(visuals.icon, color: visuals.foregroundColor, size: 22);
  }
}

class _ThinkingTraceEntryTile extends StatelessWidget {
  const _ThinkingTraceEntryTile({required this.entry});

  final ChatThinkingEntry entry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colorScheme = Theme.of(context).colorScheme;
    final _ThinkingTraceVisuals visuals = _thinkingTraceVisuals(
      entry.kind,
      isActive: false,
      hasError: entry.kind == ChatThinkingEntryKind.error,
      colorScheme: colorScheme,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: visuals.backgroundColor.withValues(alpha: 0.68),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: visuals.borderColor.withValues(alpha: 0.85)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(
                visuals.icon,
                size: 18,
                color: visuals.foregroundColor,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    entry.title,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (entry.text.trim().isNotEmpty) ...<Widget>[
                    const SizedBox(height: 6),
                    SelectableText(
                      entry.text,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurface.withValues(alpha: 0.88),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThinkingTracePill extends StatelessWidget {
  const _ThinkingTracePill({
    required this.icon,
    required this.label,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  final IconData icon;
  final String label;
  final Color foregroundColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 14, color: foregroundColor),
            const SizedBox(width: 6),
            Text(
              label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: foregroundColor,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThinkingTraceVisuals {
  const _ThinkingTraceVisuals({
    required this.icon,
    required this.backgroundColor,
    required this.borderColor,
    required this.foregroundColor,
  });

  final IconData icon;
  final Color backgroundColor;
  final Color borderColor;
  final Color foregroundColor;
}

_ThinkingTraceVisuals _thinkingTraceVisuals(
  ChatThinkingEntryKind? kind, {
  required bool isActive,
  required bool hasError,
  required ColorScheme colorScheme,
}) {
  if (hasError || kind == ChatThinkingEntryKind.error) {
    return _ThinkingTraceVisuals(
      icon: Icons.error_outline_rounded,
      backgroundColor: colorScheme.errorContainer.withValues(alpha: 0.75),
      borderColor: colorScheme.error.withValues(alpha: 0.55),
      foregroundColor: colorScheme.onErrorContainer,
    );
  }
  if (isActive || kind == ChatThinkingEntryKind.thought) {
    return _ThinkingTraceVisuals(
      icon: Icons.psychology_alt_outlined,
      backgroundColor: colorScheme.secondaryContainer.withValues(alpha: 0.72),
      borderColor: colorScheme.secondary.withValues(alpha: 0.35),
      foregroundColor: colorScheme.onSecondaryContainer,
    );
  }
  if (kind == ChatThinkingEntryKind.result) {
    return _ThinkingTraceVisuals(
      icon: Icons.task_alt_rounded,
      backgroundColor: colorScheme.tertiaryContainer.withValues(alpha: 0.74),
      borderColor: colorScheme.tertiary.withValues(alpha: 0.4),
      foregroundColor: colorScheme.onTertiaryContainer,
    );
  }
  return _ThinkingTraceVisuals(
    icon: Icons.build_circle_outlined,
    backgroundColor: colorScheme.primaryContainer.withValues(alpha: 0.72),
    borderColor: colorScheme.primary.withValues(alpha: 0.35),
    foregroundColor: colorScheme.onPrimaryContainer,
  );
}
