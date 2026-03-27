import 'package:flutter/material.dart';

import 'privateclaw_avatar.dart';

class PrivateClawAppBarIcon extends StatelessWidget {
  const PrivateClawAppBarIcon({super.key});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      key: const ValueKey<String>('app-bar-icon'),
      borderRadius: BorderRadius.circular(8),
      child: Image.asset(
        privateClawAppIconAsset,
        width: 28,
        height: 28,
        fit: BoxFit.cover,
      ),
    );
  }
}
