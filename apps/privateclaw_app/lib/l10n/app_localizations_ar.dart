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
  String get showSessionQrButton => 'Show current QR';

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
  String get scanSheetPickPhoto => 'القراءة من صورة';

  @override
  String get scanSheetPickPhotoLoading => 'جارٍ قراءة الصورة…';

  @override
  String get scanSheetNoQrInPhoto =>
      'لم يتم العثور على رمز QR في الصورة المحددة.';

  @override
  String get scanSheetPhotoUnsupported =>
      'هذا الجهاز لا يستطيع بعد قراءة رموز QR من الصور المحفوظة. الصق رابط الدعوة بدلًا من ذلك.';

  @override
  String get scanSheetPhotoFailed => 'تعذر قراءة الصورة المحددة.';

  @override
  String get scannerPermissionDenied =>
      'يلزم الوصول إلى الكاميرا للمسح المباشر لرمز QR. ويمكنك أيضًا اختيار صورة بدلًا من ذلك.';

  @override
  String get scannerUnsupported =>
      'المسح المباشر بالكاميرا غير متاح هنا. اختر صورة أو الصق رابط الدعوة.';

  @override
  String get scannerUnavailable =>
      'مسح QR غير متاح مؤقتًا. اختر صورة أو الصق رابط الدعوة.';

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
  String get sessionQrTitle => 'Current session QR';

  @override
  String get sessionQrHint =>
      'Share this QR in person before the session expires.';

  @override
  String get copyInviteLinkButton => 'Copy invite link';

  @override
  String get inviteLinkCopied => 'Invite link copied.';

  @override
  String get welcomeFallback => 'تم الاتصال بـ PrivateClaw.';

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
    return 'دردشة جماعية • $count مشاركًا';
  }

  @override
  String get groupModeLabel => 'الوضع: دردشة جماعية';

  @override
  String currentAppLabel(String label) {
    return 'هذا التطبيق: $label';
  }

  @override
  String get preparingAudioAttachment => 'جارٍ تجهيز الصوت…';

  @override
  String get preparingVideoAttachment => 'جارٍ تجهيز الفيديو…';
}
