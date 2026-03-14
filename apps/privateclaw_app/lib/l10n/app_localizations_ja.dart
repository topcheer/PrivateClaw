// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Japanese (`ja`).
class AppLocalizationsJa extends AppLocalizations {
  AppLocalizationsJa([String locale = 'ja']) : super(locale);

  @override
  String get appTitle => 'PrivateClaw';

  @override
  String get disconnectTooltip => '切断';

  @override
  String get entryTitle => 'ワンタイムのプライベートセッション';

  @override
  String get inviteInputLabel => '招待リンクまたは QR ペイロード';

  @override
  String get inviteInputHint => 'privateclaw://connect?payload=...';

  @override
  String get scanQrButton => 'QR コードをスキャン';

  @override
  String get connectSessionButton => 'セッションに接続';

  @override
  String get showSessionQrButton => 'Show current QR';

  @override
  String get sessionLabel => 'セッション';

  @override
  String get expiresLabel => '有効期限';

  @override
  String get initialStatus =>
      'PrivateClaw の QR コードをスキャンするか招待リンクを貼り付けて、ワンタイムセッションを開始します。';

  @override
  String get enterValidInvite => '有効な PrivateClaw 招待リンクを貼り付けるかスキャンしてください。';

  @override
  String get connectingRelay => 'PrivateClaw リレーに接続しています…';

  @override
  String connectFailed(String error) {
    return '接続に失敗しました: $error';
  }

  @override
  String get encryptedChatPlaceholder =>
      'セッションの接続が完了すると、エンドツーエンドで暗号化されたチャットがここに表示されます。';

  @override
  String get sendHintActive => '暗号化メッセージを送信…';

  @override
  String get sendHintInactive => 'セッション接続の完了を待っています…';

  @override
  String get sendTooltip => '送信';

  @override
  String sendFailed(String error) {
    return '送信に失敗しました: $error';
  }

  @override
  String get sessionDisconnected =>
      'セッションが切断されました。新しい PrivateClaw セッションを開始するには再度スキャンしてください。';

  @override
  String get scanSheetTitle => 'PrivateClaw 招待 QR コードをスキャン';

  @override
  String get scanSheetHint => 'シミュレータでスキャンできない場合は、代わりに招待リンクを貼り付けてください。';

  @override
  String get scannerPermissionDenied => '招待 QR コードをスキャンするにはカメラ権限が必要です。';

  @override
  String get scannerUnsupported =>
      'このデバイスまたはシミュレータではカメラのスキャンを利用できません。代わりに招待リンクを貼り付けてください。';

  @override
  String get scannerUnavailable => 'QR スキャンを現在利用できません。代わりに招待リンクを貼り付けてください。';

  @override
  String get scannerLoading => 'カメラを起動しています…';

  @override
  String get relayConnecting => 'リレーに接続しています…';

  @override
  String get relayHandshake => 'リレーに接続しました。暗号化ハンドシェイクを完了しています…';

  @override
  String relayConnectionError(String details) {
    return '接続エラー: $details';
  }

  @override
  String get relaySessionClosed => 'セッションが終了しました。';

  @override
  String relaySessionClosedWithReason(String reason) {
    return 'セッションが終了しました: $reason';
  }

  @override
  String relayError(String details) {
    return 'リレーエラー: $details';
  }

  @override
  String relayUnknownEvent(String eventType) {
    return '不明なリレーイベントを受信しました: $eventType';
  }

  @override
  String relayUnknownPayload(String payloadType) {
    return '不明な暗号化メッセージ種別を受信しました: $payloadType';
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
  String get welcomeFallback => 'PrivateClaw に接続しました。';

  @override
  String sessionRenewedNotice(String expiresAt, String remaining) {
    return 'Session renewed. New expiry: $expiresAt ($remaining left).';
  }

  @override
  String groupChatSummary(int count) {
    return 'グループチャット • $count 人';
  }

  @override
  String get groupModeLabel => 'モード: グループチャット';

  @override
  String currentAppLabel(String label) {
    return 'このアプリ: $label';
  }

  @override
  String get preparingAudioAttachment => '音声を準備しています…';

  @override
  String get preparingVideoAttachment => '動画を準備しています…';
}
