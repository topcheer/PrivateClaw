import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privateclaw_app/main.dart';

void main() {
  testWidgets('PrivateClaw home screen renders invite and composer actions', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const PrivateClawApp());

    expect(find.text('PrivateClaw'), findsOneWidget);
    expect(find.text('Scan QR code'), findsOneWidget);
    expect(find.text('Join session'), findsOneWidget);
    expect(find.byIcon(Icons.attach_file), findsOneWidget);

    final List<TextField> textFields = tester.widgetList<TextField>(
      find.byType(TextField),
    ).toList(growable: false);
    expect(textFields.any((TextField field) => field.maxLines == 1), isTrue);
  });
}
