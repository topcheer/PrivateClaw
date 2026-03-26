import 'package:flutter/services.dart';

class PrivateClawLocalNotifications {
  const PrivateClawLocalNotifications();

  static const MethodChannel _channel = MethodChannel(
    'gg.ai.privateclaw/local_notifications',
  );

  Future<bool> requestPermission() async {
    final bool? granted = await _channel.invokeMethod<bool>('requestPermission');
    return granted == true;
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
    required String channelId,
    required String channelName,
    String? channelDescription,
    String? payload,
  }) async {
    await _channel.invokeMethod<void>('show', <String, Object?>{
      'id': id,
      'title': title,
      'body': body,
      'channelId': channelId,
      'channelName': channelName,
      'channelDescription': channelDescription,
      'payload': payload,
    });
  }
}
