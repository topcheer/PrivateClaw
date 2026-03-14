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
  String get scannerPermissionDenied =>
      'Se necesita acceso a la cámara para escanear el QR de invitación.';

  @override
  String get scannerUnsupported =>
      'Este dispositivo o simulador no puede usar el escaneo con cámara. Pega el enlace de invitación en su lugar.';

  @override
  String get scannerUnavailable =>
      'El escaneo QR no está disponible temporalmente. Pega el enlace de invitación en su lugar.';

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
}
