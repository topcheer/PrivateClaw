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
  String get scannerPermissionDenied => '需要相机权限才能扫描邀请二维码。';

  @override
  String get scannerUnsupported => '当前设备或模拟器无法提供摄像头扫描，请直接粘贴邀请链接。';

  @override
  String get scannerUnavailable => '扫码暂时不可用，请直接粘贴邀请链接。';

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
  String get welcomeFallback => 'PrivateClaw 已连接。';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return '会话已续期。新的过期时间：$expiresAt（剩余 $remaining）。';
  }
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
  String get scannerPermissionDenied => '需要相機權限才能掃描邀請 QR Code。';

  @override
  String get scannerUnsupported => '此裝置或模擬器無法提供相機掃描，請直接貼上邀請連結。';

  @override
  String get scannerUnavailable => '掃碼功能暫時不可用，請直接貼上邀請連結。';

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
  String get welcomeFallback => 'PrivateClaw 已連線。';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return '工作階段已續期。新的到期時間：$expiresAt（剩餘 $remaining）。';
  }
}
