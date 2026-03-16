import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/privateclaw_identity.dart';
import '../models/privateclaw_invite.dart';

const String _privateClawBootstrapPayloadEnv = 'PRIVATECLAW_BOOTSTRAP_PAYLOAD';
const String _privateClawBootstrapPayloadDefine = String.fromEnvironment(
  _privateClawBootstrapPayloadEnv,
);
const String _privateClawDebugInviteInputEnv = 'PRIVATECLAW_DEBUG_INVITE_INPUT';
const String _privateClawDebugInviteInputDefine = String.fromEnvironment(
  _privateClawDebugInviteInputEnv,
);
const String _privateClawDebugAcceptRelayWarningEnv =
    'PRIVATECLAW_DEBUG_ACCEPT_RELAY_WARNING';
const String _privateClawDebugAcceptRelayWarningDefine = String.fromEnvironment(
  _privateClawDebugAcceptRelayWarningEnv,
);
const String _privateClawDebugSkipNotificationsEnv =
    'PRIVATECLAW_DEBUG_SKIP_NOTIFICATIONS';
const String _privateClawDebugSkipNotificationsDefine = String.fromEnvironment(
  _privateClawDebugSkipNotificationsEnv,
);

class PrivateClawDebugBootstrapData {
  const PrivateClawDebugBootstrapData({required this.invite, this.identity});

  final PrivateClawInvite invite;
  final PrivateClawIdentity? identity;
}

class PrivateClawDebugPendingInviteData {
  const PrivateClawDebugPendingInviteData({
    required this.inviteInput,
    required this.autoApproveRelayWarning,
  });

  final String inviteInput;
  final bool autoApproveRelayWarning;
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

PrivateClawDebugPendingInviteData?
loadPrivateClawDebugPendingInviteFromEnvironment({
  Map<String, String>? environment,
}) {
  if (kReleaseMode) {
    return null;
  }

  final Map<String, String> resolvedEnvironment = environment ?? Platform.environment;
  final String? inviteInput =
      (_privateClawDebugInviteInputDefine.isNotEmpty
              ? _privateClawDebugInviteInputDefine
              : resolvedEnvironment[_privateClawDebugInviteInputEnv])
          ?.trim();
  if (inviteInput == null || inviteInput.isEmpty) {
    return null;
  }

  final String? autoApproveValue =
      (_privateClawDebugAcceptRelayWarningDefine.isNotEmpty
              ? _privateClawDebugAcceptRelayWarningDefine
              : resolvedEnvironment[_privateClawDebugAcceptRelayWarningEnv])
          ?.trim();
  return PrivateClawDebugPendingInviteData(
    inviteInput: inviteInput,
    autoApproveRelayWarning: _parseDebugBool(autoApproveValue),
  );
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

bool _parseDebugBool(String? value) {
  if (value == null || value.isEmpty) {
    return false;
  }
  final String normalized = value.trim().toLowerCase();
  return normalized == '1' ||
      normalized == 'true' ||
      normalized == 'yes' ||
      normalized == 'on';
}

bool loadPrivateClawDebugSkipNotificationsFromEnvironment({
  Map<String, String>? environment,
}) {
  if (kReleaseMode) {
    return false;
  }

  final Map<String, String> resolvedEnvironment = environment ?? Platform.environment;
  final String? rawValue =
      (_privateClawDebugSkipNotificationsDefine.isNotEmpty
              ? _privateClawDebugSkipNotificationsDefine
              : resolvedEnvironment[_privateClawDebugSkipNotificationsEnv])
          ?.trim();
  return _parseDebugBool(rawValue);
}
