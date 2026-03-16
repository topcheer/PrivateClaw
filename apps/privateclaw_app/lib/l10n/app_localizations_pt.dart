// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Desconectar';

  @override
  String get entryTitle => 'Sessão privada de uso único';

  @override
  String get inviteInputLabel => 'Link de convite ou conteúdo do QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Escanear QR code';

  @override
  String get connectSessionButton => 'Entrar na sessão';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => 'Sessão';

  @override
  String get expiresLabel => 'Expira em';

  @override
  String get initialStatus =>
      'Escaneie um QR code do PrivateClaw ou cole um link de convite para iniciar uma sessão de uso único.';

  @override
  String get enterValidInvite =>
      'Cole ou escaneie um link de convite válido do PrivateClaw.';

  @override
  String get connectingRelay => 'Conectando ao relay do PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Falha na conexão: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'O chat com criptografia de ponta a ponta aparecerá aqui quando a sessão se conectar.';

  @override
  String get sendHintActive => 'Enviar mensagem criptografada…';

  @override
  String get sendHintInactive => 'Aguarde a sessão terminar de se conectar…';

  @override
  String get sendTooltip => 'Enviar';

  @override
  String sendFailed(String error) {
    return 'Falha no envio: $error';
  }

  @override
  String get sessionDisconnected =>
      'Sessão desconectada. Escaneie novamente para iniciar uma nova sessão PrivateClaw.';

  @override
  String get scanSheetTitle => 'Escanear um QR de convite do PrivateClaw';

  @override
  String get scanSheetHint =>
      'Se o simulador não puder escanear, cole o link de convite.';

  @override
  String get scanSheetPickPhoto => 'Ler a partir de uma foto';

  @override
  String get scanSheetPickPhotoLoading => 'Lendo foto…';

  @override
  String get scanSheetNoQrInPhoto =>
      'Nenhum código QR foi encontrado na foto selecionada.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Este dispositivo ainda não consegue ler códigos QR de fotos salvas. Cole o link de convite.';

  @override
  String get scanSheetPhotoFailed => 'Não foi possível ler a foto selecionada.';

  @override
  String get scannerPermissionDenied =>
      'O acesso à câmera é necessário para leitura QR ao vivo. Você também pode escolher uma foto.';

  @override
  String get scannerUnsupported =>
      'A leitura ao vivo pela câmera não está disponível aqui. Escolha uma foto ou cole o link de convite.';

  @override
  String get scannerUnavailable =>
      'A leitura de QR está temporariamente indisponível. Escolha uma foto ou cole o link de convite.';

  @override
  String get scannerLoading => 'Iniciando câmera…';

  @override
  String get relayConnecting => 'Conectando ao relay…';

  @override
  String get relayHandshake =>
      'Relay conectado. Finalizando o handshake criptografado…';

  @override
  String relayConnectionError(String details) {
    return 'Erro de conexão: $details';
  }

  @override
  String get relaySessionClosed => 'Sessão encerrada.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Sessão encerrada: $reason';
  }

  @override
  String relayError(String details) {
    return 'Erro do relay: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Evento de relay desconhecido recebido: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Tipo de mensagem criptografada desconhecido recebido: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw conectado.';

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
    return 'Chat em grupo • $count participantes';
  }

  @override
  String get groupModeLabel => 'Modo: chat em grupo';

  @override
  String currentAppLabel(String label) {
    return 'Este app: $label';
  }

  @override
  String get preparingAudioAttachment => 'Preparando áudio…';

  @override
  String get preparingVideoAttachment => 'Preparando vídeo…';

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

/// The translations for Portuguese, as used in Brazil (`pt_BR`).
class AppLocalizationsPtBr extends AppLocalizationsPt {
  AppLocalizationsPtBr() : super('pt_BR');

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Desconectar';

  @override
  String get entryTitle => 'Sessão privada de uso único';

  @override
  String get inviteInputLabel => 'Link de convite ou conteúdo do QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Escanear QR code';

  @override
  String get connectSessionButton => 'Entrar na sessão';

  @override
  String get sessionLabel => 'Sessão';

  @override
  String get expiresLabel => 'Expira em';

  @override
  String get initialStatus =>
      'Escaneie um QR code do PrivateClaw ou cole um link de convite para iniciar uma sessão de uso único.';

  @override
  String get enterValidInvite =>
      'Cole ou escaneie um link de convite válido do PrivateClaw.';

  @override
  String get connectingRelay => 'Conectando ao relay do PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Falha na conexão: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'O chat com criptografia de ponta a ponta aparecerá aqui quando a sessão se conectar.';

  @override
  String get sendHintActive => 'Enviar mensagem criptografada…';

  @override
  String get sendHintInactive => 'Aguarde a sessão terminar de se conectar…';

  @override
  String get sendTooltip => 'Enviar';

  @override
  String sendFailed(String error) {
    return 'Falha no envio: $error';
  }

  @override
  String get sessionDisconnected =>
      'Sessão desconectada. Escaneie novamente para iniciar uma nova sessão PrivateClaw.';

  @override
  String get scanSheetTitle => 'Escanear um QR de convite do PrivateClaw';

  @override
  String get scanSheetHint =>
      'Se o simulador não puder escanear, cole o link de convite.';

  @override
  String get scanSheetPickPhoto => 'Ler a partir de uma foto';

  @override
  String get scanSheetPickPhotoLoading => 'Lendo foto…';

  @override
  String get scanSheetNoQrInPhoto =>
      'Nenhum código QR foi encontrado na foto selecionada.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Este dispositivo ainda não consegue ler códigos QR de fotos salvas. Cole o link de convite.';

  @override
  String get scanSheetPhotoFailed => 'Não foi possível ler a foto selecionada.';

  @override
  String get scannerPermissionDenied =>
      'O acesso à câmera é necessário para leitura QR ao vivo. Você também pode escolher uma foto.';

  @override
  String get scannerUnsupported =>
      'A leitura ao vivo pela câmera não está disponível aqui. Escolha uma foto ou cole o link de convite.';

  @override
  String get scannerUnavailable =>
      'A leitura de QR está temporariamente indisponível. Escolha uma foto ou cole o link de convite.';

  @override
  String get scannerLoading => 'Iniciando câmera…';

  @override
  String get relayConnecting => 'Conectando ao relay…';

  @override
  String get relayHandshake =>
      'Relay conectado. Finalizando o handshake criptografado…';

  @override
  String relayConnectionError(String details) {
    return 'Erro de conexão: $details';
  }

  @override
  String get relaySessionClosed => 'Sessão encerrada.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Sessão encerrada: $reason';
  }

  @override
  String relayError(String details) {
    return 'Erro do relay: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Evento de relay desconhecido recebido: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Tipo de mensagem criptografada desconhecido recebido: $payloadType';
  }

  @override
  String get welcomeFallback => 'PrivateClaw conectado.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }

  @override
  String groupChatSummary(int count) {
    return 'Chat em grupo • $count participantes';
  }

  @override
  String get groupModeLabel => 'Modo: chat em grupo';

  @override
  String currentAppLabel(String label) {
    return 'Este app: $label';
  }

  @override
  String get preparingAudioAttachment => 'Preparando áudio…';

  @override
  String get preparingVideoAttachment => 'Preparando vídeo…';
}
