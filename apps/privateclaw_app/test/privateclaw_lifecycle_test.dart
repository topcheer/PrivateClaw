import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';

void main() {
  test(
    'privateClawShouldSuspendLiveSession only suspends background states',
    () {
      expect(
        privateClawShouldSuspendLiveSession(AppLifecycleState.resumed),
        isFalse,
      );
      expect(
        privateClawShouldSuspendLiveSession(AppLifecycleState.inactive),
        isFalse,
      );
      expect(
        privateClawShouldSuspendLiveSession(AppLifecycleState.paused),
        isTrue,
      );
      expect(
        privateClawShouldSuspendLiveSession(AppLifecycleState.hidden),
        isTrue,
      );
      expect(
        privateClawShouldSuspendLiveSession(AppLifecycleState.detached),
        isTrue,
      );
    },
  );
}
