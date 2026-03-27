import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PrivateClawComposerSubmitShortcuts extends StatelessWidget {
  const PrivateClawComposerSubmitShortcuts({
    required this.enabled,
    required this.onSubmit,
    required this.child,
    super.key,
  });

  final bool enabled;
  final VoidCallback onSubmit;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) {
      return child;
    }

    return CallbackShortcuts(
      bindings: <ShortcutActivator, VoidCallback>{
        const SingleActivator(LogicalKeyboardKey.enter, control: true):
            onSubmit,
        const SingleActivator(LogicalKeyboardKey.numpadEnter, control: true):
            onSubmit,
      },
      child: child,
    );
  }
}
