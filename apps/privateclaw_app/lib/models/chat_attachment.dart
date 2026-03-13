import 'dart:convert';
import 'dart:typed_data';

class ChatAttachment {
  const ChatAttachment({
    required this.id,
    required this.name,
    required this.mimeType,
    required this.sizeBytes,
    this.dataBase64,
    this.uri,
  });

  final String id;
  final String name;
  final String mimeType;
  final int sizeBytes;
  final String? dataBase64;
  final String? uri;

  bool get hasInlineData => (dataBase64 ?? '').isNotEmpty;
  bool get hasRemoteUri => (uri ?? '').isNotEmpty;
  bool get isImage => mimeType.startsWith('image/');
  bool get isAudio => mimeType.startsWith('audio/');
  bool get isVideo => mimeType.startsWith('video/');

  Uint8List? decodeBytes() {
    final String? encoded = dataBase64;
    if (encoded == null || encoded.isEmpty) {
      return null;
    }

    try {
      return base64Decode(encoded);
    } catch (_) {
      return null;
    }
  }

  Map<String, Object?> toPayload() {
    return <String, Object?>{
      'id': id,
      'name': name,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
      if (dataBase64 != null && dataBase64!.isNotEmpty) 'dataBase64': dataBase64,
      if (uri != null && uri!.isNotEmpty) 'uri': uri,
    };
  }

  factory ChatAttachment.fromPayload(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Attachment payload must be a JSON object.');
    }

    final Object? id = value['id'];
    final Object? name = value['name'];
    final Object? mimeType = value['mimeType'];
    final Object? sizeBytes = value['sizeBytes'];
    if (id is! String ||
        id.isEmpty ||
        name is! String ||
        name.isEmpty ||
        mimeType is! String ||
        mimeType.isEmpty ||
        sizeBytes is! num) {
      throw const FormatException('Attachment payload is missing required fields.');
    }

    return ChatAttachment(
      id: id,
      name: name,
      mimeType: mimeType,
      sizeBytes: sizeBytes.toInt(),
      dataBase64: value['dataBase64'] as String?,
      uri: value['uri'] as String?,
    );
  }
}
