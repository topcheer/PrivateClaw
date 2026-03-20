// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => '断开连接';

  @override
  String get entryTitle => '一次性私有会话入口';

  @override
  String get inviteInputLabel => '邀请链接或二维码内容';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => '扫描二维码';

  @override
  String get connectSessionButton => '连接会话';

  @override
  String get showSessionQrButton => '显示当前二维码';

  @override
  String get sessionLabel => '会话';

  @override
  String get expiresLabel => '过期时间';

  @override
  String get initialStatus => '扫描 PrivateClaw 二维码或粘贴邀请链接，开始一次性会话。';

  @override
  String get enterValidInvite => '请输入或扫描有效的 PrivateClaw 邀请链接。';

  @override
  String get connectingRelay => '正在连接 PrivateClaw 中继服务…';

  @override
  String connectFailed(String error) {
    return '连接失败：$error';
  }

  @override
  String get encryptedChatPlaceholder => '会话连接成功后，这里会显示端到端加密的聊天记录。';

  @override
  String get sendHintActive => '发送加密消息…';

  @override
  String get sendHintInactive => '等待会话完成连接…';

  @override
  String get sendTooltip => '发送';

  @override
  String sendFailed(String error) {
    return '发送失败：$error';
  }

  @override
  String get sessionDisconnected => '会话已断开，请重新扫码以开始新的 PrivateClaw 会话。';

  @override
  String get scanSheetTitle => '扫描 PrivateClaw 邀请二维码';

  @override
  String get scanSheetHint => '如果模拟器无法扫码，也可以直接粘贴邀请链接。';

  @override
  String get scanSheetPickPhoto => '识别本地图片';

  @override
  String get scanSheetPickPhotoLoading => '正在识别图片…';

  @override
  String get scanSheetNoQrInPhoto => '所选图片中没有识别到二维码。';

  @override
  String get scanSheetPhotoUnsupported => '当前设备暂不支持从本地图片识别二维码，请直接粘贴邀请链接。';

  @override
  String get scanSheetPhotoFailed => '无法读取所选图片。';

  @override
  String get scannerPermissionDenied => '实时扫码需要相机权限。你也可以改为选择本地图片识别。';

  @override
  String get scannerUnsupported => '当前设备无法使用实时相机扫码。你可以改为选择本地图片，或直接粘贴邀请链接。';

  @override
  String get scannerUnavailable => '扫码暂时不可用。你可以改为选择本地图片，或直接粘贴邀请链接。';

  @override
  String get scannerLoading => '正在启动摄像头…';

  @override
  String get relayConnecting => '正在连接中继服务…';

  @override
  String get relayHandshake => '已连接中继服务，正在完成加密握手…';

  @override
  String relayConnectionError(String details) {
    return '连接错误：$details';
  }

  @override
  String get relaySessionClosed => '会话已关闭。';

  @override
  String relaySessionClosedWithReason(String reason) {
    return '会话已关闭：$reason';
  }

  @override
  String relayError(String details) {
    return '中继错误：$details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return '收到未知中继事件：$eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return '收到未知加密消息类型：$payloadType';
  }

  @override
  String get nonDefaultRelayWarningTitle => '自定义 relay 服务器';

  @override
  String nonDefaultRelayWarningBody(String relayLabel) {
    return '这个邀请使用的是 $relayLabel，而不是默认的 PrivateClaw relay。只有在你信任这台服务器时才继续。';
  }

  @override
  String get relayWarningCancelButton => '取消';

  @override
  String get relayWarningContinueButton => '继续';

  @override
  String get sessionQrTitle => '当前会话二维码';

  @override
  String get sessionQrHint => '请在会话过期前当面分享这个二维码。';

  @override
  String get copyInviteLinkButton => '复制邀请链接';

  @override
  String get inviteLinkCopied => '邀请链接已复制。';

  @override
  String get welcomeFallback => 'PrivateClaw 已连接。';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return '会话已续期。新的过期时间：$expiresAt（剩余 $remaining）。';
  }

  @override
  String get sessionRenewPromptTitle => '会话即将过期';

  @override
  String sessionRenewPromptBody(String remaining) {
    return '这个会话将在 $remaining 后过期。任意成员现在都可以点按钮自动发送续期命令。';
  }

  @override
  String get sessionRenewButton => '续期会话';

  @override
  String get sessionRenewButtonPending => '正在续期…';

  @override
  String groupChatSummary(int count) {
    return '群聊 • $count 位参与者';
  }

  @override
  String get groupModeLabel => '模式：群聊';

  @override
  String currentAppLabel(String label) {
    return '当前应用：$label';
  }

  @override
  String get preparingAudioAttachment => '正在准备音频…';

  @override
  String get preparingVideoAttachment => '正在准备视频…';

  @override
  String get switchToVoiceInputTooltip => '语音输入';

  @override
  String get switchToTextInputTooltip => '键盘输入';

  @override
  String get voiceRecordHoldToSend => '按住说话';

  @override
  String get voiceRecordReleaseToSend => '松开发送语音';

  @override
  String get voiceRecordSending => '正在发送语音…';

  @override
  String get voiceRecordUnavailable => '等待会话完成连接后再录音…';

  @override
  String get voiceRecordingPermissionDenied => '发送语音消息需要麦克风权限。';

  @override
  String get voiceRecordingUnsupported => '当前设备暂不支持语音录制。';

  @override
  String get voiceRecordingTooShort => '请再多按住一会儿再松开发送。';

  @override
  String get voiceRecordingTooLarge => '这条语音太大，无法直接发送。';

  @override
  String get voiceRecordingCancelled => '已取消语音录制。';

  @override
  String voiceRecordingFailed(String error) {
    return '语音录制失败：$error';
  }

  @override
  String get emojiPickerTooltip => '表情';

  @override
  String get emojiPickerTitle => '常用表情';

  @override
  String get composerExpandTooltip => '展开编辑';

  @override
  String get composerFullscreenTitle => '全屏编辑';

  @override
  String get emojiPickerFrequentTab => '常用';

  @override
  String get emojiPickerDefaultTab => '默认';

  @override
  String get photoTrayTooltip => '照片';

  @override
  String get photoTrayCameraButton => '拍照';

  @override
  String get photoTrayGalleryButton => '图库';

  @override
  String get photoTrayNoImages => '暂无照片';

  @override
  String get photoTrayAndroidRecentPhotosUnavailable =>
      '这个 Android 版本不会直接浏览最近照片；请改用“拍照”或“图库”。';

  @override
  String get photoLibraryPermissionDenied => '需要允许访问照片，才能浏览最近图片。';

  @override
  String get filePickerTooltip => '文件';

  @override
  String get voiceRecordingSlideUpToCancel => '松开发送，上滑取消';

  @override
  String get voiceRecordingReleaseToCancel => '松开取消发送';
}

/// The translations for Chinese, using the Han script (`zh_Hant`).
class AppLocalizationsZhHant extends AppLocalizationsZh {
  AppLocalizationsZhHant() : super('zh_Hant');

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => '中斷連線';

  @override
  String get entryTitle => '一次性私密會話入口';

  @override
  String get inviteInputLabel => '邀請連結或 QR 內容';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => '掃描 QR Code';

  @override
  String get connectSessionButton => '連接會話';

  @override
  String get showSessionQrButton => '顯示目前 QR Code';

  @override
  String get sessionLabel => '會話';

  @override
  String get expiresLabel => '到期時間';

  @override
  String get initialStatus => '掃描 PrivateClaw QR Code 或貼上邀請連結，即可開始一次性會話。';

  @override
  String get enterValidInvite => '請貼上或掃描有效的 PrivateClaw 邀請連結。';

  @override
  String get connectingRelay => '正在連接 PrivateClaw 中繼服務…';

  @override
  String connectFailed(String error) {
    return '連線失敗：$error';
  }

  @override
  String get encryptedChatPlaceholder => '會話連線成功後，這裡會顯示端對端加密的聊天內容。';

  @override
  String get sendHintActive => '傳送加密訊息…';

  @override
  String get sendHintInactive => '等待會話完成連線…';

  @override
  String get sendTooltip => '傳送';

  @override
  String sendFailed(String error) {
    return '傳送失敗：$error';
  }

  @override
  String get sessionDisconnected => '會話已中斷，請重新掃碼開始新的 PrivateClaw 會話。';

  @override
  String get scanSheetTitle => '掃描 PrivateClaw 邀請 QR Code';

  @override
  String get scanSheetHint => '如果模擬器無法掃碼，也可以直接貼上邀請連結。';

  @override
  String get scanSheetPickPhoto => '辨識本機圖片';

  @override
  String get scanSheetPickPhotoLoading => '正在辨識圖片…';

  @override
  String get scanSheetNoQrInPhoto => '所選圖片中沒有偵測到 QR Code。';

  @override
  String get scanSheetPhotoUnsupported => '此裝置暫不支援從本機圖片辨識 QR Code，請直接貼上邀請連結。';

  @override
  String get scanSheetPhotoFailed => '無法讀取所選圖片。';

  @override
  String get scannerPermissionDenied => '即時掃碼需要相機權限。你也可以改為選擇本機圖片辨識。';

  @override
  String get scannerUnsupported => '此裝置無法使用即時相機掃碼。你可以改為選擇本機圖片，或直接貼上邀請連結。';

  @override
  String get scannerUnavailable => '掃碼功能暫時不可用。你可以改為選擇本機圖片，或直接貼上邀請連結。';

  @override
  String get scannerLoading => '正在啟動相機…';

  @override
  String get relayConnecting => '正在連接中繼服務…';

  @override
  String get relayHandshake => '已連接中繼服務，正在完成加密握手…';

  @override
  String relayConnectionError(String details) {
    return '連線錯誤：$details';
  }

  @override
  String get relaySessionClosed => '會話已關閉。';

  @override
  String relaySessionClosedWithReason(String reason) {
    return '會話已關閉：$reason';
  }

  @override
  String relayError(String details) {
    return '中繼錯誤：$details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return '收到未知的中繼事件：$eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return '收到未知的加密訊息類型：$payloadType';
  }

  @override
  String get sessionQrTitle => '目前工作階段 QR Code';

  @override
  String get sessionQrHint => '請在工作階段到期前當面分享這個 QR Code。';

  @override
  String get copyInviteLinkButton => '複製邀請連結';

  @override
  String get inviteLinkCopied => '邀請連結已複製。';

  @override
  String get welcomeFallback => 'PrivateClaw 已連線。';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return '工作階段已續期。新的到期時間：$expiresAt（剩餘 $remaining）。';
  }

  @override
  String get sessionRenewPromptTitle => '工作階段即將到期';

  @override
  String sessionRenewPromptBody(String remaining) {
    return '這個工作階段將在 $remaining 後到期。任何成員現在都可以點按按鈕自動送出續期指令。';
  }

  @override
  String get sessionRenewButton => '續期工作階段';

  @override
  String get sessionRenewButtonPending => '續期中…';

  @override
  String groupChatSummary(int count) {
    return '群聊 • $count 位參與者';
  }

  @override
  String get groupModeLabel => '模式：群聊';

  @override
  String currentAppLabel(String label) {
    return '目前應用程式：$label';
  }

  @override
  String get preparingAudioAttachment => '正在準備音訊…';

  @override
  String get preparingVideoAttachment => '正在準備影片…';

  @override
  String get switchToVoiceInputTooltip => '語音輸入';

  @override
  String get switchToTextInputTooltip => '鍵盤輸入';

  @override
  String get voiceRecordHoldToSend => '按住說話';

  @override
  String get voiceRecordReleaseToSend => '放開立即傳送語音';

  @override
  String get voiceRecordSending => '正在傳送語音…';

  @override
  String get voiceRecordUnavailable => '請等待會話完成連線後再錄音…';

  @override
  String get voiceRecordingPermissionDenied => '傳送語音訊息需要麥克風權限。';

  @override
  String get voiceRecordingUnsupported => '此裝置暫不支援語音錄製。';

  @override
  String get voiceRecordingTooShort => '請再多按住一會兒再放開傳送。';

  @override
  String get voiceRecordingTooLarge => '這段語音太大，無法直接傳送。';

  @override
  String get voiceRecordingCancelled => '已取消語音錄製。';

  @override
  String voiceRecordingFailed(String error) {
    return '語音錄製失敗：$error';
  }

  @override
  String get emojiPickerTooltip => '表情';

  @override
  String get emojiPickerTitle => '常用表情';

  @override
  String get composerExpandTooltip => '展開編輯';

  @override
  String get composerFullscreenTitle => '全螢幕編輯';

  @override
  String get emojiPickerFrequentTab => '常用';

  @override
  String get emojiPickerDefaultTab => '預設';

  @override
  String get photoTrayTooltip => '照片';

  @override
  String get photoTrayCameraButton => '拍照';

  @override
  String get photoTrayGalleryButton => '圖庫';

  @override
  String get photoTrayNoImages => '暫無照片';

  @override
  String get photoLibraryPermissionDenied => '需要允許存取照片，才能瀏覽最近圖片。';

  @override
  String get filePickerTooltip => '檔案';

  @override
  String get voiceRecordingSlideUpToCancel => '鬆開傳送，上滑取消';

  @override
  String get voiceRecordingReleaseToCancel => '鬆開取消傳送';
}
