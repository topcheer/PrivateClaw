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
  String get scannerPermissionDenied =>
      'Akses kamera diperlukan untuk memindai QR undangan.';

  @override
  String get scannerUnsupported =>
      'Perangkat atau simulator ini tidak dapat menyediakan pemindaian kamera. Tempel tautan undangan sebagai gantinya.';

  @override
  String get scannerUnavailable =>
      'Pemindaian QR sedang tidak tersedia. Tempel tautan undangan sebagai gantinya.';

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
  String get welcomeFallback => 'PrivateClaw terhubung.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }

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
}
