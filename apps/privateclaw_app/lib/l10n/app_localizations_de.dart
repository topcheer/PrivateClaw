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
  String get showSessionQrButton => 'Show current QR';

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
  String get scanSheetPickPhoto => 'Aus Foto lesen';

  @override
  String get scanSheetPickPhotoLoading => 'Foto wird gelesen…';

  @override
  String get scanSheetNoQrInPhoto =>
      'Im ausgewählten Foto wurde kein QR-Code gefunden.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Dieses Gerät kann QR-Codes noch nicht aus gespeicherten Fotos lesen. Fügen Sie stattdessen den Einladungslink ein.';

  @override
  String get scanSheetPhotoFailed =>
      'Das ausgewählte Foto konnte nicht gelesen werden.';

  @override
  String get scannerPermissionDenied =>
      'Für Live-QR-Scans ist Kamerazugriff erforderlich. Alternativ können Sie ein Foto auswählen.';

  @override
  String get scannerUnsupported =>
      'Live-Kamera-Scans sind hier nicht verfügbar. Wählen Sie stattdessen ein Foto aus oder fügen Sie den Einladungslink ein.';

  @override
  String get scannerUnavailable =>
      'QR-Scannen ist vorübergehend nicht verfügbar. Wählen Sie stattdessen ein Foto aus oder fügen Sie den Einladungslink ein.';

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
  String get nonDefaultRelayWarningTitle => 'Custom relay server';

  @override
  String nonDefaultRelayWarningBody(String relayLabel) {
    return 'This invite points to $relayLabel instead of the default PrivateClaw relay. Continue only if you trust this server.';
  }

  @override
  String get relayWarningCancelButton => 'Cancel';

  @override
  String get relayWarningContinueButton => 'Continue';

  @override
  String get sessionQrTitle => 'Current session QR';

  @override
  String get sessionQrHint =>
      'Share this QR in person before the session expires.';

  @override
  String get copyInviteLinkButton => 'Copy invite link';

  @override
  String get inviteLinkCopied => 'Invite link copied.';

  @override
  String get welcomeFallback => 'PrivateClaw ist verbunden.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }

  @override
  String get sessionRenewPromptTitle => 'Session expiring soon';

  @override
  String sessionRenewPromptBody(String remaining) {
    return 'This session expires in $remaining. Any member can renew it now.';
  }

  @override
  String get sessionRenewButton => 'Renew session';

  @override
  String get sessionRenewButtonPending => 'Renewing…';

  @override
  String groupChatSummary(int count) {
    return 'Gruppenchat • $count Teilnehmende';
  }

  @override
  String get groupModeLabel => 'Modus: Gruppenchat';

  @override
  String currentAppLabel(String label) {
    return 'Diese App: $label';
  }

  @override
  String get preparingAudioAttachment => 'Audio wird vorbereitet…';

  @override
  String get preparingVideoAttachment => 'Video wird vorbereitet…';

  @override
  String get switchToVoiceInputTooltip => 'Voice input';

  @override
  String get switchToTextInputTooltip => 'Keyboard input';

  @override
  String get voiceRecordHoldToSend => 'Hold to Talk';

  @override
  String get voiceRecordReleaseToSend => 'Release to send';

  @override
  String get voiceRecordSending => 'Sending voice message…';

  @override
  String get voiceRecordUnavailable =>
      'Wait for the session to finish connecting…';

  @override
  String get voiceRecordingPermissionDenied =>
      'Microphone access is required for voice messages.';

  @override
  String get voiceRecordingUnsupported =>
      'Voice recording is unavailable on this device.';

  @override
  String get voiceRecordingTooShort =>
      'Hold a little longer before releasing your voice message.';

  @override
  String get voiceRecordingTooLarge =>
      'This voice message is too large to send inline.';

  @override
  String get voiceRecordingCancelled => 'Voice recording cancelled.';

  @override
  String voiceRecordingFailed(String error) {
    return 'Voice recording failed: $error';
  }

  @override
  String get emojiPickerTooltip => 'Emoji';

  @override
  String get emojiPickerTitle => 'Common emoji';

  @override
  String get composerExpandTooltip => 'Expand editor';

  @override
  String get composerFullscreenTitle => 'Expanded composer';

  @override
  String get emojiPickerFrequentTab => 'Frequent';

  @override
  String get emojiPickerDefaultTab => 'Default';

  @override
  String get photoTrayTooltip => 'Photos';

  @override
  String get photoTrayCameraButton => 'Camera';

  @override
  String get photoTrayGalleryButton => 'Gallery';

  @override
  String get photoTrayNoImages => 'No photos available.';

  @override
  String get photoTrayAndroidRecentPhotosUnavailable =>
      'Recent photo browsing is turned off on Android in this build. Use Camera or Gallery instead.';

  @override
  String get photoLibraryPermissionDenied =>
      'Photo access is required to browse recent images.';

  @override
  String get filePickerTooltip => 'Files';

  @override
  String attachmentOpenFailed(String name) {
    return 'Couldn\'t open $name.';
  }

  @override
  String get voiceRecordingSlideUpToCancel =>
      'Release to send · slide up to cancel';

  @override
  String get voiceRecordingReleaseToCancel => 'Release to cancel';
}
