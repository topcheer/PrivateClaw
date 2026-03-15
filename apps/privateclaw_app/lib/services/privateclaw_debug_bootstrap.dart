import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/privateclaw_identity.dart';
import '../models/privateclaw_invite.dart';

const String _privateClawBootstrapPayloadEnv = 'PRIVATECLAW_BOOTSTRAP_PAYLOAD';
const String _privateClawBootstrapPayloadDefine = String.fromEnvironment(
  _privateClawBootstrapPayloadEnv,
);

class PrivateClawDebugBootstrapData {
  const PrivateClawDebugBootstrapData({required this.invite, this.identity});

  final PrivateClawInvite invite;
  final PrivateClawIdentity? identity;
}

PrivateClawDebugBootstrapData? loadPrivateClawDebugBootstrapFromEnvironment({
  Map<String, String>? environment,
}) {
  if (kReleaseMode) {
    return null;
  }

  final String? payload =
      (_privateClawBootstrapPayloadDefine.isNotEmpty
              ? _privateClawBootstrapPayloadDefine
              : (environment ??
                    Platform.environment)[_privateClawBootstrapPayloadEnv])
          ?.trim();
  if (payload == null || payload.isEmpty) {
    return null;
  }

  return parsePrivateClawDebugBootstrapPayload(payload);
}

PrivateClawDebugBootstrapData parsePrivateClawDebugBootstrapPayload(
  String payload,
) {
  final Object? decoded = jsonDecode(
    utf8.decode(_decodeBase64UrlPayload(payload.trim())),
  );
  if (decoded is! Map) {
    throw const FormatException(
      'Malformed PrivateClaw debug bootstrap payload.',
    );
  }

  final Map<String, dynamic> json = Map<String, dynamic>.from(decoded);
  final Object? inviteUri = json['inviteUri'];
  if (inviteUri is! String || inviteUri.trim().isEmpty) {
    throw const FormatException(
      'PrivateClaw debug bootstrap payload must include a non-empty inviteUri.',
    );
  }

  final Object? identityJson = json['identity'];
  final PrivateClawIdentity? identity;
  if (identityJson == null) {
    identity = null;
  } else if (identityJson is Map) {
    identity = PrivateClawIdentity.fromJson(
      Map<String, dynamic>.from(identityJson),
    );
  } else {
    throw const FormatException(
      'PrivateClaw debug bootstrap identity must be a JSON object.',
    );
  }

  return PrivateClawDebugBootstrapData(
    invite: PrivateClawInvite.fromScan(inviteUri.trim()),
    identity: identity,
  );
}

List<int> _decodeBase64UrlPayload(String value) {
  final String normalized = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padRight((value.length + 3) & ~3, '=');
  return base64Decode(normalized);
}
