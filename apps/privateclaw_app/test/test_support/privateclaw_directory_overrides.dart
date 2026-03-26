import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/services/privateclaw_app_directories.dart';

void installPrivateClawTestDirectoryOverrides() {
  final PrivateClawDirectoryProvider? originalApplicationSupportProvider =
      privateClawApplicationSupportDirectoryProvider;
  final PrivateClawDirectoryProvider? originalTemporaryProvider =
      privateClawTemporaryDirectoryProvider;
  final Directory directory = Directory.systemTemp.createTempSync(
    'privateclaw-test-',
  );

  privateClawApplicationSupportDirectoryProvider = () async => directory;
  privateClawTemporaryDirectoryProvider = () async => directory;

  addTearDown(() async {
    privateClawApplicationSupportDirectoryProvider =
        originalApplicationSupportProvider;
    privateClawTemporaryDirectoryProvider = originalTemporaryProvider;
    if (directory.existsSync()) {
      await directory.delete(recursive: true);
    }
  });
}
