import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

import '../store_screenshot_preview.dart';

bool privateClawShouldSkipNotificationsInDebug({
  required bool debugSkipNotifications,
  required StoreScreenshotConfig screenshotConfig,
}) {
  return debugSkipNotifications || screenshotConfig.previewData != null;
}

bool privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.macOS ||
      platform == TargetPlatform.windows ||
      platform == TargetPlatform.linux;
}

bool privateClawShouldSuspendLiveSession({
  required TargetPlatform platform,
  required AppLifecycleState state,
}) {
  if (privateClawShouldKeepLiveSessionInBackgroundForTargetPlatform(platform)) {
    return false;
  }
  return state == AppLifecycleState.paused ||
      state == AppLifecycleState.hidden ||
      state == AppLifecycleState.detached;
}

bool privateClawShouldShowLocalNotificationForLifecycleState({
  required TargetPlatform platform,
  required AppLifecycleState state,
}) {
  return platform == TargetPlatform.macOS && state != AppLifecycleState.resumed;
}

bool privateClawSupportsVoiceRecordingForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.android ||
      platform == TargetPlatform.iOS ||
      platform == TargetPlatform.macOS ||
      platform == TargetPlatform.windows;
}

bool privateClawUsesTapToToggleVoiceRecordingForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.windows;
}

bool privateClawShouldAutoSendPickedAttachmentsForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.windows;
}

bool privateClawSupportsRecentPhotoTrayForTargetPlatform(
  TargetPlatform platform,
) {
  return platform == TargetPlatform.android || platform == TargetPlatform.iOS;
}

TargetPlatform Function() privateClawTargetPlatformResolver = () =>
    defaultTargetPlatform;
