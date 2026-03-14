// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Disconnect';

  @override
  String get entryTitle => 'One-time private session';

  @override
  String get inviteInputLabel => 'Invite link or QR payload';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Scan QR code';

  @override
  String get connectSessionButton => 'Join session';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => 'Session';

  @override
  String get expiresLabel => 'Expires';

  @override
  String get initialStatus =>
      'Scan a PrivateClaw QR code or paste an invite link to start a one-time session.';

  @override
  String get enterValidInvite =>
      'Paste or scan a valid PrivateClaw invite link.';

  @override
  String get connectingRelay => 'Connecting to the PrivateClaw relay…';

  @override
  String connectFailed(String error) {
    return 'Connect failed: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'End-to-end encrypted chat will appear here after the session connects.';

  @override
  String get sendHintActive => 'Send an encrypted message…';

  @override
  String get sendHintInactive => 'Wait for the session to finish connecting…';

  @override
  String get sendTooltip => 'Send';

  @override
  String sendFailed(String error) {
    return 'Send failed: $error';
  }

  @override
  String get sessionDisconnected =>
      'Session disconnected. Scan again to start a new PrivateClaw session.';

  @override
  String get scanSheetTitle => 'Scan a PrivateClaw invite QR code';

  @override
  String get scanSheetHint =>
      'If scanning is unavailable in the simulator, paste the invite link instead.';

  @override
  String get scannerPermissionDenied =>
      'Camera access is required to scan the invite QR code.';

  @override
  String get scannerUnsupported =>
      'This device or simulator cannot provide camera scanning. Paste the invite link instead.';

  @override
  String get scannerUnavailable =>
      'QR scanning is temporarily unavailable. Paste the invite link instead.';

  @override
  String get scannerLoading => 'Starting camera…';

  @override
  String get relayConnecting => 'Connecting to the relay…';

  @override
  String get relayHandshake =>
      'Relay connected. Finishing the encrypted handshake…';

  @override
  String relayConnectionError(String details) {
    return 'Connection error: $details';
  }

  @override
  String get relaySessionClosed => 'Session closed.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Session closed: $reason';
  }

  @override
  String relayError(String details) {
    return 'Relay error: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Received an unknown relay event: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Received an unknown encrypted message type: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw connected.';

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
    return 'Group chat • $count participants';
  }

  @override
  String get groupModeLabel => 'Mode: group chat';

  @override
  String currentAppLabel(String label) {
    return 'This app: $label';
  }

  @override
  String get preparingAudioAttachment => 'Preparing audio…';

  @override
  String get preparingVideoAttachment => 'Preparing video…';
}
