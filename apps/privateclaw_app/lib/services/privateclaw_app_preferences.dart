import 'dart:convert';
import 'dart:io';

import 'privateclaw_app_directories.dart';

/// Small persisted flags for the app shell (one JSON file in the app support
/// directory), e.g. "the notification explainer has been shown once".
class PrivateClawAppPreferences {
  const PrivateClawAppPreferences();

  static const String _fileName = 'privateclaw_preferences.json';

  static const String notificationExplainerShownKey =
      'notification_explainer_shown';

  Future<Map<String, dynamic>> _load() async {
    final File file = await _preferencesFile();
    if (!await file.exists()) {
      return <String, dynamic>{};
    }
    final Object? decoded = jsonDecode(await file.readAsString());
    if (decoded is! Map<String, dynamic>) {
      return <String, dynamic>{};
    }
    return decoded;
  }

  Future<bool> flag(String key) async {
    final Map<String, dynamic> preferences = await _load();
    return preferences[key] == true;
  }

  Future<void> setFlag(String key, bool value) async {
    final Map<String, dynamic> preferences = await _load();
    preferences[key] = value;
    final File file = await _preferencesFile();
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode(preferences));
  }

  Future<File> _preferencesFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }
}
