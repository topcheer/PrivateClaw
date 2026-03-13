// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Trennen';

  @override
  String get entryTitle => 'Einmalige private Sitzung';

  @override
  String get inviteInputLabel => 'Einladungslink oder QR-Inhalt';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'QR-Code scannen';

  @override
  String get connectSessionButton => 'Sitzung beitreten';

  @override
  String get sessionLabel => 'Sitzung';

  @override
  String get expiresLabel => 'Läuft ab';

  @override
  String get initialStatus =>
      'Scannen Sie einen PrivateClaw-QR-Code oder fügen Sie einen Einladungslink ein, um eine einmalige Sitzung zu starten.';

  @override
  String get enterValidInvite =>
      'Fügen Sie einen gültigen PrivateClaw-Einladungslink ein oder scannen Sie ihn.';

  @override
  String get connectingRelay =>
      'Verbindung zum PrivateClaw-Relay wird hergestellt…';

  @override
  String connectFailed(String error) {
    return 'Verbindung fehlgeschlagen: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'Der Ende-zu-Ende-verschlüsselte Chat wird hier angezeigt, sobald die Sitzung verbunden ist.';

  @override
  String get sendHintActive => 'Verschlüsselte Nachricht senden…';

  @override
  String get sendHintInactive => 'Warten Sie, bis die Sitzung verbunden ist…';

  @override
  String get sendTooltip => 'Senden';

  @override
  String sendFailed(String error) {
    return 'Senden fehlgeschlagen: $error';
  }

  @override
  String get sessionDisconnected =>
      'Sitzung getrennt. Scannen Sie erneut, um eine neue PrivateClaw-Sitzung zu starten.';

  @override
  String get scanSheetTitle => 'PrivateClaw-Einladungs-QR-Code scannen';

  @override
  String get scanSheetHint =>
      'Wenn der Simulator nicht scannen kann, fügen Sie stattdessen den Einladungslink ein.';

  @override
  String get scannerPermissionDenied =>
      'Für das Scannen des Einladungs-QR-Codes ist Kamerazugriff erforderlich.';

  @override
  String get scannerUnsupported =>
      'Dieses Gerät oder dieser Simulator unterstützt kein Kamera-Scannen. Fügen Sie stattdessen den Einladungslink ein.';

  @override
  String get scannerUnavailable =>
      'QR-Scannen ist vorübergehend nicht verfügbar. Fügen Sie stattdessen den Einladungslink ein.';

  @override
  String get scannerLoading => 'Kamera wird gestartet…';

  @override
  String get relayConnecting => 'Verbindung zum Relay wird hergestellt…';

  @override
  String get relayHandshake =>
      'Relay verbunden. Verschlüsselten Handshake abschließen…';

  @override
  String relayConnectionError(String details) {
    return 'Verbindungsfehler: $details';
  }

  @override
  String get relaySessionClosed => 'Sitzung geschlossen.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Sitzung geschlossen: $reason';
  }

  @override
  String relayError(String details) {
    return 'Relay-Fehler: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Unbekanntes Relay-Ereignis empfangen: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Unbekannter verschlüsselter Nachrichtentyp empfangen: $payloadType';
  }

  @override
  String get welcomeFallback => 'PrivateClaw ist verbunden.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }
}
