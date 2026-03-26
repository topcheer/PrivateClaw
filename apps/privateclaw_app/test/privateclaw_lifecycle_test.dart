import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';

void main() {
  test(
    'privateClawShouldSuspendLiveSession only suspends mobile background states',
    () {
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.android,
          state: AppLifecycleState.resumed,
        ),
        isFalse,
      );
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.android,
          state: AppLifecycleState.inactive,
        ),
        isFalse,
      );
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.android,
          state: AppLifecycleState.paused,
        ),
        isTrue,
      );
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.android,
          state: AppLifecycleState.hidden,
        ),
        isTrue,
      );
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.android,
          state: AppLifecycleState.detached,
        ),
        isTrue,
      );
      expect(
        privateClawShouldSuspendLiveSession(
          platform: TargetPlatform.macOS,
          state: AppLifecycleState.hidden,
        ),
        isFalse,
      );
    },
  );
}
