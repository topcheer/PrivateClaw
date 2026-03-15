import 'dart:convert';
import 'dart:io';

import 'privateclaw_app_directories.dart';

const int _maxStoredNotifiedMessageIds = 200;

List<String> privateClawMergeNotifiedMessageIds({
  required Iterable<String> existingIds,
  required Iterable<String> newIds,
  int maxEntries = _maxStoredNotifiedMessageIds,
}) {
  final List<String> merged = <String>[];
  final Set<String> seen = <String>{};

  void append(String id) {
    final String normalizedId = id.trim();
    if (normalizedId.isEmpty) {
      return;
    }
    if (seen.contains(normalizedId)) {
      merged.remove(normalizedId);
    } else {
      seen.add(normalizedId);
    }
    merged.add(normalizedId);
  }

  for (final String id in existingIds) {
    append(id);
  }
  for (final String id in newIds) {
    append(id);
  }

  if (merged.length <= maxEntries) {
    return merged;
  }
  return merged.sublist(merged.length - maxEntries);
}

class PrivateClawNotifiedMessageRecord {
  const PrivateClawNotifiedMessageRecord({
    required this.sessionId,
    required this.messageIds,
    required this.savedAt,
  });

  final String sessionId;
  final List<String> messageIds;
  final DateTime savedAt;

  factory PrivateClawNotifiedMessageRecord.fromJson(Map<String, dynamic> json) {
    final Object? sessionId = json['sessionId'];
    final Object? messageIds = json['messageIds'];
    final Object? savedAt = json['savedAt'];
    if (sessionId is! String || messageIds is! List || savedAt is! String) {
      throw const FormatException(
        'Malformed PrivateClaw notified-message payload.',
      );
    }

    return PrivateClawNotifiedMessageRecord(
      sessionId: sessionId,
      messageIds: messageIds
          .whereType<String>()
          .map((String entry) => entry.trim())
          .where((String entry) => entry.isNotEmpty)
          .toList(growable: false),
      savedAt: DateTime.parse(savedAt).toUtc(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'sessionId': sessionId,
      'messageIds': messageIds,
      'savedAt': savedAt.toUtc().toIso8601String(),
    };
  }
}

class PrivateClawNotifiedMessageStore {
  const PrivateClawNotifiedMessageStore();

  static const String _fileName = 'privateclaw_notified_messages.json';

  Future<PrivateClawNotifiedMessageRecord?> load() async {
    final File file = await _storeFile();
    if (!await file.exists()) {
      return null;
    }
    final Map<String, dynamic> payload =
        jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    return PrivateClawNotifiedMessageRecord.fromJson(payload);
  }

  Future<void> remember({
    required String sessionId,
    required Iterable<String> messageIds,
  }) async {
    final List<String> normalizedNewIds = messageIds
        .map((String entry) => entry.trim())
        .where((String entry) => entry.isNotEmpty)
        .toList(growable: false);
    if (normalizedNewIds.isEmpty) {
      return;
    }

    final PrivateClawNotifiedMessageRecord? existing = await load();
    final List<String> mergedIds = privateClawMergeNotifiedMessageIds(
      existingIds: existing?.sessionId == sessionId
          ? existing!.messageIds
          : const <String>[],
      newIds: normalizedNewIds,
    );
    final File file = await _storeFile();
    await file.parent.create(recursive: true);
    final PrivateClawNotifiedMessageRecord record =
        PrivateClawNotifiedMessageRecord(
          sessionId: sessionId,
          messageIds: mergedIds,
          savedAt: DateTime.now().toUtc(),
        );
    await file.writeAsString(jsonEncode(record.toJson()));
  }

  Future<void> clear({String? sessionId}) async {
    final File file = await _storeFile();
    if (!await file.exists()) {
      return;
    }
    if (sessionId != null) {
      final PrivateClawNotifiedMessageRecord record =
          PrivateClawNotifiedMessageRecord.fromJson(
            jsonDecode(await file.readAsString()) as Map<String, dynamic>,
          );
      if (record.sessionId != sessionId) {
        return;
      }
    }
    await file.delete();
  }

  Future<File> _storeFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }
}
