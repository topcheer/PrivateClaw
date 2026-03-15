import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:privateclaw_app/l10n/app_localizations.dart';
import 'package:privateclaw_app/services/privateclaw_invite_image_decoder.dart';
import 'package:privateclaw_app/widgets/invite_scanner_sheet.dart';

void main() {
  Widget buildScannerSheet({
    required ValueChanged<String> onDetected,
    Future<String?> Function()? pickImagePath,
    Future<String?> Function(String path)? analyzeImagePath,
    Future<String?> Function()? captureInviteFromCamera,
    bool? useNativeIosCapture,
    bool? autoStartNativeIosCapture,
  }) {
    return MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: InviteScannerSheet(
          onDetected: onDetected,
          pickImagePath: pickImagePath,
          analyzeImagePath: analyzeImagePath,
          captureInviteFromCamera: captureInviteFromCamera,
          useNativeIosCapture: useNativeIosCapture,
          autoStartNativeIosCapture: autoStartNativeIosCapture,
          previewOverride: const ColoredBox(color: Colors.black),
        ),
      ),
    );
  }

  testWidgets('scanner sheet shows photo scan button without simulator hint', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(buildScannerSheet(onDetected: (_) {}));

    expect(
      find.byKey(const ValueKey<String>('scan-photo-button')),
      findsOneWidget,
    );
    expect(find.text('Scan from photo'), findsOneWidget);
    expect(
      find.text(
        'If scanning is unavailable in the simulator, paste the invite link instead.',
      ),
      findsNothing,
    );
  });

  testWidgets('scanner sheet can detect an invite from a picked image', (
    WidgetTester tester,
  ) async {
    String? detectedValue;

    await tester.pumpWidget(
      buildScannerSheet(
        onDetected: (String value) {
          detectedValue = value;
        },
        pickImagePath: () async => '/tmp/privateclaw-test.png',
        analyzeImagePath: (String path) async =>
            'privateclaw://connect?payload=photo-picked-invite',
      ),
    );

    await tester.tap(find.byKey(const ValueKey<String>('scan-photo-button')));
    await tester.pumpAndSettle();

    expect(detectedValue, 'privateclaw://connect?payload=photo-picked-invite');
  });

  testWidgets('scanner sheet reports when a selected image has no QR code', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      buildScannerSheet(
        onDetected: (_) {},
        pickImagePath: () async => '/tmp/privateclaw-empty.png',
        analyzeImagePath: (String path) async {
          throw const MobileScannerBarcodeException('no qr');
        },
      ),
    );

    await tester.tap(find.byKey(const ValueKey<String>('scan-photo-button')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('scan-photo-feedback')),
      findsOneWidget,
    );
    expect(
      find.text('No QR code was found in the selected photo.'),
      findsOneWidget,
    );
  });

  testWidgets('scanner sheet uses native iOS camera fallback', (
    WidgetTester tester,
  ) async {
    String? detectedValue;

    await tester.pumpWidget(
      buildScannerSheet(
        onDetected: (String value) {
          detectedValue = value;
        },
        useNativeIosCapture: true,
        autoStartNativeIosCapture: false,
        captureInviteFromCamera: () async =>
            'privateclaw://connect?payload=camera-picked-invite',
      ),
    );

    expect(
      find.byKey(const ValueKey<String>('scan-camera-button')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey<String>('scan-camera-button')));
    await tester.pumpAndSettle();

    expect(detectedValue, 'privateclaw://connect?payload=camera-picked-invite');
  });

  testWidgets('scanner sheet shows permission feedback for iOS camera fallback', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      buildScannerSheet(
        onDetected: (_) {},
        useNativeIosCapture: true,
        autoStartNativeIosCapture: false,
        captureInviteFromCamera: () async {
          throw const PrivateClawInviteCameraPermissionDenied();
        },
      ),
    );

    await tester.tap(find.byKey(const ValueKey<String>('scan-camera-button')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey<String>('scan-photo-feedback')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Camera access is required for live QR scanning. You can also choose a photo instead.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('scanner sheet auto-starts native iOS live scanner on open', (
    WidgetTester tester,
  ) async {
    String? detectedValue;
    int captureAttempts = 0;

    await tester.pumpWidget(
      buildScannerSheet(
        onDetected: (String value) {
          detectedValue = value;
        },
        useNativeIosCapture: true,
        captureInviteFromCamera: () async {
          captureAttempts += 1;
          return 'privateclaw://connect?payload=auto-opened-invite';
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(captureAttempts, 1);
    expect(detectedValue, 'privateclaw://connect?payload=auto-opened-invite');
  });
}
