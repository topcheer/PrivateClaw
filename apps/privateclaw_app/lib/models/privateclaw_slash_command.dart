class PrivateClawSlashCommand {
  const PrivateClawSlashCommand({
    required this.slash,
    required this.description,
    required this.acceptsArgs,
    required this.source,
  });

  final String slash;
  final String description;
  final bool acceptsArgs;
  final String source;

  factory PrivateClawSlashCommand.fromPayload(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException(
        'PrivateClaw slash command payload must be a JSON object.',
      );
    }

    final Object? slash = value['slash'];
    final Object? description = value['description'];
    final Object? acceptsArgs = value['acceptsArgs'];
    final Object? source = value['source'];
    if (slash is! String ||
        slash.isEmpty ||
        description is! String ||
        description.isEmpty ||
        acceptsArgs is! bool ||
        source is! String ||
        source.isEmpty) {
      throw const FormatException(
        'PrivateClaw slash command payload is missing required fields.',
      );
    }

    return PrivateClawSlashCommand(
      slash: slash,
      description: description,
      acceptsArgs: acceptsArgs,
      source: source,
    );
  }
}
