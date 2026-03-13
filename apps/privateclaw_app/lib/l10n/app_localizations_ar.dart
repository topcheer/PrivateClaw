// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => 'قطع الاتصال';

  @override
  String get entryTitle => 'جلسة خاصة لمرة واحدة';

  @override
  String get inviteInputLabel => 'رابط الدعوة أو محتوى QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'مسح رمز QR';

  @override
  String get connectSessionButton => 'الانضمام إلى الجلسة';

  @override
  String get sessionLabel => 'الجلسة';

  @override
  String get expiresLabel => 'ينتهي في';

  @override
  String get initialStatus =>
      'امسح رمز PrivateClaw QR أو الصق رابط الدعوة لبدء جلسة لمرة واحدة.';

  @override
  String get enterValidInvite => 'الصق أو امسح رابط دعوة PrivateClaw صالحًا.';

  @override
  String get connectingRelay => 'جارٍ الاتصال بوسيط PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'فشل الاتصال: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'ستظهر هنا المحادثة المشفرة من الطرف إلى الطرف بعد اتصال الجلسة.';

  @override
  String get sendHintActive => 'إرسال رسالة مشفرة…';

  @override
  String get sendHintInactive => 'انتظر حتى يكتمل اتصال الجلسة…';

  @override
  String get sendTooltip => 'إرسال';

  @override
  String sendFailed(String error) {
    return 'فشل الإرسال: $error';
  }

  @override
  String get sessionDisconnected =>
      'تم قطع الجلسة. امسح مرة أخرى لبدء جلسة PrivateClaw جديدة.';

  @override
  String get scanSheetTitle => 'مسح رمز دعوة PrivateClaw QR';

  @override
  String get scanSheetHint =>
      'إذا تعذر المسح في المحاكي، الصق رابط الدعوة بدلًا من ذلك.';

  @override
  String get scannerPermissionDenied =>
      'يلزم الوصول إلى الكاميرا لمسح رمز الدعوة QR.';

  @override
  String get scannerUnsupported =>
      'هذا الجهاز أو المحاكي لا يدعم المسح بالكاميرا. الصق رابط الدعوة بدلًا من ذلك.';

  @override
  String get scannerUnavailable =>
      'مسح QR غير متاح مؤقتًا. الصق رابط الدعوة بدلًا من ذلك.';

  @override
  String get scannerLoading => 'جارٍ تشغيل الكاميرا…';

  @override
  String get relayConnecting => 'جارٍ الاتصال بالوسيط…';

  @override
  String get relayHandshake =>
      'تم الاتصال بالوسيط. جارٍ إنهاء المصافحة المشفرة…';

  @override
  String relayConnectionError(String details) {
    return 'خطأ في الاتصال: $details';
  }

  @override
  String get relaySessionClosed => 'أُغلقت الجلسة.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'أُغلقت الجلسة: $reason';
  }

  @override
  String relayError(String details) {
    return 'خطأ في الوسيط: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'تم استلام حدث وسيط غير معروف: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'تم استلام نوع رسالة مشفرة غير معروف: $payloadType';
  }

  @override
  String get welcomeFallback => 'تم الاتصال بـ PrivateClaw.';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }
}
