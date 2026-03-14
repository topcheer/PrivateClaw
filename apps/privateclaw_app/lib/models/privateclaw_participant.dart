class PrivateClawParticipant {
  const PrivateClawParticipant({
    required this.appId,
    required this.displayName,
    required this.joinedAt,
    this.deviceLabel,
  });

  final String appId;
  final String displayName;
  final DateTime joinedAt;
  final String? deviceLabel;

  factory PrivateClawParticipant.fromJson(Map<String, dynamic> json) {
    final Object? appId = json['appId'];
    final Object? displayName = json['displayName'];
    final Object? joinedAt = json['joinedAt'];
    if (appId is! String || displayName is! String || joinedAt is! String) {
      throw const FormatException('Malformed PrivateClaw participant payload.');
    }

    return PrivateClawParticipant(
      appId: appId,
      displayName: displayName,
      joinedAt: DateTime.parse(joinedAt).toUtc(),
      deviceLabel: json['deviceLabel'] as String?,
    );
  }
}
