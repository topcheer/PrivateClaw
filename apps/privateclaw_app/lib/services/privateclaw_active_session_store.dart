import 'dart:convert';
import 'dart:io';

import '../models/privateclaw_identity.dart';
import '../models/privateclaw_invite.dart';
import 'privateclaw_app_directories.dart';

class PrivateClawActiveSessionRecord {
  const PrivateClawActiveSessionRecord({
    required this.invite,
    required this.identity,
    required this.savedAt,
  });

  final PrivateClawInvite invite;
  final PrivateClawIdentity identity;
  final DateTime savedAt;

  factory PrivateClawActiveSessionRecord.fromJson(Map<String, dynamic> json) {
    final Object? invite = json['invite'];
    final Object? identity = json['identity'];
    final Object? savedAt = json['savedAt'];
    if (invite is! Map<String, dynamic> ||
        identity is! Map<String, dynamic> ||
        savedAt is! String) {
      throw const FormatException(
        'Malformed PrivateClaw active session payload.',
      );
    }

    return PrivateClawActiveSessionRecord(
      invite: PrivateClawInvite.fromJson(invite),
      identity: PrivateClawIdentity.fromJson(identity),
      savedAt: DateTime.parse(savedAt).toUtc(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'invite': invite.toJson(),
      'identity': identity.toJson(),
      'savedAt': savedAt.toUtc().toIso8601String(),
    };
  }

  PrivateClawActiveSessionRecord copyWith({
    PrivateClawInvite? invite,
    PrivateClawIdentity? identity,
    DateTime? savedAt,
  }) {
    return PrivateClawActiveSessionRecord(
      invite: invite ?? this.invite,
      identity: identity ?? this.identity,
      savedAt: savedAt ?? this.savedAt,
    );
  }
}

class PrivateClawActiveSessionStore {
  const PrivateClawActiveSessionStore();

  static const String _fileName = 'privateclaw_active_session.json';

  Future<PrivateClawActiveSessionRecord?> load() async {
    final File file = await _sessionFile();
    if (!await file.exists()) {
      return null;
    }
    final Map<String, dynamic> payload =
        jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    return PrivateClawActiveSessionRecord.fromJson(payload);
  }

  Future<void> save({
    required PrivateClawInvite invite,
    required PrivateClawIdentity identity,
  }) async {
    final File file = await _sessionFile();
    await file.parent.create(recursive: true);
    final PrivateClawActiveSessionRecord record =
        PrivateClawActiveSessionRecord(
          invite: invite,
          identity: identity,
          savedAt: DateTime.now().toUtc(),
        );
    await file.writeAsString(jsonEncode(record.toJson()));
  }

  Future<void> clear() async {
    final File file = await _sessionFile();
    if (await file.exists()) {
      await file.delete();
    }
  }

  Future<File> _sessionFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }
}
