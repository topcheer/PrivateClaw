import 'dart:io';

import 'package:firebase_core/firebase_core.dart';

const String _firebaseApiKey = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_API_KEY',
);
const String _firebaseAndroidApiKey = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_ANDROID_API_KEY',
);
const String _firebaseIosApiKey = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_IOS_API_KEY',
);
const String _firebaseProjectId = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_PROJECT_ID',
);
const String _firebaseMessagingSenderId = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_MESSAGING_SENDER_ID',
);
const String _firebaseAndroidAppId = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_ANDROID_APP_ID',
);
const String _firebaseIosAppId = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_IOS_APP_ID',
);
const String _firebaseStorageBucket = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_STORAGE_BUCKET',
);
const String _firebaseIosBundleId = String.fromEnvironment(
  'PRIVATECLAW_FIREBASE_IOS_BUNDLE_ID',
  defaultValue: 'gg.ai.privateclaw',
);

String? _normalizedEnvValue(String value) {
  final String normalized = value.trim();
  return normalized.isEmpty ? null : normalized;
}

String? get _resolvedAndroidApiKey =>
    _normalizedEnvValue(_firebaseAndroidApiKey) ??
    _normalizedEnvValue(_firebaseApiKey);

String? get _resolvedIosApiKey =>
    _normalizedEnvValue(_firebaseIosApiKey) ??
    _normalizedEnvValue(_firebaseApiKey);

bool privateClawSupportsFirebasePushOnCurrentPlatform() {
  return Platform.isAndroid || Platform.isIOS;
}

FirebaseOptions? privateClawFirebaseOptionsForCurrentPlatform() {
  final String? projectId = _normalizedEnvValue(_firebaseProjectId);
  final String? messagingSenderId = _normalizedEnvValue(
    _firebaseMessagingSenderId,
  );
  if (projectId == null || messagingSenderId == null) {
    return null;
  }

  if (Platform.isAndroid) {
    final String? apiKey = _resolvedAndroidApiKey;
    final String? appId = _normalizedEnvValue(_firebaseAndroidAppId);
    final String? storageBucket = _normalizedEnvValue(_firebaseStorageBucket);
    if (apiKey == null || appId == null) {
      return null;
    }
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      storageBucket: storageBucket,
    );
  }

  if (Platform.isIOS) {
    final String? apiKey = _resolvedIosApiKey;
    final String? appId = _normalizedEnvValue(_firebaseIosAppId);
    final String? storageBucket = _normalizedEnvValue(_firebaseStorageBucket);
    final String iosBundleId =
        _normalizedEnvValue(_firebaseIosBundleId) ?? 'gg.ai.privateclaw';
    if (apiKey == null || appId == null) {
      return null;
    }
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      storageBucket: storageBucket,
      iosBundleId: iosBundleId,
    );
  }

  return null;
}
