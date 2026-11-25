// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class AppLocalizationsVi extends AppLocalizations {
  AppLocalizationsVi([String locale = 'vi']) : super(locale);

  @override
  String get appTitle => 'Hearth Room';

  @override
  String get disconnectTooltip => 'Ngắt kết nối';

  @override
  String get disconnectConfirmTitle => 'Rời khỏi phòng này?';

  @override
  String get disconnectConfirmBody =>
      'Bạn sẽ cần lời mời mới để quay lại và các tin nhắn trên thiết bị này sẽ bị xóa.';

  @override
  String get entryTitle => 'Phiên riêng tư dùng một lần';

  @override
  String get inviteInputLabel => 'Liên kết mời hoặc nội dung QR';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'Quét mã QR';

  @override
  String get connectSessionButton => 'Tham gia phiên';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get savedSessionsButton => 'Saved sessions';

  @override
  String get savedSessionsTitle => 'Saved sessions';

  @override
  String get savedSessionsEmpty => 'No saved sessions yet.';

  @override
  String get sessionLabel => 'Phiên';

  @override
  String get expiresLabel => 'Hết hạn';

  @override
  String get initialStatus =>
      'Quét mã QR PrivateClaw hoặc dán liên kết mời để bắt đầu một phiên dùng một lần.';

  @override
  String get enterValidInvite =>
      'Dán hoặc quét liên kết mời PrivateClaw hợp lệ.';

  @override
  String get connectingRelay => 'Đang kết nối tới relay PrivateClaw…';

  @override
  String connectFailed(String error) {
    return 'Kết nối thất bại: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'Đoạn chat được mã hóa đầu cuối sẽ xuất hiện ở đây sau khi phiên kết nối.';

  @override
  String get emptyStateTitle => 'Quét lời mời đầu tiên';

  @override
  String get emptyStateBody =>
      'Phòng được tạo bởi PrivateClaw trên máy tính của bạn. Chạy /privateclaw ở đó rồi quét mã QR dùng một lần được hiển thị, hoặc dán liên kết mời ở trên.';

  @override
  String get getPrivateClawButton => 'Tải PrivateClaw cho máy tính';

  @override
  String get sendHintActive => 'Gửi tin nhắn được mã hóa…';

  @override
  String get sendHintInactive => 'Chờ phiên hoàn tất kết nối…';

  @override
  String get sendHintIdle => 'Tham gia phòng để bắt đầu trò chuyện…';

  @override
  String get connectStepRelay => 'Relay';

  @override
  String get connectStepHandshake => 'Bắt tay';

  @override
  String get connectStepJoined => 'Đã vào';

  @override
  String get connectCancelled =>
      'Đã hủy. Quét hoặc dán lời mời khi bạn sẵn sàng.';

  @override
  String inviteExpired(String ago) {
    return 'Lời mời này đã hết hạn $ago trước. Hãy nhờ người tạo phòng cấp lời mời mới.';
  }

  @override
  String connectErrorRefused(String relay) {
    return 'Relay $relay đã từ chối kết nối. Hãy kiểm tra nó đang chạy rồi thử lại.';
  }

  @override
  String connectErrorNetwork(String relay) {
    return 'Không thể truy cập $relay. Hãy kiểm tra kết nối internet rồi thử lại.';
  }

  @override
  String connectErrorTimeout(String relay) {
    return '$relay không phản hồi kịp thời. Hãy thử lại sau một lát.';
  }

  @override
  String connectStillTrying(String relay) {
    return 'Vẫn đang thử kết nối tới $relay. Hãy kiểm tra relay đang trực tuyến và mạng của bạn hoạt động.';
  }

  @override
  String get connectErrorSessionExpired =>
      'Phòng này đã hết hạn. Hãy nhờ người tạo phòng cấp lời mời mới.';

  @override
  String get connectErrorSessionNotFound =>
      'Phòng này không còn tồn tại. Hãy nhờ người tạo phòng cấp lời mời mới.';

  @override
  String get connectErrorInvalidKey =>
      'Khóa lời mời không khớp với phòng này. Hãy nhờ người tạo phòng cấp lời mời mới.';

  @override
  String get connectErrorRateLimited =>
      'Thử quá nhiều lần. Hãy đợi một phút rồi thử lại.';

  @override
  String get dateToday => 'Hôm nay';

  @override
  String get dateYesterday => 'Hôm qua';

  @override
  String get notificationExplainerTitle => 'Nhận thông báo khi có trả lời';

  @override
  String get notificationExplainerBody =>
      'Hearth Room có thể thông báo cho bạn khi trợ lý hoặc ai đó trong phòng trả lời trong khi ứng dụng ở chế độ nền. Hệ thống sẽ xin quyền ngay sau đây; bạn cũng có thể bỏ qua lúc này.';

  @override
  String get notificationExplainerEnable => 'Bật thông báo';

  @override
  String get notificationExplainerLater => 'Để sau';

  @override
  String get sendTooltip => 'Gửi';

  @override
  String sendFailed(String error) {
    return 'Gửi thất bại: $error';
  }

  @override
  String get sessionDisconnected =>
      'Phiên đã ngắt kết nối. Hãy quét lại để bắt đầu một phiên PrivateClaw mới.';

  @override
  String get scanSheetTitle => 'Quét QR mời PrivateClaw';

  @override
  String get scanSheetHint =>
      'Nếu trình mô phỏng không thể quét, hãy dán liên kết mời trực tiếp.';

  @override
  String get scanSheetPickPhoto => 'Đọc từ ảnh';

  @override
  String get scanSheetPickPhotoLoading => 'Đang đọc ảnh…';

  @override
  String get scanSheetNoQrInPhoto => 'Không tìm thấy mã QR trong ảnh đã chọn.';

  @override
  String get scanSheetPhotoUnsupported =>
      'Thiết bị này chưa thể đọc mã QR từ ảnh đã lưu. Hãy dán liên kết mời.';

  @override
  String get scanSheetPhotoFailed => 'Không thể đọc ảnh đã chọn.';

  @override
  String get scannerPermissionDenied =>
      'Cần quyền camera để quét QR trực tiếp. Bạn cũng có thể chọn ảnh thay thế.';

  @override
  String get scannerUnsupported =>
      'Không thể quét camera trực tiếp tại đây. Hãy chọn ảnh hoặc dán liên kết mời.';

  @override
  String get scannerUnavailable =>
      'Tạm thời không thể quét QR. Hãy chọn ảnh hoặc dán liên kết mời.';

  @override
  String get scannerLoading => 'Đang khởi động camera…';

  @override
  String get relayConnecting => 'Đang kết nối tới relay…';

  @override
  String get relayHandshake =>
      'Đã kết nối relay. Đang hoàn tất bắt tay mã hóa…';

  @override
  String relayConnectionError(String details) {
    return 'Lỗi kết nối: $details';
  }

  @override
  String get relaySessionClosed => 'Phiên đã đóng.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'Phiên đã đóng: $reason';
  }

  @override
  String relayError(String details) {
    return 'Lỗi relay: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return 'Nhận được sự kiện relay không xác định: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return 'Nhận được loại tin nhắn mã hóa không xác định: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw đã kết nối.';

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
    return 'Trò chuyện nhóm • $count người tham gia';
  }

  @override
  String get groupModeLabel => 'Chế độ: trò chuyện nhóm';

  @override
  String currentAppLabel(String label) {
    return 'Ứng dụng này: $label';
  }

  @override
  String get preparingAudioAttachment => 'Đang chuẩn bị âm thanh…';

  @override
  String get preparingVideoAttachment => 'Đang chuẩn bị video…';

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
