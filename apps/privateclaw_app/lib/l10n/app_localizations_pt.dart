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
  String get scannerPermissionDenied =>
      'É necessário acesso à câmera para escanear o QR de convite.';

  @override
  String get scannerUnsupported =>
      'Este dispositivo ou simulador não oferece leitura pela câmera. Cole o link de convite.';

  @override
  String get scannerUnavailable =>
      'A leitura de QR está temporariamente indisponível. Cole o link de convite.';

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
  String get scannerPermissionDenied =>
      'É necessário acesso à câmera para escanear o QR de convite.';

  @override
  String get scannerUnsupported =>
      'Este dispositivo ou simulador não oferece leitura pela câmera. Cole o link de convite.';

  @override
  String get scannerUnavailable =>
      'A leitura de QR está temporariamente indisponível. Cole o link de convite.';

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
}
