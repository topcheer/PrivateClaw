import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../models/privateclaw_identity.dart';
import 'privateclaw_app_directories.dart';

class PrivateClawIdentityStore {
  const PrivateClawIdentityStore();

  static const String _fileName = 'privateclaw_identity.json';

  Future<PrivateClawIdentity> loadOrCreate() async {
    final File file = await _identityFile();
    if (await file.exists()) {
      final Map<String, dynamic> payload =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      return PrivateClawIdentity.fromJson(payload);
    }

    final PrivateClawIdentity identity = PrivateClawIdentity(
      appId: _generateAppId(),
      createdAt: DateTime.now().toUtc(),
    );
    await save(identity);
    return identity;
  }

  Future<void> save(PrivateClawIdentity identity) async {
    final File file = await _identityFile();
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode(identity.toJson()));
  }

  Future<File> _identityFile() async {
    final Directory directory =
        await getPrivateClawApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }

  String _generateAppId() {
    final Random random = Random.secure();
    final StringBuffer buffer = StringBuffer();
    for (int index = 0; index < 4; index += 1) {
      if (index > 0) {
        buffer.write('-');
      }
      buffer.write(_hex(random.nextInt(0x10000), 4));
    }
    return 'pc-${buffer.toString()}';
  }

  String _hex(int value, int width) {
    return value.toRadixString(16).padLeft(width, '0');
  }
}
