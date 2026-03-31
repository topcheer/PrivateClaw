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

class PrivateClawSavedSessionsState {
  const PrivateClawSavedSessionsState({
    required this.records,
    this.currentSessionId,
  });

  static const int stateVersion = 2;

  final List<PrivateClawActiveSessionRecord> records;
  final String? currentSessionId;

  factory PrivateClawSavedSessionsState.fromJson(Map<String, dynamic> json) {
    final Object? version = json['version'];
    final Object? sessions = json['sessions'];
    final Object? currentSessionId = json['currentSessionId'];
    if (version != stateVersion ||
        sessions is! List<Object?> ||
        (currentSessionId != null && currentSessionId is! String)) {
      throw const FormatException(
        'Malformed PrivateClaw saved sessions payload.',
      );
    }

    final List<PrivateClawActiveSessionRecord> records =
        <PrivateClawActiveSessionRecord>[
          for (final Object? session in sessions)
            if (session is Map<String, dynamic>)
              PrivateClawActiveSessionRecord.fromJson(session)
            else
              throw const FormatException(
                'Malformed PrivateClaw saved sessions payload.',
              ),
        ];

    return PrivateClawSavedSessionsState(
      records: records,
      currentSessionId: currentSessionId as String?,
    );
  }

  factory PrivateClawSavedSessionsState.fromLegacyRecord(
    PrivateClawActiveSessionRecord record,
  ) {
    return PrivateClawSavedSessionsState(
      records: <PrivateClawActiveSessionRecord>[record],
      currentSessionId: record.invite.sessionId,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'version': stateVersion,
      if (currentSessionId != null) 'currentSessionId': currentSessionId,
      'sessions': records
          .map((PrivateClawActiveSessionRecord record) => record.toJson())
          .toList(growable: false),
    };
  }

  PrivateClawSavedSessionsState copyWith({
    List<PrivateClawActiveSessionRecord>? records,
    Object? currentSessionId = _noValue,
  }) {
    return PrivateClawSavedSessionsState(
      records: records ?? this.records,
      currentSessionId: identical(currentSessionId, _noValue)
          ? this.currentSessionId
          : currentSessionId as String?,
    );
  }
}

class PrivateClawActiveSessionStore {
  const PrivateClawActiveSessionStore();

  static const String _fileName = 'privateclaw_active_session.json';

  Future<PrivateClawActiveSessionRecord?> load() async {
    final PrivateClawSavedSessionsState state = await _loadState();
    final String? currentSessionId = state.currentSessionId;
    if (currentSessionId == null) {
      return null;
    }
    for (final PrivateClawActiveSessionRecord record in state.records) {
      if (record.invite.sessionId == currentSessionId) {
        return record;
      }
    }
    return null;
  }

  Future<List<PrivateClawActiveSessionRecord>> loadAll() async {
    final PrivateClawSavedSessionsState state = await _loadState();
    return List<PrivateClawActiveSessionRecord>.unmodifiable(state.records);
  }

  Future<void> save({
    required PrivateClawInvite invite,
    required PrivateClawIdentity identity,
  }) async {
    final PrivateClawActiveSessionRecord record =
        PrivateClawActiveSessionRecord(
          invite: invite,
          identity: identity,
          savedAt: DateTime.now().toUtc(),
        );
    final PrivateClawSavedSessionsState state = await _loadState();
    final List<PrivateClawActiveSessionRecord> nextRecords =
        state.records
            .where(
              (PrivateClawActiveSessionRecord existing) =>
                  existing.invite.sessionId != invite.sessionId,
            )
            .toList(growable: true)
          ..add(record);
    await _writeState(
      state.copyWith(records: nextRecords, currentSessionId: invite.sessionId),
    );
  }

  Future<void> clear() async {
    await clearAll();
  }

  Future<void> clearAll() async {
    final File file = await _sessionFile();
    if (await file.exists()) {
      await file.delete();
    }
  }

  Future<void> clearCurrent() async {
    final PrivateClawSavedSessionsState state = await _loadState();
    if (state.currentSessionId == null) {
      return;
    }
    await _writeState(state.copyWith(currentSessionId: null));
  }

  Future<void> setCurrent(String? sessionId) async {
    final PrivateClawSavedSessionsState state = await _loadState();
    if (sessionId != null &&
        !state.records.any(
          (PrivateClawActiveSessionRecord record) =>
              record.invite.sessionId == sessionId,
        )) {
      return;
    }
    await _writeState(state.copyWith(currentSessionId: sessionId));
  }

  Future<void> remove(String sessionId) async {
    final PrivateClawSavedSessionsState state = await _loadState();
    final List<PrivateClawActiveSessionRecord> nextRecords = state.records
        .where(
          (PrivateClawActiveSessionRecord record) =>
              record.invite.sessionId != sessionId,
        )
        .toList(growable: false);
    final String? nextCurrentSessionId = state.currentSessionId == sessionId
        ? null
        : state.currentSessionId;
    if (nextRecords.isEmpty) {
      await clearAll();
      return;
    }
    await _writeState(
      state.copyWith(
        records: nextRecords,
        currentSessionId: nextCurrentSessionId,
      ),
    );
  }

  Future<File> _sessionFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }

  Future<PrivateClawSavedSessionsState> _loadState() async {
    final File file = await _sessionFile();
    if (!await file.exists()) {
      return const PrivateClawSavedSessionsState(
        records: <PrivateClawActiveSessionRecord>[],
      );
    }

    final Object? decoded = jsonDecode(await file.readAsString());
    final PrivateClawSavedSessionsState normalizedState = _normalizeState(
      switch (decoded) {
        final Map<String, dynamic> payload
            when payload['version'] ==
                PrivateClawSavedSessionsState.stateVersion =>
          PrivateClawSavedSessionsState.fromJson(payload),
        final Map<String, dynamic> payload =>
          PrivateClawSavedSessionsState.fromLegacyRecord(
            PrivateClawActiveSessionRecord.fromJson(payload),
          ),
        _ => throw const FormatException(
          'Malformed PrivateClaw saved sessions payload.',
        ),
      },
    );
    await _writeState(normalizedState);
    return normalizedState;
  }

  Future<void> _writeState(PrivateClawSavedSessionsState state) async {
    final File file = await _sessionFile();
    await file.parent.create(recursive: true);
    final PrivateClawSavedSessionsState normalizedState = _normalizeState(
      state,
    );
    if (normalizedState.records.isEmpty) {
      if (await file.exists()) {
        await file.delete();
      }
      return;
    }
    await file.writeAsString(jsonEncode(normalizedState.toJson()));
  }

  PrivateClawSavedSessionsState _normalizeState(
    PrivateClawSavedSessionsState state,
  ) {
    final DateTime now = DateTime.now().toUtc();
    final Map<String, PrivateClawActiveSessionRecord> dedupedRecords =
        <String, PrivateClawActiveSessionRecord>{};
    for (final PrivateClawActiveSessionRecord record in state.records) {
      if (!record.invite.expiresAt.isAfter(now)) {
        continue;
      }
      final String sessionId = record.invite.sessionId;
      final PrivateClawActiveSessionRecord? existing =
          dedupedRecords[sessionId];
      if (existing == null || existing.savedAt.isBefore(record.savedAt)) {
        dedupedRecords[sessionId] = record;
      }
    }
    final List<PrivateClawActiveSessionRecord> sortedRecords =
        dedupedRecords.values.toList(growable: false)..sort(
          (
            PrivateClawActiveSessionRecord left,
            PrivateClawActiveSessionRecord right,
          ) => right.savedAt.compareTo(left.savedAt),
        );
    final String? currentSessionId = state.currentSessionId;
    final bool hasCurrentSession =
        currentSessionId != null &&
        sortedRecords.any(
          (PrivateClawActiveSessionRecord record) =>
              record.invite.sessionId == currentSessionId,
        );
    return PrivateClawSavedSessionsState(
      records: sortedRecords,
      currentSessionId: hasCurrentSession ? currentSessionId : null,
    );
  }
}

const Object _noValue = Object();
