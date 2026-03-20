import 'package:flutter/services.dart';
import 'package:quick_actions/quick_actions.dart';

const String privateClawScanQrShortcutType = 'scan_qr';

typedef PrivateClawQuickActionHandler = void Function(String type);

class PrivateClawShortcutItem {
  const PrivateClawShortcutItem({
    required this.type,
    required this.localizedTitle,
    this.localizedSubtitle,
    this.icon,
  });

  final String type;
  final String localizedTitle;
  final String? localizedSubtitle;
  final String? icon;
}

abstract interface class PrivateClawQuickActions {
  Future<void> initialize(PrivateClawQuickActionHandler handler);

  Future<void> setShortcutItems(List<PrivateClawShortcutItem> items);

  Future<void> clearShortcutItems();
}

class SystemPrivateClawQuickActions implements PrivateClawQuickActions {
  const SystemPrivateClawQuickActions();

  static const QuickActions _quickActions = QuickActions();

  @override
  Future<void> initialize(PrivateClawQuickActionHandler handler) async {
    try {
      await _quickActions.initialize(handler);
    } on MissingPluginException {
      return;
    } on UnimplementedError {
      return;
    }
  }

  @override
  Future<void> setShortcutItems(List<PrivateClawShortcutItem> items) async {
    try {
      await _quickActions.setShortcutItems(
        items
            .map(
              (PrivateClawShortcutItem item) => ShortcutItem(
                type: item.type,
                localizedTitle: item.localizedTitle,
                localizedSubtitle: item.localizedSubtitle,
                icon: item.icon,
              ),
            )
            .toList(growable: false),
      );
    } on MissingPluginException {
      return;
    } on UnimplementedError {
      return;
    }
  }

  @override
  Future<void> clearShortcutItems() async {
    try {
      await _quickActions.clearShortcutItems();
    } on MissingPluginException {
      return;
    } on UnimplementedError {
      return;
    }
  }
}
