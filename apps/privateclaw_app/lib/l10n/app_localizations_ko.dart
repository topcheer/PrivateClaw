// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Korean (`ko`).
class AppLocalizationsKo extends AppLocalizations {
  AppLocalizationsKo([String locale = 'ko']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => '연결 끊기';

  @override
  String get entryTitle => '일회성 비공개 세션';

  @override
  String get inviteInputLabel => '초대 링크 또는 QR 페이로드';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'QR 코드 스캔';

  @override
  String get connectSessionButton => '세션 연결';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => '세션';

  @override
  String get expiresLabel => '만료 시간';

  @override
  String get initialStatus =>
      'PrivateClaw QR 코드를 스캔하거나 초대 링크를 붙여 넣어 일회성 세션을 시작하세요.';

  @override
  String get enterValidInvite => '유효한 PrivateClaw 초대 링크를 붙여 넣거나 스캔하세요.';

  @override
  String get connectingRelay => 'PrivateClaw 릴레이에 연결하는 중…';

  @override
  String connectFailed(String error) {
    return '연결 실패: $error';
  }

  @override
  String get encryptedChatPlaceholder => '세션이 연결되면 종단간 암호화된 대화가 여기에 표시됩니다.';

  @override
  String get sendHintActive => '암호화된 메시지 보내기…';

  @override
  String get sendHintInactive => '세션 연결이 완료되기를 기다리는 중…';

  @override
  String get sendTooltip => '보내기';

  @override
  String sendFailed(String error) {
    return '전송 실패: $error';
  }

  @override
  String get sessionDisconnected =>
      '세션 연결이 끊어졌습니다. 새 PrivateClaw 세션을 시작하려면 다시 스캔하세요.';

  @override
  String get scanSheetTitle => 'PrivateClaw 초대 QR 코드 스캔';

  @override
  String get scanSheetHint => '시뮬레이터에서 스캔할 수 없으면 초대 링크를 직접 붙여 넣으세요.';

  @override
  String get scanSheetPickPhoto => '사진에서 읽기';

  @override
  String get scanSheetPickPhotoLoading => '사진을 읽는 중…';

  @override
  String get scanSheetNoQrInPhoto => '선택한 사진에서 QR 코드를 찾지 못했습니다.';

  @override
  String get scanSheetPhotoUnsupported =>
      '이 기기에서는 저장된 사진에서 QR 코드를 읽을 수 없습니다. 초대 링크를 붙여 넣으세요.';

  @override
  String get scanSheetPhotoFailed => '선택한 사진을 읽을 수 없습니다.';

  @override
  String get scannerPermissionDenied =>
      '실시간 QR 스캔에는 카메라 권한이 필요합니다. 대신 사진을 선택해 읽을 수도 있습니다.';

  @override
  String get scannerUnsupported =>
      '여기서는 실시간 카메라 스캔을 사용할 수 없습니다. 사진을 선택하거나 초대 링크를 붙여 넣으세요.';

  @override
  String get scannerUnavailable =>
      'QR 스캔을 지금 사용할 수 없습니다. 사진을 선택하거나 초대 링크를 붙여 넣으세요.';

  @override
  String get scannerLoading => '카메라를 시작하는 중…';

  @override
  String get relayConnecting => '릴레이에 연결하는 중…';

  @override
  String get relayHandshake => '릴레이에 연결되었습니다. 암호화 핸드셰이크를 마무리하는 중…';

  @override
  String relayConnectionError(String details) {
    return '연결 오류: $details';
  }

  @override
  String get relaySessionClosed => '세션이 종료되었습니다.';

  @override
  String relaySessionClosedWithReason(String reason) {
    return '세션이 종료되었습니다: $reason';
  }

  @override
  String relayError(String details) {
    return '릴레이 오류: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return '알 수 없는 릴레이 이벤트를 받았습니다: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return '알 수 없는 암호화 메시지 유형을 받았습니다: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw에 연결되었습니다.';

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
    return '그룹 채팅 • 참가자 $count명';
  }

  @override
  String get groupModeLabel => '모드: 그룹 채팅';

  @override
  String currentAppLabel(String label) {
    return '이 앱: $label';
  }

  @override
  String get preparingAudioAttachment => '오디오 준비 중…';

  @override
  String get preparingVideoAttachment => '비디오 준비 중…';

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
