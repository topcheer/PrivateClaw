import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/models/privateclaw_identity.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_active_session_store.dart';
import 'package:privateclaw_app/services/privateclaw_app_directories.dart';

import 'test_support/privateclaw_directory_overrides.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'legacy single-session payload migrates to saved-session state',
    () async {
      installPrivateClawTestDirectoryOverrides();

      final DateTime now = DateTime.now().toUtc();
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'legacy-session',
        sessionKey: 'legacy-session-key',
        appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=legacy-session',
        expiresAt: now.add(const Duration(hours: 2)),
      );
      final PrivateClawIdentity identity = PrivateClawIdentity(
        appId: 'pc-legacy-session',
        createdAt: now.subtract(const Duration(minutes: 5)),
      );
      final PrivateClawActiveSessionRecord record =
          PrivateClawActiveSessionRecord(
            invite: invite,
            identity: identity,
            savedAt: now,
          );

      final Directory directory =
          await getPrivateClawApplicationSupportDirectory();
      final File file = File(
        '${directory.path}/privateclaw_active_session.json',
      );
      await file.parent.create(recursive: true);
      await file.writeAsString(jsonEncode(record.toJson()));

      final PrivateClawActiveSessionStore store =
          const PrivateClawActiveSessionStore();
      final PrivateClawActiveSessionRecord? loaded = await store.load();
      final List<PrivateClawActiveSessionRecord> allRecords = await store
          .loadAll();
      final Map<String, dynamic> migratedPayload =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;

      expect(loaded?.invite.sessionId, invite.sessionId);
      expect(loaded?.identity.appId, identity.appId);
      expect(allRecords, hasLength(1));
      expect(
        migratedPayload['version'],
        PrivateClawSavedSessionsState.stateVersion,
      );
      expect(migratedPayload['currentSessionId'], invite.sessionId);
      expect((migratedPayload['sessions'] as List<Object?>), hasLength(1));
    },
  );

  test('clearCurrent keeps history while remove forgets one session', () async {
    installPrivateClawTestDirectoryOverrides();

    final DateTime now = DateTime.now().toUtc();
    final PrivateClawIdentity identity = PrivateClawIdentity(
      appId: 'pc-history-store',
      createdAt: now.subtract(const Duration(minutes: 7)),
    );
    final PrivateClawInvite firstInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'history-one',
      sessionKey: 'history-one-key',
      appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=history-one',
      expiresAt: now.add(const Duration(hours: 1)),
    );
    final PrivateClawInvite secondInvite = PrivateClawInvite(
      version: 1,
      sessionId: 'history-two',
      sessionKey: 'history-two-key',
      appWsUrl: 'ws://relay.privateclaw.us/ws/app?sessionId=history-two',
      expiresAt: now.add(const Duration(hours: 2)),
    );

    final PrivateClawActiveSessionStore store =
        const PrivateClawActiveSessionStore();
    await store.save(invite: firstInvite, identity: identity);
    await store.save(invite: secondInvite, identity: identity);

    expect((await store.load())?.invite.sessionId, secondInvite.sessionId);
    expect(await store.loadAll(), hasLength(2));

    await store.clearCurrent();
    expect(await store.load(), isNull);
    expect(await store.loadAll(), hasLength(2));

    await store.setCurrent(firstInvite.sessionId);
    expect((await store.load())?.invite.sessionId, firstInvite.sessionId);

    await store.remove(firstInvite.sessionId);
    final List<PrivateClawActiveSessionRecord> remainingRecords = await store
        .loadAll();
    expect(remainingRecords, hasLength(1));
    expect(remainingRecords.single.invite.sessionId, secondInvite.sessionId);
    expect(await store.load(), isNull);
  });
}
