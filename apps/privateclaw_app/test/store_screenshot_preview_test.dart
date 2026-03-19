import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/store_screenshot_preview.dart';
import 'package:privateclaw_app/widgets/privateclaw_avatar.dart';

void main() {
  test('screenshot preview config can load from runtime environment', () {
    final StoreScreenshotConfig config = StoreScreenshotConfig.fromEnvironment(
      environment: const <String, String>{
        'PRIVATECLAW_SCREENSHOT_SCENARIO': 'group_chat',
        'PRIVATECLAW_SCREENSHOT_LOCALE': 'en_US',
      },
    );

    expect(config.previewData, isNotNull);
    expect(config.localeOverride, const Locale('en', 'US'));
    expect(config.previewData?.participants, isNotEmpty);
  });

  testWidgets('group chat preview renders active session controls', (
    WidgetTester tester,
  ) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 2796);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: screenshotPreviewDataForScenario(
            'group_chat',
            const Locale('en', 'US'),
          ),
          localeOverride: const Locale('en', 'US'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.link_off), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('voice-record-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('emoji-picker-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('composer-photo-button')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('composer-expand-button')),
      findsOneWidget,
    );
    expect(find.text('Aria'), findsWidgets);
    expect(find.textContaining('Renewal reminder'), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('current-identity-avatar')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey<String>('participant-avatar-app-aria')),
      findsOneWidget,
    );
    expect(find.byType(PrivateClawAvatar), findsWidgets);
  });

  testWidgets('rich media preview renders attachments and a prepared draft', (
    WidgetTester tester,
  ) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(1290, 2796);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      PrivateClawApp(
        screenshotConfig: StoreScreenshotConfig(
          previewData: screenshotPreviewDataForScenario(
            'rich_media',
            const Locale('en', 'US'),
          ),
          localeOverride: const Locale('en', 'US'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(
      find.byWidgetPredicate(
        (Widget widget) => widget is Image && widget.image is MemoryImage,
      ),
      findsOneWidget,
    );
    expect(find.text('release-checklist.pdf'), findsOneWidget);
    expect(
      find.text('/tts Draft a 15 second encrypted handoff summary'),
      findsOneWidget,
    );
  });
}
