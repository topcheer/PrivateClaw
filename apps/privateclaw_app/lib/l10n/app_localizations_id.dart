// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Indonesian (`id`).
class AppLocalizationsId extends AppLocalizations {
  AppLocalizationsId([String locale = 'id']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'Putuskan';

  @override
  String get entryTitle => 'Sesi privat sekali pakai';

  @override
  String get inviteInputLabel => 'Tautan undangan atau payload QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Pindai kode QR';

  @override
  String get connectSessionButton => 'Gabung sesi';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => 'Sesi';

  @override
  String get expiresLabel => 'Kedaluwarsa';

  @override
  String get initialStatus =>
      'Pindai kode QR PrivateClaw atau tempel tautan undangan untuk memulai sesi sekali pakai.';

  @override
  String get enterValidInvite =>
      'Tempel atau pindai tautan undangan PrivateClaw yang valid.';

  @override
  String get connectingRelay => 'Menghubungkan ke relay PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Gagal terhubung: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'Chat terenkripsi end-to-end akan muncul di sini setelah sesi terhubung.';

  @override
  String get sendHintActive => 'Kirim pesan terenkripsi…';

  @override
  String get sendHintInactive => 'Tunggu sesi selesai terhubung…';

  @override
  String get sendTooltip => 'Kirim';

  @override
  String sendFailed(String error) {
    return 'Gagal mengirim: $error';
  }

  @override
  String get sessionDisconnected =>
      'Sesi terputus. Pindai lagi untuk memulai sesi PrivateClaw baru.';

  @override
  String get scanSheetTitle => 'Pindai QR undangan PrivateClaw';

  @override
  String get scanSheetHint =>
      'Jika simulator tidak bisa memindai, tempel tautan undangan secara langsung.';

  @override
  String get scanSheetPickPhoto => 'Baca dari gambar';

  @override
  String get scanSheetPickPhotoLoading => 'Sedang membaca gambar…';

  @override
  String get scanSheetNoQrInPhoto =>
      'Tidak ada kode QR yang ditemukan pada gambar yang dipilih.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Perangkat ini belum bisa membaca kode QR dari gambar tersimpan. Tempel tautan undangan.';

  @override
  String get scanSheetPhotoFailed => 'Gagal membaca gambar yang dipilih.';

  @override
  String get scannerPermissionDenied =>
      'Akses kamera diperlukan untuk pemindaian QR langsung. Anda juga bisa memilih gambar sebagai gantinya.';

  @override
  String get scannerUnsupported =>
      'Pemindaian kamera langsung tidak tersedia di sini. Pilih gambar atau tempel tautan undangan.';

  @override
  String get scannerUnavailable =>
      'Pemindaian QR sedang tidak tersedia. Pilih gambar atau tempel tautan undangan.';

  @override
  String get scannerLoading => 'Memulai kamera…';

  @override
  String get relayConnecting => 'Menghubungkan ke relay…';

  @override
  String get relayHandshake =>
      'Relay terhubung. Menyelesaikan handshake terenkripsi…';

  @override
  String relayConnectionError(String details) {
    return 'Kesalahan koneksi: $details';
  }

  @override
  String get relaySessionClosed => 'Sesi ditutup.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Sesi ditutup: $reason';
  }

  @override
  String relayError(String details) {
    return 'Kesalahan relay: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Menerima event relay yang tidak dikenal: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Menerima jenis pesan terenkripsi yang tidak dikenal: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw terhubung.';

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
    return 'Obrolan grup • $count peserta';
  }

  @override
  String get groupModeLabel => 'Mode: obrolan grup';

  @override
  String currentAppLabel(String label) {
    return 'Aplikasi ini: $label';
  }

  @override
  String get preparingAudioAttachment => 'Menyiapkan audio…';

  @override
  String get preparingVideoAttachment => 'Menyiapkan video…';

  @override
  String get switchToVoiceInputTooltip => 'Voice input';

  @override
  String get switchToTextInputTooltip => 'Keyboard input';

  @override
  String get voiceRecordHoldToSend => 'Hold to Talk';

  @override
  String get voiceRecordTapToStart => 'Tap to start recording';

  @override
  String get voiceRecordTapAgainToSend => 'Tap again to send';

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
      'Record a little longer before sending your voice message.';

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
