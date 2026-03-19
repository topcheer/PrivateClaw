import 'dart:convert';
import 'dart:io';

import 'privateclaw_app_directories.dart';

class PrivateClawEmojiStore {
  const PrivateClawEmojiStore();

  static const String _fileName = 'privateclaw_emoji_usage.json';

  Future<Map<String, int>> load() async {
    final File file = await _emojiUsageFile();
    if (!await file.exists()) {
      return <String, int>{};
    }
    final Object? decoded = jsonDecode(await file.readAsString());
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Malformed PrivateClaw emoji usage payload.');
    }
    return decoded.map<String, int>((String key, dynamic value) {
      if (value is! num) {
        throw const FormatException('Malformed PrivateClaw emoji usage count.');
      }
      return MapEntry<String, int>(key, value.toInt());
    });
  }

  Future<Map<String, int>> increment(String emoji) async {
    final Map<String, int> usage = await load();
    usage[emoji] = (usage[emoji] ?? 0) + 1;
    await save(usage);
    return usage;
  }

  Future<void> save(Map<String, int> usage) async {
    final File file = await _emojiUsageFile();
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode(usage));
  }

  Future<File> _emojiUsageFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }
}
