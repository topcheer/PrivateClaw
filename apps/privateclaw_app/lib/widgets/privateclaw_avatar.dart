import 'package:flutter/material.dart';

const String privateClawAppIconAsset =
    'assets/branding/privateclaw_app_icon.png';

enum PrivateClawAvatarKind { generated, assistant }

class PrivateClawAvatar extends StatelessWidget {
  const PrivateClawAvatar.generated({
    required this.seedId,
    this.label,
    this.radius = 18,
    this.semanticLabel,
    super.key,
  }) : kind = PrivateClawAvatarKind.generated,
       assert(seedId != null);

  const PrivateClawAvatar.assistant({
    this.radius = 18,
    this.semanticLabel,
    super.key,
  }) : kind = PrivateClawAvatarKind.assistant,
       seedId = null,
       label = null;

  final PrivateClawAvatarKind kind;
  final String? seedId;
  final String? label;
  final double radius;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final Widget avatar = switch (kind) {
      PrivateClawAvatarKind.generated => _GeneratedPrivateClawAvatar(
        seedId: seedId!,
        label: label,
        radius: radius,
      ),
      PrivateClawAvatarKind.assistant => _AssistantPrivateClawAvatar(
        radius: radius,
      ),
    };

    if (semanticLabel == null || semanticLabel!.trim().isEmpty) {
      return avatar;
    }

    return Semantics(image: true, label: semanticLabel, child: avatar);
  }
}

String buildPrivateClawAvatarMonogram({required String seedId, String? label}) {
  final String trimmedLabel = label?.trim() ?? '';
  if (trimmedLabel.isNotEmpty) {
    final List<String> words = trimmedLabel
        .split(RegExp(r'\s+'))
        .where((String part) => part.isNotEmpty)
        .toList(growable: false);
    if (words.length >= 2) {
      return (_firstRune(words.first) + _firstRune(words.last)).toUpperCase();
    }

    final List<String> labelRunes = _stringRunes(trimmedLabel);
    if (labelRunes.length >= 2) {
      return (labelRunes[0] + labelRunes[1]).toUpperCase();
    }
    return labelRunes.first.toUpperCase();
  }

  final List<String> alphaNumericSeedRunes = _stringRunes(
    seedId,
  ).where(_isAsciiAlphaNumeric).toList(growable: false);
  if (alphaNumericSeedRunes.isNotEmpty) {
    return alphaNumericSeedRunes.take(2).join().toUpperCase();
  }

  final List<String> fallbackSeedRunes = _stringRunes(seedId);
  if (fallbackSeedRunes.isNotEmpty) {
    return fallbackSeedRunes.take(2).join().toUpperCase();
  }

  return 'PC';
}

class _GeneratedPrivateClawAvatar extends StatelessWidget {
  const _GeneratedPrivateClawAvatar({
    required this.seedId,
    required this.radius,
    this.label,
  });

  final String seedId;
  final String? label;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final _AvatarPalette palette = _resolveAvatarPalette(context, seedId);
    final String monogram = buildPrivateClawAvatarMonogram(
      seedId: seedId,
      label: label,
    );

    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: palette.background,
      ),
      alignment: Alignment.center,
      child: Padding(
        padding: EdgeInsets.all(radius * 0.22),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            monogram,
            maxLines: 1,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: palette.foreground,
              fontWeight: FontWeight.w700,
              height: 1,
            ),
          ),
        ),
      ),
    );
  }
}

class _AssistantPrivateClawAvatar extends StatelessWidget {
  const _AssistantPrivateClawAvatar({required this.radius});

  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
      ),
      clipBehavior: Clip.antiAlias,
      child: Image.asset(privateClawAppIconAsset, fit: BoxFit.cover),
    );
  }
}

class _AvatarPalette {
  const _AvatarPalette({required this.background, required this.foreground});

  final Color background;
  final Color foreground;
}

_AvatarPalette _resolveAvatarPalette(BuildContext context, String seedId) {
  final Brightness brightness = Theme.of(context).brightness;
  final int hash = _stableHash(seedId);
  final double hue = (hash % 360).toDouble();
  final double saturation = brightness == Brightness.dark ? 0.52 : 0.46;
  final double lightness = brightness == Brightness.dark ? 0.42 : 0.72;
  final Color background = HSLColor.fromAHSL(
    1,
    hue,
    saturation,
    lightness,
  ).toColor();
  final Color foreground = background.computeLuminance() > 0.45
      ? Colors.black87
      : Colors.white;
  return _AvatarPalette(background: background, foreground: foreground);
}

int _stableHash(String value) {
  int hash = 0x811c9dc5;
  for (final int codeUnit in value.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0x7fffffff;
  }
  return hash;
}

List<String> _stringRunes(String value) {
  return value.runes
      .map((int rune) => String.fromCharCode(rune))
      .toList(growable: false);
}

String _firstRune(String value) {
  return _stringRunes(value).first;
}

bool _isAsciiAlphaNumeric(String value) {
  final int codeUnit = value.codeUnitAt(0);
  return (codeUnit >= 48 && codeUnit <= 57) ||
      (codeUnit >= 65 && codeUnit <= 90) ||
      (codeUnit >= 97 && codeUnit <= 122);
}
