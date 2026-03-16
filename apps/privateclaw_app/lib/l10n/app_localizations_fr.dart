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
  String get showSessionQrButton => 'Show current QR';

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
  String get scanSheetPickPhoto => 'Lire depuis une photo';

  @override
  String get scanSheetPickPhotoLoading => 'Lecture de la photo…';

  @override
  String get scanSheetNoQrInPhoto =>
      'Aucun code QR n’a été trouvé dans la photo sélectionnée.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Cet appareil ne peut pas encore lire les QR codes depuis les photos enregistrées. Collez le lien d’invitation.';

  @override
  String get scanSheetPhotoFailed =>
      'Impossible de lire la photo sélectionnée.';

  @override
  String get scannerPermissionDenied =>
      'L’accès à la caméra est nécessaire pour le scan QR en direct. Vous pouvez aussi choisir une photo.';

  @override
  String get scannerUnsupported =>
      'Le scan caméra en direct n’est pas disponible ici. Choisissez une photo ou collez le lien d’invitation.';

  @override
  String get scannerUnavailable =>
      'Le scan QR est temporairement indisponible. Choisissez une photo ou collez le lien d’invitation.';

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
  String get welcomeFallback => 'PrivateClaw est connecté.';

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
    return 'Discussion de groupe • $count participants';
  }

  @override
  String get groupModeLabel => 'Mode : discussion de groupe';

  @override
  String currentAppLabel(String label) {
    return 'Cette app : $label';
  }

  @override
  String get preparingAudioAttachment => 'Préparation de l’audio…';

  @override
  String get preparingVideoAttachment => 'Préparation de la vidéo…';

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
