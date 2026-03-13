// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Déconnecter';

  @override
  String get entryTitle => 'Session privée à usage unique';

  @override
  String get inviteInputLabel => 'Lien d’invitation ou contenu QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Scanner le QR code';

  @override
  String get connectSessionButton => 'Rejoindre la session';

  @override
  String get sessionLabel => 'Session';

  @override
  String get expiresLabel => 'Expiration';

  @override
  String get initialStatus =>
      'Scannez un QR code PrivateClaw ou collez un lien d’invitation pour démarrer une session à usage unique.';

  @override
  String get enterValidInvite =>
      'Collez ou scannez un lien d’invitation PrivateClaw valide.';

  @override
  String get connectingRelay => 'Connexion au relais PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Échec de la connexion : $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'Le chat chiffré de bout en bout apparaîtra ici une fois la session connectée.';

  @override
  String get sendHintActive => 'Envoyer un message chiffré…';

  @override
  String get sendHintInactive =>
      'Patientez pendant la connexion de la session…';

  @override
  String get sendTooltip => 'Envoyer';

  @override
  String sendFailed(String error) {
    return 'Échec de l’envoi : $error';
  }

  @override
  String get sessionDisconnected =>
      'Session déconnectée. Scannez de nouveau pour démarrer une nouvelle session PrivateClaw.';

  @override
  String get scanSheetTitle => 'Scanner un QR code d’invitation PrivateClaw';

  @override
  String get scanSheetHint =>
      'Si le simulateur ne peut pas scanner, collez le lien d’invitation à la place.';

  @override
  String get scannerPermissionDenied =>
      'L’accès à la caméra est requis pour scanner le QR code d’invitation.';

  @override
  String get scannerUnsupported =>
      'Cet appareil ou simulateur ne peut pas utiliser le scan caméra. Collez le lien d’invitation à la place.';

  @override
  String get scannerUnavailable =>
      'Le scan QR est temporairement indisponible. Collez le lien d’invitation à la place.';

  @override
  String get scannerLoading => 'Démarrage de la caméra…';

  @override
  String get relayConnecting => 'Connexion au relais…';

  @override
  String get relayHandshake =>
      'Relais connecté. Finalisation de la poignée de main chiffrée…';

  @override
  String relayConnectionError(String details) {
    return 'Erreur de connexion : $details';
  }

  @override
  String get relaySessionClosed => 'Session fermée.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Session fermée : $reason';
  }

  @override
  String relayError(String details) {
    return 'Erreur du relais : $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Événement de relais inconnu reçu : $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Type de message chiffré inconnu reçu : $payloadType';
  }

  @override
  String get welcomeFallback => 'PrivateClaw est connecté.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }
}
