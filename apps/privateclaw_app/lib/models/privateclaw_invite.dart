import 'dart:convert';

const String defaultPrivateClawRelayHost = 'relay.privateclaw.us';

class PrivateClawInvite {
  const PrivateClawInvite({
    required this.version,
    required this.sessionId,
    required this.sessionKey,
    required this.appWsUrl,
    required this.expiresAt,
    this.groupMode = false,
    this.providerLabel,
    this.relayLabel,
  });

  final int version;
  final String sessionId;
  final String sessionKey;
  final String appWsUrl;
  final DateTime expiresAt;
  final bool groupMode;
  final String? providerLabel;
  final String? relayLabel;

  factory PrivateClawInvite.fromJson(Map<String, dynamic> json) {
    if (json['version'] != 1) {
      throw const FormatException('Unsupported PrivateClaw invite version.');
    }

    final sessionId = json['sessionId'];
    final sessionKey = json['sessionKey'];
    final appWsUrl = json['appWsUrl'];
    final expiresAt = json['expiresAt'];
    if (sessionId is! String ||
        sessionKey is! String ||
        appWsUrl is! String ||
        expiresAt is! String) {
      throw const FormatException('Malformed PrivateClaw invite payload.');
    }

    return PrivateClawInvite(
      version: json['version'] as int,
      sessionId: sessionId,
      sessionKey: sessionKey,
      appWsUrl: appWsUrl,
      expiresAt: DateTime.parse(expiresAt).toUtc(),
      groupMode: json['groupMode'] as bool? ?? false,
      providerLabel: json['providerLabel'] as String?,
      relayLabel: json['relayLabel'] as String?,
    );
  }

  factory PrivateClawInvite.fromScan(String rawInput) {
    final input = rawInput.trim();
    if (input.isEmpty) {
      throw const FormatException('Invite string cannot be empty.');
    }

    final Match? embeddedInviteMatch = RegExp(
      r'privateclaw://connect\?payload=[A-Za-z0-9_-]+',
    ).firstMatch(input);
    if (embeddedInviteMatch != null) {
      final String embeddedInvite = embeddedInviteMatch.group(0)!;
      if (embeddedInvite != input) {
        return PrivateClawInvite.fromScan(embeddedInvite);
      }
    }

    if (input.startsWith('privateclaw://connect')) {
      final uri = Uri.parse(input);
      final payload = uri.queryParameters['payload'];
      if (payload == null || payload.isEmpty) {
        throw const FormatException(
          'Invite URI is missing the payload parameter.',
        );
      }
      return PrivateClawInvite._fromPayload(payload);
    }

    if (input.startsWith('{')) {
      return PrivateClawInvite.fromJson(
        jsonDecode(input) as Map<String, dynamic>,
      );
    }

    return PrivateClawInvite._fromPayload(input);
  }

  static PrivateClawInvite _fromPayload(String payload) {
    final bytes = base64Url.decode(base64Url.normalize(payload));
    final decoded = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    return PrivateClawInvite.fromJson(decoded);
  }

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'sessionId': sessionId,
      'sessionKey': sessionKey,
      'appWsUrl': appWsUrl,
      'expiresAt': expiresAt.toUtc().toIso8601String(),
      if (groupMode) 'groupMode': true,
      if (providerLabel != null) 'providerLabel': providerLabel,
      if (relayLabel != null) 'relayLabel': relayLabel,
    };
  }

  PrivateClawInvite copyWith({
    int? version,
    String? sessionId,
    String? sessionKey,
    String? appWsUrl,
    DateTime? expiresAt,
    bool? groupMode,
    Object? providerLabel = _noValue,
    Object? relayLabel = _noValue,
  }) {
    return PrivateClawInvite(
      version: version ?? this.version,
      sessionId: sessionId ?? this.sessionId,
      sessionKey: sessionKey ?? this.sessionKey,
      appWsUrl: appWsUrl ?? this.appWsUrl,
      expiresAt: expiresAt ?? this.expiresAt,
      groupMode: groupMode ?? this.groupMode,
      providerLabel: identical(providerLabel, _noValue)
          ? this.providerLabel
          : providerLabel as String?,
      relayLabel: identical(relayLabel, _noValue)
          ? this.relayLabel
          : relayLabel as String?,
    );
  }

  String? get relayDisplayLabel {
    final String? explicitLabel = relayLabel?.trim();
    if (explicitLabel != null && explicitLabel.isNotEmpty) {
      return explicitLabel;
    }
    final Uri? relayUri = _tryParseRelayUri(appWsUrl);
    if (relayUri == null || relayUri.host.isEmpty) {
      return null;
    }
    final bool useDefaultPort =
        relayUri.port == 0 ||
        (relayUri.scheme == 'wss' && relayUri.port == 443) ||
        (relayUri.scheme == 'ws' && relayUri.port == 80);
    return useDefaultPort ? relayUri.host : '${relayUri.host}:${relayUri.port}';
  }

  bool get usesDefaultRelay {
    final Uri? relayUri = _tryParseRelayUri(appWsUrl);
    if (relayUri != null && relayUri.host.isNotEmpty) {
      final bool usesDefaultPort =
          relayUri.port == 0 ||
          (relayUri.scheme == 'wss' && relayUri.port == 443) ||
          (relayUri.scheme == 'ws' && relayUri.port == 80);
      return relayUri.host == defaultPrivateClawRelayHost && usesDefaultPort;
    }
    return relayDisplayLabel == defaultPrivateClawRelayHost;
  }

  bool get usesNonDefaultRelay => !usesDefaultRelay;
}

String encodePrivateClawInviteUri(PrivateClawInvite invite) {
  final String payload = base64UrlEncode(
    utf8.encode(jsonEncode(invite.toJson())),
  ).replaceAll('=', '');
  return 'privateclaw://connect?payload=$payload';
}

const Object _noValue = Object();

Uri? _tryParseRelayUri(String rawUrl) {
  try {
    return Uri.parse(rawUrl);
  } catch (_) {
    return null;
  }
}
