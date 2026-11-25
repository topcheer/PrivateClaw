// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'Hearth Room';

  @override
  String get disconnectTooltip => 'قطع الاتصال';

  @override
  String get disconnectConfirmTitle => 'هل تريد مغادرة هذه الغرفة؟';

  @override
  String get disconnectConfirmBody =>
      'ستحتاج إلى دعوة جديدة للعودة، وسيتم مسح الرسائل على هذا الجهاز.';

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
  String get savedSessionsButton => 'Saved sessions';

  @override
  String get savedSessionsTitle => 'Saved sessions';

  @override
  String get savedSessionsEmpty => 'No saved sessions yet.';

  @override
  String get sessionSectionRoom => 'الغرفة';

  @override
  String get sessionSectionMembers => 'الأعضاء';

  @override
  String get sessionSectionActions => 'الإجراءات';

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
  String get emptyStateTitle => 'امسح دعوتك الأولى';

  @override
  String get emptyStateBody =>
      'يُنشئ PrivateClaw الغرف على حاسوبك. شغّل /privateclaw هناك، ثم امسح رمز QR لمرة واحدة الذي يعرضه، أو الصق رابط الدعوة في الأعلى.';

  @override
  String get getPrivateClawButton => 'احصل على PrivateClaw لسطح المكتب';

  @override
  String get sendHintActive => 'إرسال رسالة مشفرة…';

  @override
  String get sendHintInactive => 'انتظر حتى يكتمل اتصال الجلسة…';

  @override
  String get sendHintIdle => 'انضم إلى غرفة لبدء الدردشة…';

  @override
  String get connectStepRelay => 'الوسيط';

  @override
  String get connectStepHandshake => 'المصافحة';

  @override
  String get connectStepJoined => 'تم الانضمام';

  @override
  String get connectCancelled =>
      'تم الإلغاء. امسح دعوة أو الصقها عندما تكون مستعدًا.';

  @override
  String inviteExpired(String ago) {
    return 'انتهت صلاحية هذه الدعوة منذ $ago. اطلب من المضيف دعوة جديدة.';
  }

  @override
  String connectErrorRefused(String relay) {
    return 'رفض الوسيط $relay الاتصال. تأكد من أنه يعمل وحاول مرة أخرى.';
  }

  @override
  String connectErrorNetwork(String relay) {
    return 'تعذر الوصول إلى $relay. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.';
  }

  @override
  String connectErrorTimeout(String relay) {
    return 'لم يستجب $relay في الوقت المحدد. حاول مرة أخرى بعد قليل.';
  }

  @override
  String connectStillTrying(String relay) {
    return 'لا يزال يحاول الوصول إلى $relay. تحقق من أنه متصل ومن أن شبكتك تعمل.';
  }

  @override
  String get connectErrorSessionExpired =>
      'انتهت صلاحية هذه الغرفة. اطلب من المضيف دعوة جديدة.';

  @override
  String get connectErrorSessionNotFound =>
      'هذه الغرفة لم تعد موجودة. اطلب من المضيف دعوة جديدة.';

  @override
  String get connectErrorInvalidKey =>
      'مفتاح الدعوة لا يطابق هذه الغرفة. اطلب من المضيف دعوة جديدة.';

  @override
  String get connectErrorRateLimited =>
      'محاولات كثيرة جدًا. انتظر دقيقة قبل المحاولة مرة أخرى.';

  @override
  String get dateToday => 'اليوم';

  @override
  String get dateYesterday => 'أمس';

  @override
  String get notificationExplainerTitle => 'احصل على إشعار بالردود';

  @override
  String get notificationExplainerBody =>
      'يمكن لـ Hearth Room إشعارك عندما يرد مساعدك أو أحد أعضاء الغرفة أثناء عمل التطبيق في الخلفية. سيطلب النظام الإذن بعد قليل، ويمكنك تخطيه في الوقت الحالي.';

  @override
  String get notificationExplainerEnable => 'تفعيل الإشعارات';

  @override
  String get notificationExplainerLater => 'ليس الآن';

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
  String get sendShortcutHintMac => '⌘⏎ للإرسال';

  @override
  String get sendShortcutHintControl => 'Ctrl+⏎ للإرسال';

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
  String get assistantMessageAiGeneratedLabel => 'AI-generated';

  @override
  String get assistantMessageReportInappropriateContent =>
      'Report inappropriate content';

  @override
  String get voiceRecordingSlideUpToCancel =>
      'Release to send · slide up to cancel';

  @override
  String get voiceRecordingReleaseToCancel => 'Release to cancel';
}
