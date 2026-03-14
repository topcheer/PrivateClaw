import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';
import 'package:privateclaw_app/models/privateclaw_invite.dart';
import 'package:privateclaw_app/services/privateclaw_session_client.dart';
import 'package:privateclaw_app/store_screenshot_preview.dart';

void main() {
  testWidgets('PrivateClaw home screen renders invite and composer actions', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const PrivateClawApp());

    expect(find.text('PrivateClaw'), findsOneWidget);
    expect(find.text('Scan QR code'), findsOneWidget);
    expect(find.text('Join session'), findsOneWidget);
    expect(find.byIcon(Icons.attach_file), findsOneWidget);

    final List<TextField> textFields = tester
        .widgetList<TextField>(find.byType(TextField))
        .toList(growable: false);
    expect(textFields.any((TextField field) => field.maxLines == 1), isTrue);
  });

  testWidgets(
    'reconnecting preview keeps the pairing panel collapsed and can reshow the QR',
    (WidgetTester tester) async {
      final PrivateClawInvite invite = PrivateClawInvite(
        version: 1,
        sessionId: 'session-reshare',
        sessionKey: 'test-session-key',
        appWsUrl: 'wss://relay.privateclaw.us/ws/app?sessionId=session-reshare',
        expiresAt: DateTime.utc(2026, 3, 14, 21, 30),
      );

      await tester.pumpWidget(
        PrivateClawApp(
          screenshotConfig: StoreScreenshotConfig(
            previewData: PrivateClawPreviewData(
              invite: invite,
              status: PrivateClawSessionStatus.reconnecting,
              statusText: 'Reconnecting quietly…',
              isPairingPanelCollapsed: true,
            ),
          ),
        ),
      );

      expect(find.text('Invite link or QR payload'), findsNothing);
      expect(
        find.byKey(const ValueKey<String>('session-qr-trigger')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const ValueKey<String>('session-qr-trigger')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Current session QR'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('session-qr-code')),
        findsOneWidget,
      );
      expect(find.text('Copy invite link'), findsOneWidget);
    },
  );
}
