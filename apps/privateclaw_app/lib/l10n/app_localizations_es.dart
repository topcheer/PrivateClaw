// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Spanish Castilian (`es`).
class AppLocalizationsEs extends AppLocalizations {
  AppLocalizationsEs([String locale = 'es']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Desconectar';

  @override
  String get entryTitle => 'Sesión privada de un solo uso';

  @override
  String get inviteInputLabel => 'Enlace de invitación o contenido QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Escanear código QR';

  @override
  String get connectSessionButton => 'Unirse a la sesión';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => 'Sesión';

  @override
  String get expiresLabel => 'Caduca';

  @override
  String get initialStatus =>
      'Escanea un código QR de PrivateClaw o pega un enlace de invitación para iniciar una sesión de un solo uso.';

  @override
  String get enterValidInvite =>
      'Pega o escanea un enlace de invitación válido de PrivateClaw.';

  @override
  String get connectingRelay => 'Conectando al relay de PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Error al conectar: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'El chat cifrado de extremo a extremo aparecerá aquí cuando la sesión se conecte.';

  @override
  String get sendHintActive => 'Enviar un mensaje cifrado…';

  @override
  String get sendHintInactive =>
      'Espera a que la sesión termine de conectarse…';

  @override
  String get sendTooltip => 'Enviar';

  @override
  String sendFailed(String error) {
    return 'Error al enviar: $error';
  }

  @override
  String get sessionDisconnected =>
      'Sesión desconectada. Escanea de nuevo para iniciar una nueva sesión de PrivateClaw.';

  @override
  String get scanSheetTitle => 'Escanear un QR de invitación de PrivateClaw';

  @override
  String get scanSheetHint =>
      'Si el simulador no puede escanear, pega el enlace de invitación en su lugar.';

  @override
  String get scanSheetPickPhoto => 'Leer desde una foto';

  @override
  String get scanSheetPickPhotoLoading => 'Leyendo foto…';

  @override
  String get scanSheetNoQrInPhoto =>
      'No se encontró ningún código QR en la foto seleccionada.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Este dispositivo aún no puede leer códigos QR desde fotos guardadas. Pega el enlace de invitación.';

  @override
  String get scanSheetPhotoFailed => 'No se pudo leer la foto seleccionada.';

  @override
  String get scannerPermissionDenied =>
      'Se necesita acceso a la cámara para escanear QR en vivo. También puedes elegir una foto.';

  @override
  String get scannerUnsupported =>
      'El escaneo en vivo con cámara no está disponible aquí. Elige una foto o pega el enlace de invitación.';

  @override
  String get scannerUnavailable =>
      'El escaneo QR no está disponible temporalmente. Elige una foto o pega el enlace de invitación.';

  @override
  String get scannerLoading => 'Iniciando cámara…';

  @override
  String get relayConnecting => 'Conectando al relay…';

  @override
  String get relayHandshake =>
      'Relay conectado. Finalizando el saludo cifrado…';

  @override
  String relayConnectionError(String details) {
    return 'Error de conexión: $details';
  }

  @override
  String get relaySessionClosed => 'Sesión cerrada.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Sesión cerrada: $reason';
  }

  @override
  String relayError(String details) {
    return 'Error del relay: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Se recibió un evento de relay desconocido: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Se recibió un tipo de mensaje cifrado desconocido: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw está conectado.';

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
    return 'Chat grupal • $count participantes';
  }

  @override
  String get groupModeLabel => 'Modo: chat grupal';

  @override
  String currentAppLabel(String label) {
    return 'Esta app: $label';
  }

  @override
  String get preparingAudioAttachment => 'Preparando audio…';

  @override
  String get preparingVideoAttachment => 'Preparando video…';

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
}
