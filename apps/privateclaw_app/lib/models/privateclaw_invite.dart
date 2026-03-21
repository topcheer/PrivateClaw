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

    if (input.startsWith('{')) {
      return PrivateClawInvite.fromJson(
        jsonDecode(input) as Map<String, dynamic>,
      );
    }

    final String? directPayload = _payloadFromInviteUri(input);
    if (directPayload != null) {
      return PrivateClawInvite._fromPayload(directPayload);
    }

    final PrivateClawInvite? embeddedInvite = _tryParseEmbeddedInvite(input);
    if (embeddedInvite != null) {
      return embeddedInvite;
    }

    if (input.startsWith('privateclaw://connect')) {
      throw const FormatException(
        'Invite URI is missing the payload parameter.',
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
final RegExp _embeddedInviteUriPattern = RegExp(
  r'privateclaw://connect\?[^\s<>"`]+',
  caseSensitive: false,
);
final RegExp _trailingInvitePunctuationPattern = RegExp(
  r"""[\)\]\}>"'.,;:!?，。；：！？、]+$""",
);

PrivateClawInvite? _tryParseEmbeddedInvite(String input) {
  for (final Match match in _embeddedInviteUriPattern.allMatches(input)) {
    final String candidate = match
        .group(0)!
        .replaceFirst(_trailingInvitePunctuationPattern, '');
    final String? payload = _payloadFromInviteUri(candidate);
    if (payload == null) {
      continue;
    }
    try {
      return PrivateClawInvite._fromPayload(payload);
    } on FormatException {
      continue;
    }
  }
  return null;
}

String? _payloadFromInviteUri(String rawInput) {
  final Uri? uri = Uri.tryParse(rawInput);
  if (uri == null ||
      uri.scheme.toLowerCase() != 'privateclaw' ||
      uri.host.toLowerCase() != 'connect') {
    return null;
  }
  final String? payload = uri.queryParameters['payload'];
  if (payload == null || payload.isEmpty) {
    return null;
  }
  return payload;
}

Uri? _tryParseRelayUri(String rawUrl) {
  try {
    return Uri.parse(rawUrl);
  } catch (_) {
    return null;
  }
}
