import 'dart:io';

import 'package:path_provider/path_provider.dart' deferred as path_provider;

Future<Directory> getPrivateClawApplicationSupportDirectory() async {
  final Directory? appleDirectory = _appleSandboxDirectory(
    relativePath: 'Library/Application Support',
  );
  if (appleDirectory != null) {
    return appleDirectory;
  }

  await path_provider.loadLibrary();
  return path_provider.getApplicationSupportDirectory();
}

Future<Directory> getPrivateClawTemporaryDirectory() async {
  final Directory? appleDirectory = _appleSandboxDirectory(relativePath: 'tmp');
  if (appleDirectory != null) {
    return appleDirectory;
  }

  await path_provider.loadLibrary();
  return path_provider.getTemporaryDirectory();
}

Directory? _appleSandboxDirectory({required String relativePath}) {
  if (!Platform.isIOS && !Platform.isMacOS) {
    return null;
  }

  final String? homeDirectory = Platform.environment['HOME'];
  if (homeDirectory == null || homeDirectory.isEmpty) {
    return null;
  }

  return Directory('$homeDirectory/$relativePath');
}
