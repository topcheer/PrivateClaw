import 'package:flutter/material.dart';

import 'models/chat_attachment.dart';
import 'models/chat_message.dart';
import 'models/privateclaw_identity.dart';
import 'models/privateclaw_invite.dart';
import 'models/privateclaw_participant.dart';
import 'models/privateclaw_slash_command.dart';
import 'services/privateclaw_session_client.dart';

class StoreScreenshotConfig {
  const StoreScreenshotConfig({this.previewData, this.localeOverride});

  factory StoreScreenshotConfig.fromEnvironment() {
    const String scenario = String.fromEnvironment(
      'PRIVATECLAW_SCREENSHOT_SCENARIO',
    );
    const String localeTag = String.fromEnvironment(
      'PRIVATECLAW_SCREENSHOT_LOCALE',
    );
    final Locale? localeOverride = _parseLocaleTag(localeTag);
    return StoreScreenshotConfig(
      previewData: screenshotPreviewDataForScenario(scenario, localeOverride),
      localeOverride: localeOverride,
    );
  }

  final PrivateClawPreviewData? previewData;
  final Locale? localeOverride;
}

class PrivateClawPreviewData {
  const PrivateClawPreviewData({
    required this.status,
    required this.statusText,
    this.invite,
    this.inviteInput = '',
    this.identity,
    this.isPairingPanelCollapsed = false,
    this.participants = const <PrivateClawParticipant>[],
    this.availableCommands = const <PrivateClawSlashCommand>[],
    this.messages = const <ChatMessage>[],
    this.selectedAttachments = const <ChatAttachment>[],
    this.composerDraftText = '',
  });

  final PrivateClawInvite? invite;
  final String inviteInput;
  final PrivateClawIdentity? identity;
  final PrivateClawSessionStatus status;
  final String statusText;
  final bool isPairingPanelCollapsed;
  final List<PrivateClawParticipant> participants;
  final List<PrivateClawSlashCommand> availableCommands;
  final List<ChatMessage> messages;
  final List<ChatAttachment> selectedAttachments;
  final String composerDraftText;
}

class _PreviewStrings {
  const _PreviewStrings({
    required this.welcomeStatus,
    required this.groupStatus,
    required this.groupJoinNotice,
    required this.groupQuestion,
    required this.groupAssistantSummary,
    required this.groupFollowup,
    required this.groupRenewalNotice,
    required this.richStatus,
    required this.richRequest,
    required this.richAssistantSummary,
    required this.richDraft,
    required this.runbookPdfName,
    required this.summaryMdName,
    required this.checklistPdfName,
    required this.handoffNotesMdName,
  });

  final String welcomeStatus;
  final String groupStatus;
  final String groupJoinNotice;
  final String groupQuestion;
  final String groupAssistantSummary;
  final String groupFollowup;
  final String groupRenewalNotice;
  final String richStatus;
  final String richRequest;
  final String richAssistantSummary;
  final String richDraft;
  final String runbookPdfName;
  final String summaryMdName;
  final String checklistPdfName;
  final String handoffNotesMdName;
}

const Map<String, _PreviewStrings>
_previewStringsByLocale = <String, _PreviewStrings>{
  'en': _PreviewStrings(
    welcomeStatus:
        'Scan a one-time QR code or paste an invite to start a private encrypted chat.',
    groupStatus:
        'Encrypted group chat is active. 3 members connected, 7h 48m remaining.',
    groupJoinNotice: 'Aria joined the encrypted room.',
    groupQuestion:
        'Can you check relay health and whether we should renew before standup?',
    groupAssistantSummary:
        '**Relay health**\n\n- End-to-end encryption is active.\n- The relay only routes ciphertext.\n- 3 participants are connected.\n\nThe room expires in **28 minutes**. Any member can use `/renew-session` to extend it by 8 hours.',
    groupFollowup: 'Perfect. Keep this room open for the evening handoff.',
    groupRenewalNotice:
        'Renewal reminder: this session has less than 30 minutes remaining.',
    richStatus:
        'Encrypted attachments are ready. Markdown, images, and files stay inside the private session.',
    richRequest:
        'Please review the handoff assets before upload and keep the summary short enough for a voice note.',
    richAssistantSummary:
        '**Ready for handoff**\n\n- The release runbook is attached.\n- The topology preview is rendered inline.\n- You can use `/tts` to turn the summary into a private voice note.',
    richDraft: '/tts Draft a 15 second encrypted handoff summary',
    runbookPdfName: 'release-runbook.pdf',
    summaryMdName: 'summary.md',
    checklistPdfName: 'release-checklist.pdf',
    handoffNotesMdName: 'handoff-notes.md',
  ),
  'ar': _PreviewStrings(
    welcomeStatus:
        'امسح رمز QR لمرة واحدة أو الصق دعوة لبدء محادثة خاصة مشفرة.',
    groupStatus: 'الدردشة الجماعية المشفرة نشطة. 3 أعضاء متصلون ويتبقى 7س 48د.',
    groupJoinNotice: 'انضمت Aria إلى الغرفة المشفرة.',
    groupQuestion:
        'هل يمكنك فحص حالة الوسيط وهل نحتاج إلى التجديد قبل اجتماع الصباح؟',
    groupAssistantSummary:
        '**حالة الوسيط**\n\n- التشفير من الطرف إلى الطرف مفعّل.\n- الوسيط يمرر النص المشفر فقط.\n- يوجد 3 مشاركين متصلين.\n\nتنتهي الغرفة خلال **28 دقيقة**. يمكن لأي عضو استخدام `/renew-session` لتمديدها 8 ساعات.',
    groupFollowup: 'ممتاز. أبقِ هذه الغرفة مفتوحة لتسليم المساء.',
    groupRenewalNotice: 'تذكير بالتجديد: يتبقى أقل من 30 دقيقة على هذه الجلسة.',
    richStatus:
        'المرفقات المشفرة جاهزة. تظل ملفات Markdown والصور والملفات داخل الجلسة الخاصة.',
    richRequest:
        'يرجى مراجعة ملفات التسليم قبل الرفع وإبقاء الملخص قصيرًا بما يكفي لملاحظة صوتية.',
    richAssistantSummary:
        '**جاهز للتسليم**\n\n- دليل الإصدار مرفق.\n- معاينة البنية تظهر داخل المحادثة.\n- يمكنك استخدام `/tts` لتحويل الملخص إلى ملاحظة صوتية خاصة.',
    richDraft: '/tts أنشئ ملخص تسليم مشفرًا لمدة 15 ثانية',
    runbookPdfName: 'دليل-الإصدار.pdf',
    summaryMdName: 'ملخص.md',
    checklistPdfName: 'قائمة-فحص-الإصدار.pdf',
    handoffNotesMdName: 'ملاحظات-التسليم.md',
  ),
  'de': _PreviewStrings(
    welcomeStatus:
        'Scanne einen Einmal-QR-Code oder füge eine Einladung ein, um einen privaten verschlüsselten Chat zu starten.',
    groupStatus:
        'Der verschlüsselte Gruppenchat ist aktiv. 3 Mitglieder verbunden, noch 7 Std. 48 Min.',
    groupJoinNotice: 'Aria ist dem verschlüsselten Raum beigetreten.',
    groupQuestion:
        'Kannst du die Relay-Gesundheit prüfen und sagen, ob wir vor dem Stand-up erneuern sollten?',
    groupAssistantSummary:
        '**Relay-Status**\n\n- Ende-zu-Ende-Verschlüsselung ist aktiv.\n- Das Relay leitet nur Chiffretext weiter.\n- 3 Teilnehmende sind verbunden.\n\nDer Raum läuft in **28 Minuten** ab. Jedes Mitglied kann `/renew-session` nutzen, um ihn um 8 Stunden zu verlängern.',
    groupFollowup: 'Perfekt. Lass diesen Raum für die Abendübergabe offen.',
    groupRenewalNotice:
        'Erinnerung: Für diese Sitzung verbleiben weniger als 30 Minuten.',
    richStatus:
        'Verschlüsselte Anhänge sind bereit. Markdown, Bilder und Dateien bleiben in der privaten Sitzung.',
    richRequest:
        'Bitte prüfe die Übergabe-Dateien vor dem Upload und halte die Zusammenfassung kurz genug für eine Sprachnotiz.',
    richAssistantSummary:
        '**Bereit zur Übergabe**\n\n- Das Release-Runbook ist angehängt.\n- Die Topologie-Vorschau wird inline gerendert.\n- Du kannst `/tts` verwenden, um die Zusammenfassung in eine private Sprachnotiz umzuwandeln.',
    richDraft: '/tts Erstelle eine 15-sekündige verschlüsselte Übergabe',
    runbookPdfName: 'release-runbook.pdf',
    summaryMdName: 'zusammenfassung.md',
    checklistPdfName: 'release-checkliste.pdf',
    handoffNotesMdName: 'uebergabe-notizen.md',
  ),
  'es': _PreviewStrings(
    welcomeStatus:
        'Escanea un código QR de un solo uso o pega una invitación para iniciar un chat privado cifrado.',
    groupStatus:
        'El chat grupal cifrado está activo. 3 miembros conectados, quedan 7 h 48 min.',
    groupJoinNotice: 'Aria se unió a la sala cifrada.',
    groupQuestion:
        '¿Puedes revisar la salud del relay y decir si debemos renovar antes del standup?',
    groupAssistantSummary:
        '**Estado del relay**\n\n- El cifrado de extremo a extremo está activo.\n- El relay solo enruta texto cifrado.\n- Hay 3 participantes conectados.\n\nLa sala vence en **28 minutos**. Cualquier miembro puede usar `/renew-session` para ampliarla 8 horas.',
    groupFollowup:
        'Perfecto. Mantén esta sala abierta para el relevo de la noche.',
    groupRenewalNotice:
        'Recordatorio de renovación: esta sesión tiene menos de 30 minutos restantes.',
    richStatus:
        'Los adjuntos cifrados están listos. Markdown, imágenes y archivos permanecen dentro de la sesión privada.',
    richRequest:
        'Revisa los recursos de relevo antes de subirlos y deja el resumen lo bastante corto para una nota de voz.',
    richAssistantSummary:
        '**Listo para el relevo**\n\n- El runbook de lanzamiento está adjunto.\n- La vista previa de topología se renderiza en línea.\n- Puedes usar `/tts` para convertir el resumen en una nota de voz privada.',
    richDraft: '/tts Redacta un resumen cifrado de relevo de 15 segundos',
    runbookPdfName: 'guia-lanzamiento.pdf',
    summaryMdName: 'resumen.md',
    checklistPdfName: 'checklist-lanzamiento.pdf',
    handoffNotesMdName: 'notas-relevo.md',
  ),
  'fr': _PreviewStrings(
    welcomeStatus:
        'Scannez un QR code à usage unique ou collez une invitation pour démarrer une discussion privée chiffrée.',
    groupStatus:
        'La discussion de groupe chiffrée est active. 3 membres connectés, 7 h 48 restantes.',
    groupJoinNotice: 'Aria a rejoint la salle chiffrée.',
    groupQuestion:
        'Peux-tu vérifier la santé du relais et dire s’il faut renouveler avant le stand-up ?',
    groupAssistantSummary:
        '**Santé du relais**\n\n- Le chiffrement de bout en bout est actif.\n- Le relais ne transporte que du texte chiffré.\n- 3 participants sont connectés.\n\nLa salle expire dans **28 minutes**. N’importe quel membre peut utiliser `/renew-session` pour la prolonger de 8 heures.',
    groupFollowup:
        'Parfait. Garde cette salle ouverte pour la passation du soir.',
    groupRenewalNotice:
        'Rappel de renouvellement : il reste moins de 30 minutes à cette session.',
    richStatus:
        'Les pièces jointes chiffrées sont prêtes. Markdown, images et fichiers restent dans la session privée.',
    richRequest:
        'Merci de vérifier les fichiers de passation avant l’envoi et de garder le résumé assez court pour une note vocale.',
    richAssistantSummary:
        '**Prêt pour la passation**\n\n- Le guide de release est joint.\n- L’aperçu de topologie est rendu en ligne.\n- Vous pouvez utiliser `/tts` pour transformer le résumé en note vocale privée.',
    richDraft: '/tts Rédige un résumé chiffré de passation de 15 secondes',
    runbookPdfName: 'guide-release.pdf',
    summaryMdName: 'resume.md',
    checklistPdfName: 'checklist-release.pdf',
    handoffNotesMdName: 'notes-passation.md',
  ),
  'id': _PreviewStrings(
    welcomeStatus:
        'Pindai kode QR sekali pakai atau tempel undangan untuk memulai chat pribadi terenkripsi.',
    groupStatus:
        'Obrolan grup terenkripsi aktif. 3 anggota terhubung, sisa 7j 48m.',
    groupJoinNotice: 'Aria bergabung ke ruang terenkripsi.',
    groupQuestion:
        'Bisakah kamu cek kesehatan relay dan apakah kita perlu memperpanjang sebelum standup?',
    groupAssistantSummary:
        '**Kesehatan relay**\n\n- Enkripsi end-to-end aktif.\n- Relay hanya meneruskan ciphertext.\n- Ada 3 peserta yang terhubung.\n\nRuang ini berakhir dalam **28 menit**. Siapa pun bisa memakai `/renew-session` untuk memperpanjang 8 jam.',
    groupFollowup:
        'Sempurna. Biarkan ruang ini tetap terbuka untuk handoff malam.',
    groupRenewalNotice:
        'Pengingat perpanjangan: sesi ini tersisa kurang dari 30 menit.',
    richStatus:
        'Lampiran terenkripsi siap dikirim. Markdown, gambar, dan file tetap berada di sesi privat.',
    richRequest:
        'Tolong tinjau aset handoff sebelum unggah dan buat ringkasannya cukup singkat untuk catatan suara.',
    richAssistantSummary:
        '**Siap untuk handoff**\n\n- Runbook rilis terlampir.\n- Pratinjau topologi dirender langsung di chat.\n- Kamu bisa memakai `/tts` untuk mengubah ringkasan menjadi catatan suara privat.',
    richDraft: '/tts Buat ringkasan handoff terenkripsi selama 15 detik',
    runbookPdfName: 'runbook-rilis.pdf',
    summaryMdName: 'ringkasan.md',
    checklistPdfName: 'checklist-rilis.pdf',
    handoffNotesMdName: 'catatan-handoff.md',
  ),
  'ja': _PreviewStrings(
    welcomeStatus: '使い捨て QR コードを読み取るか招待を貼り付けて、暗号化されたプライベートチャットを始めます。',
    groupStatus: '暗号化グループチャットが有効です。3 人接続中、残り 7 時間 48 分です。',
    groupJoinNotice: 'Aria が暗号化ルームに参加しました。',
    groupQuestion: 'リレーの状態を確認して、朝会前に更新が必要か教えてもらえますか？',
    groupAssistantSummary:
        '**リレー状況**\n\n- エンドツーエンド暗号化は有効です。\n- リレーは暗号文のみを中継します。\n- 3 人の参加者が接続中です。\n\nこのルームは **28 分後** に期限切れになります。だれでも `/renew-session` で 8 時間延長できます。',
    groupFollowup: '了解です。夜の引き継ぎまでこの部屋を開けておいてください。',
    groupRenewalNotice: '更新リマインダー: このセッションの残り時間は 30 分未満です。',
    richStatus: '暗号化添付は送信準備完了です。Markdown、画像、ファイルはすべてこのプライベートセッション内に留まります。',
    richRequest: 'アップロード前に引き継ぎ資料を確認し、音声メモに収まる短さで要約してください。',
    richAssistantSummary:
        '**引き継ぎ準備完了**\n\n- リリース runbook を添付しました。\n- トポロジープレビューをインライン表示しています。\n- `/tts` を使って要約をプライベート音声メモにできます。',
    richDraft: '/tts 15 秒の暗号化引き継ぎ要約を作成して',
    runbookPdfName: 'release-runbook.pdf',
    summaryMdName: 'summary.md',
    checklistPdfName: 'release-checklist.pdf',
    handoffNotesMdName: 'handoff-notes.md',
  ),
  'ko': _PreviewStrings(
    welcomeStatus: '일회용 QR 코드를 스캔하거나 초대 링크를 붙여 넣어 암호화된 비공개 채팅을 시작하세요.',
    groupStatus: '암호화 그룹 채팅이 활성화되었습니다. 3명 연결됨, 7시간 48분 남음.',
    groupJoinNotice: 'Aria님이 암호화된 방에 참여했습니다.',
    groupQuestion: '릴레이 상태를 확인하고 스탠드업 전에 갱신이 필요한지 알려줄래요?',
    groupAssistantSummary:
        '**릴레이 상태**\n\n- 종단간 암호화가 활성화되어 있습니다.\n- 릴레이는 암호문만 전달합니다.\n- 참가자 3명이 연결되어 있습니다.\n\n이 방은 **28분 후** 만료됩니다. 누구나 `/renew-session` 으로 8시간 연장할 수 있습니다.',
    groupFollowup: '좋아요. 저녁 인계까지 이 방을 열어 두세요.',
    groupRenewalNotice: '갱신 알림: 이 세션의 남은 시간이 30분 미만입니다.',
    richStatus: '암호화 첨부파일이 준비되었습니다. Markdown, 이미지, 파일은 모두 이 비공개 세션 안에 머뭅니다.',
    richRequest: '업로드 전에 인계 자료를 검토하고 음성 메모에 들어갈 만큼 짧게 요약해 주세요.',
    richAssistantSummary:
        '**인계 준비 완료**\n\n- 릴리스 런북이 첨부되었습니다.\n- 토폴로지 미리보기가 인라인으로 표시됩니다.\n- `/tts` 로 요약을 비공개 음성 메모로 바꿀 수 있습니다.',
    richDraft: '/tts 15초짜리 암호화 인계 요약을 작성해 줘',
    runbookPdfName: '릴리스-런북.pdf',
    summaryMdName: '요약.md',
    checklistPdfName: '릴리스-체크리스트.pdf',
    handoffNotesMdName: '인계-노트.md',
  ),
  'pt': _PreviewStrings(
    welcomeStatus:
        'Escaneie um QR code de uso único ou cole um convite para iniciar um chat privado criptografado.',
    groupStatus:
        'O chat em grupo criptografado está ativo. 3 membros conectados, restam 7h48.',
    groupJoinNotice: 'Aria entrou na sala criptografada.',
    groupQuestion:
        'Você pode verificar a saúde do relay e dizer se devemos renovar antes do standup?',
    groupAssistantSummary:
        '**Saúde do relay**\n\n- A criptografia ponta a ponta está ativa.\n- O relay encaminha apenas texto cifrado.\n- Há 3 participantes conectados.\n\nA sala expira em **28 minutos**. Qualquer membro pode usar `/renew-session` para estender por 8 horas.',
    groupFollowup:
        'Perfeito. Mantenha esta sala aberta para a passagem da noite.',
    groupRenewalNotice:
        'Lembrete de renovação: esta sessão tem menos de 30 minutos restantes.',
    richStatus:
        'Os anexos criptografados estão prontos. Markdown, imagens e arquivos permanecem dentro da sessão privada.',
    richRequest:
        'Revise os materiais de handoff antes do envio e mantenha o resumo curto o suficiente para uma nota de voz.',
    richAssistantSummary:
        '**Pronto para o handoff**\n\n- O runbook de release está anexado.\n- A prévia da topologia aparece em linha.\n- Você pode usar `/tts` para transformar o resumo em uma nota de voz privada.',
    richDraft: '/tts Crie um resumo criptografado de handoff de 15 segundos',
    runbookPdfName: 'runbook-release.pdf',
    summaryMdName: 'resumo.md',
    checklistPdfName: 'checklist-release.pdf',
    handoffNotesMdName: 'notas-handoff.md',
  ),
  'vi': _PreviewStrings(
    welcomeStatus:
        'Quét mã QR dùng một lần hoặc dán lời mời để bắt đầu cuộc trò chuyện riêng tư được mã hóa.',
    groupStatus:
        'Trò chuyện nhóm mã hóa đang hoạt động. 3 thành viên đã kết nối, còn 7 giờ 48 phút.',
    groupJoinNotice: 'Aria đã tham gia phòng mã hóa.',
    groupQuestion:
        'Bạn có thể kiểm tra tình trạng relay và cho biết có nên gia hạn trước buổi standup không?',
    groupAssistantSummary:
        '**Tình trạng relay**\n\n- Mã hóa đầu cuối đang hoạt động.\n- Relay chỉ chuyển tiếp bản mã.\n- Có 3 người tham gia đang kết nối.\n\nPhòng sẽ hết hạn sau **28 phút**. Bất kỳ ai cũng có thể dùng `/renew-session` để gia hạn thêm 8 giờ.',
    groupFollowup: 'Tuyệt. Hãy giữ phòng này mở cho đợt bàn giao buổi tối.',
    groupRenewalNotice: 'Nhắc gia hạn: phiên này còn chưa đến 30 phút.',
    richStatus:
        'Tệp đính kèm mã hóa đã sẵn sàng. Markdown, hình ảnh và tệp đều ở trong phiên riêng tư.',
    richRequest:
        'Hãy xem lại tài liệu bàn giao trước khi tải lên và giữ phần tóm tắt đủ ngắn cho một ghi chú thoại.',
    richAssistantSummary:
        '**Sẵn sàng bàn giao**\n\n- Runbook phát hành đã được đính kèm.\n- Bản xem trước topology hiển thị ngay trong cuộc trò chuyện.\n- Bạn có thể dùng `/tts` để biến phần tóm tắt thành ghi chú thoại riêng tư.',
    richDraft: '/tts Soạn bản tóm tắt bàn giao mã hóa dài 15 giây',
    runbookPdfName: 'so-tay-phat-hanh.pdf',
    summaryMdName: 'tom-tat.md',
    checklistPdfName: 'danh-sach-phat-hanh.pdf',
    handoffNotesMdName: 'ghi-chu-ban-giao.md',
  ),
  'zh-Hans': _PreviewStrings(
    welcomeStatus: '扫描一次性二维码或粘贴邀请，即可开始私密加密聊天。',
    groupStatus: '加密群聊已连接。3 位成员在线，剩余 7 小时 48 分。',
    groupJoinNotice: 'Aria 已加入加密房间。',
    groupQuestion: '请检查一下中继状态，并告诉我晨会前是否需要续期？',
    groupAssistantSummary:
        '**中继状态**\n\n- 端到端加密已启用。\n- 中继只转发密文。\n- 当前有 3 位参与者在线。\n\n房间将在 **28 分钟后** 过期。任意成员都可以使用 `/renew-session` 延长 8 小时。',
    groupFollowup: '很好。今晚交接前先保持这个房间开启。',
    groupRenewalNotice: '续期提醒：当前会话剩余时间不足 30 分钟。',
    richStatus: '加密附件已就绪。Markdown、图片和文件都会留在私有会话内。',
    richRequest: '请在上传前检查交接资料，并把摘要压缩到适合语音备注的长度。',
    richAssistantSummary:
        '**已准备好交接**\n\n- 已附上发布 runbook。\n- 拓扑预览可在聊天中直接查看。\n- 你可以使用 `/tts` 把摘要转换成私密语音备注。',
    richDraft: '/tts 生成一段 15 秒的加密交接摘要',
    runbookPdfName: '发布-runbook.pdf',
    summaryMdName: '摘要.md',
    checklistPdfName: '发布-检查清单.pdf',
    handoffNotesMdName: '交接-备注.md',
  ),
  'zh-Hant': _PreviewStrings(
    welcomeStatus: '掃描一次性 QR 碼或貼上邀請，即可開始私密加密聊天。',
    groupStatus: '加密群聊已連線。3 位成員在線，剩餘 7 小時 48 分。',
    groupJoinNotice: 'Aria 已加入加密房間。',
    groupQuestion: '請檢查一下中繼狀態，並告訴我晨會前是否需要續期？',
    groupAssistantSummary:
        '**中繼狀態**\n\n- 端對端加密已啟用。\n- 中繼只轉發密文。\n- 目前有 3 位參與者在線。\n\n房間將在 **28 分鐘後** 到期。任何成員都可以使用 `/renew-session` 延長 8 小時。',
    groupFollowup: '很好。今晚交接前先保持這個房間開啟。',
    groupRenewalNotice: '續期提醒：目前會話剩餘時間不足 30 分鐘。',
    richStatus: '加密附件已就緒。Markdown、圖片和檔案都會留在私有會話內。',
    richRequest: '請在上傳前檢查交接資料，並把摘要壓縮到適合語音備註的長度。',
    richAssistantSummary:
        '**已準備好交接**\n\n- 已附上發佈 runbook。\n- 拓撲預覽可在聊天中直接檢視。\n- 你可以使用 `/tts` 把摘要轉成私密語音備註。',
    richDraft: '/tts 產生一段 15 秒的加密交接摘要',
    runbookPdfName: '發佈-runbook.pdf',
    summaryMdName: '摘要.md',
    checklistPdfName: '發佈-檢查清單.pdf',
    handoffNotesMdName: '交接-備註.md',
  ),
};

PrivateClawPreviewData? screenshotPreviewDataForScenario(
  String scenario, [
  Locale? locale,
]) {
  switch (scenario.trim()) {
    case 'welcome':
      return _buildWelcomePreview(locale);
    case 'group_chat':
      return _buildGroupChatPreview(locale);
    case 'rich_media':
      return _buildRichMediaPreview(locale);
    default:
      return null;
  }
}

String _previewLocaleKey(Locale? locale) {
  if (locale == null) {
    return 'en';
  }

  final String languageCode = locale.languageCode.toLowerCase();
  if (languageCode == 'zh') {
    final String? scriptCode = locale.scriptCode;
    final String? countryCode = locale.countryCode?.toUpperCase();
    if (scriptCode == 'Hant' ||
        countryCode == 'TW' ||
        countryCode == 'HK' ||
        countryCode == 'MO') {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }
  if (languageCode == 'pt') {
    return 'pt';
  }

  return _previewStringsByLocale.containsKey(languageCode)
      ? languageCode
      : 'en';
}

_PreviewStrings _previewStringsForLocale(Locale? locale) {
  return _previewStringsByLocale[_previewLocaleKey(locale)] ??
      _previewStringsByLocale['en']!;
}

Locale? _parseLocaleTag(String localeTag) {
  final String normalized = localeTag.trim();
  if (normalized.isEmpty) {
    return null;
  }

  final List<String> parts = normalized
      .split(RegExp(r'[-_]'))
      .where((String part) => part.isNotEmpty)
      .toList(growable: false);
  if (parts.isEmpty) {
    return null;
  }

  final String languageCode = parts[0];
  String? scriptCode;
  String? countryCode;
  if (parts.length >= 2) {
    if (parts[1].length == 4) {
      scriptCode = parts[1];
    } else {
      countryCode = parts[1];
    }
  }
  if (parts.length >= 3) {
    countryCode ??= parts[2];
  }

  return Locale.fromSubtags(
    languageCode: languageCode,
    scriptCode: scriptCode,
    countryCode: countryCode,
  );
}

PrivateClawPreviewData _buildWelcomePreview(Locale? locale) {
  final _PreviewStrings strings = _previewStringsForLocale(locale);
  return PrivateClawPreviewData(
    status: PrivateClawSessionStatus.idle,
    statusText: strings.welcomeStatus,
  );
}

PrivateClawPreviewData _buildGroupChatPreview(Locale? locale) {
  final _PreviewStrings strings = _previewStringsForLocale(locale);
  final DateTime now = DateTime.utc(2026, 3, 13, 14, 53);
  final PrivateClawInvite invite = _buildInvite(
    sessionId: '53d8377d-1289-423d-87be-57bd95f8a825',
    expiresAt: DateTime.utc(2026, 3, 13, 22, 41),
    groupMode: true,
  );
  final PrivateClawIdentity identity = PrivateClawIdentity(
    appId: 'app-mei',
    createdAt: now.subtract(const Duration(days: 14)),
    displayName: 'Mei',
  );

  return PrivateClawPreviewData(
    invite: invite,
    inviteInput: _buildInviteUri(invite),
    identity: identity,
    status: PrivateClawSessionStatus.active,
    statusText: strings.groupStatus,
    participants: <PrivateClawParticipant>[
      PrivateClawParticipant(
        appId: identity.appId,
        displayName: 'Mei',
        joinedAt: now.subtract(const Duration(minutes: 12)),
        deviceLabel: 'PrivateClaw',
      ),
      PrivateClawParticipant(
        appId: 'app-aria',
        displayName: 'Aria',
        joinedAt: now.subtract(const Duration(minutes: 9)),
        deviceLabel: 'PrivateClaw',
      ),
      PrivateClawParticipant(
        appId: 'app-sol',
        displayName: 'Sol',
        joinedAt: now.subtract(const Duration(minutes: 6)),
        deviceLabel: 'PrivateClaw',
      ),
    ],
    availableCommands: _buildPreviewCommands(),
    messages: <ChatMessage>[
      ChatMessage(
        id: 'group-system-join',
        sender: ChatSender.system,
        text: strings.groupJoinNotice,
        sentAt: now.subtract(const Duration(minutes: 9)),
      ),
      ChatMessage(
        id: 'group-user-mei',
        sender: ChatSender.user,
        text: strings.groupQuestion,
        sentAt: now.subtract(const Duration(minutes: 7)),
        isOwnMessage: true,
        senderId: identity.appId,
        senderLabel: 'Mei',
      ),
      ChatMessage(
        id: 'group-assistant',
        sender: ChatSender.assistant,
        text: strings.groupAssistantSummary,
        sentAt: now.subtract(const Duration(minutes: 6)),
      ),
      ChatMessage(
        id: 'group-user-aria',
        sender: ChatSender.user,
        text: strings.groupFollowup,
        sentAt: now.subtract(const Duration(minutes: 4)),
        senderId: 'app-aria',
        senderLabel: 'Aria',
      ),
      ChatMessage(
        id: 'group-system-renewal',
        sender: ChatSender.system,
        text: strings.groupRenewalNotice,
        sentAt: now.subtract(const Duration(minutes: 3)),
      ),
    ],
  );
}

PrivateClawPreviewData _buildRichMediaPreview(Locale? locale) {
  final _PreviewStrings strings = _previewStringsForLocale(locale);
  final DateTime now = DateTime.utc(2026, 3, 13, 14, 53);
  final PrivateClawInvite invite = _buildInvite(
    sessionId: 'b0f7d7d1-7a8f-4121-b2be-0fbc94dc2e8d',
    expiresAt: DateTime.utc(2026, 3, 13, 21, 30),
  );
  final PrivateClawIdentity identity = PrivateClawIdentity(
    appId: 'app-mei',
    createdAt: now.subtract(const Duration(days: 14)),
    displayName: 'Mei',
  );

  return PrivateClawPreviewData(
    invite: invite,
    inviteInput: _buildInviteUri(invite),
    identity: identity,
    status: PrivateClawSessionStatus.active,
    statusText: strings.richStatus,
    isPairingPanelCollapsed: true,
    availableCommands: _buildPreviewCommands(),
    messages: <ChatMessage>[
      ChatMessage(
        id: 'media-user',
        sender: ChatSender.user,
        text: strings.richRequest,
        sentAt: now.subtract(const Duration(minutes: 8)),
        isOwnMessage: true,
        senderId: identity.appId,
        senderLabel: 'Mei',
        attachments: <ChatAttachment>[
          _buildShowcaseDocument(
            id: 'runbook-pdf',
            name: strings.runbookPdfName,
            sizeBytes: 128640,
          ),
        ],
      ),
      ChatMessage(
        id: 'media-assistant',
        sender: ChatSender.assistant,
        text: strings.richAssistantSummary,
        sentAt: now.subtract(const Duration(minutes: 6)),
        attachments: <ChatAttachment>[
          _buildShowcaseImageAttachment(),
          _buildShowcaseDocument(
            id: 'summary-md',
            name: strings.summaryMdName,
            sizeBytes: 6890,
            mimeType: 'text/markdown',
          ),
        ],
      ),
    ],
    selectedAttachments: <ChatAttachment>[
      _buildShowcaseDocument(
        id: 'selected-pdf',
        name: strings.checklistPdfName,
        sizeBytes: 48210,
      ),
      _buildShowcaseDocument(
        id: 'selected-md',
        name: strings.handoffNotesMdName,
        sizeBytes: 2140,
        mimeType: 'text/markdown',
      ),
    ],
    composerDraftText: strings.richDraft,
  );
}

PrivateClawInvite _buildInvite({
  required String sessionId,
  required DateTime expiresAt,
  bool groupMode = false,
}) {
  return PrivateClawInvite(
    version: 1,
    sessionId: sessionId,
    sessionKey: 'jCwDvz3aglcqJ3vsMUkZUp5Wvw2WW_B8J923v5MlLnk',
    appWsUrl: 'wss://privateclaw.ystone.us/ws/app?sessionId=$sessionId',
    expiresAt: expiresAt,
    groupMode: groupMode,
    providerLabel: 'PrivateClaw',
    relayLabel: 'Private relay',
  );
}

String _buildInviteUri(PrivateClawInvite invite) {
  return encodePrivateClawInviteUri(invite);
}

List<PrivateClawSlashCommand> _buildPreviewCommands() {
  return const <PrivateClawSlashCommand>[
    PrivateClawSlashCommand(
      slash: '/session-qr',
      description: 'Show the current pairing QR again for in-person sharing.',
      acceptsArgs: false,
      source: 'provider',
    ),
    PrivateClawSlashCommand(
      slash: '/renew-session',
      description: 'Extend the current encrypted session for another 8 hours.',
      acceptsArgs: false,
      source: 'provider',
    ),
    PrivateClawSlashCommand(
      slash: '/tts',
      description:
          'Turn the latest assistant summary into a private voice note.',
      acceptsArgs: true,
      source: 'provider',
    ),
  ];
}

ChatAttachment _buildShowcaseDocument({
  required String id,
  required String name,
  required int sizeBytes,
  String mimeType = 'application/pdf',
}) {
  return ChatAttachment(
    id: id,
    name: name,
    mimeType: mimeType,
    sizeBytes: sizeBytes,
  );
}

ChatAttachment _buildShowcaseImageAttachment() {
  return const ChatAttachment(
    id: 'preview-image',
    name: 'relay-topology.png',
    mimeType: 'image/png',
    sizeBytes: 4147,
    dataBase64: _showcaseImageBase64,
  );
}

const String _showcaseImageBase64 =
    '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';
