import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

enum EmojiPickerTab { frequent, defaults }

class CommonEmojiSheet extends StatelessWidget {
  const CommonEmojiSheet({
    required this.frequentEmojis,
    required this.defaultEmojis,
    required this.selectedTab,
    required this.onTabChanged,
    required this.onSelected,
    super.key,
  });

  final List<String> frequentEmojis;
  final List<String> defaultEmojis;
  final EmojiPickerTab selectedTab;
  final ValueChanged<EmojiPickerTab> onTabChanged;
  final ValueChanged<String> onSelected;

  List<String> get _visibleEmojis =>
      selectedTab == EmojiPickerTab.frequent ? frequentEmojis : defaultEmojis;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Text(l10n.emojiPickerTitle, style: theme.textTheme.titleMedium),
                const SizedBox(width: 12),
                ChoiceChip(
                  label: Text(l10n.emojiPickerFrequentTab),
                  selected: selectedTab == EmojiPickerTab.frequent,
                  onSelected: (_) {
                    onTabChanged(EmojiPickerTab.frequent);
                  },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.emojiPickerDefaultTab),
                  selected: selectedTab == EmojiPickerTab.defaults,
                  onSelected: (_) {
                    onTabChanged(EmojiPickerTab.defaults);
                  },
                ),
              ],
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _visibleEmojis
                    .map(
                      (String emoji) => TextButton(
                        onPressed: () => onSelected(emoji),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(48, 48),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                        child: Text(
                          emoji,
                          style: theme.textTheme.headlineSmall,
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
