class PrivateClawIdentity {
  const PrivateClawIdentity({
    required this.appId,
    required this.createdAt,
    this.displayName,
  });

  final String appId;
  final DateTime createdAt;
  final String? displayName;

  factory PrivateClawIdentity.fromJson(Map<String, dynamic> json) {
    final Object? appId = json['appId'];
    final Object? createdAt = json['createdAt'];
    if (appId is! String || createdAt is! String) {
      throw const FormatException('Malformed PrivateClaw identity payload.');
    }

    return PrivateClawIdentity(
      appId: appId,
      createdAt: DateTime.parse(createdAt).toUtc(),
      displayName: json['displayName'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'appId': appId,
      'createdAt': createdAt.toUtc().toIso8601String(),
      if (displayName != null) 'displayName': displayName,
    };
  }

  PrivateClawIdentity copyWith({
    String? appId,
    DateTime? createdAt,
    Object? displayName = _noValue,
  }) {
    return PrivateClawIdentity(
      appId: appId ?? this.appId,
      createdAt: createdAt ?? this.createdAt,
      displayName: identical(displayName, _noValue)
          ? this.displayName
          : displayName as String?,
    );
  }
}

const Object _noValue = Object();
