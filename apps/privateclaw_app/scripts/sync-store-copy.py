#!/usr/bin/env python3
"""Regenerate App Store metadata (description / keywords / promotional text) for iOS and macOS
in all fastlane locales, and the App Review notes.

Naming: the Apple listings are "Hearth" (client). The room system / desktop component is
"PrivateClaw". No mention of the underlying assistant runtime's product name anywhere.
"""
from __future__ import annotations

import os
import pathlib
import sys

APP_ROOT = pathlib.Path(__file__).resolve().parents[1]
NEW_NAME = "Hearth Room"
VIDEO_URL = sys.argv[1] if len(sys.argv) > 1 else "{{VIDEO_URL}}"
CONTACT_LINE = (
    "If you would like a live invite for this build, reply through App Store Connect review "
    "messaging and we will provide a fresh one within a few hours (it can be made permanent for review)."
)

# ---------------------------------------------------------------------------
# Per-locale copy. {mac} is replaced with the platform-specific phrase.
# ---------------------------------------------------------------------------
COPY = {
    "en-US": dict(
        intro="Hearth Room is the iPhone and iPad client for PrivateClaw, an open-source, invite-only chat system that gives your own self-hosted AI assistant a private, end-to-end encrypted room for the people you actually trust.",
        how=[
            "The PrivateClaw desktop component (free, Windows/macOS/Linux) runs on your own computer next to the AI assistant of your choice. It creates rooms and issues one-time QR invites.",
            "Hearth Room joins a room from your phone: scan the invite (or paste the invite link), and chat with your circle and with your assistant. Photos, voice notes, and files travel inside the same encrypted room.",
            "The relay only routes ciphertext. It never sees message contents, and no account or sign-up is required.",
        ],
        features_header="Features:",
        features=[
            "Join with one scan or a pasted invite link",
            "End-to-end encrypted transport through the relay",
            "Group rooms with the people you choose",
            "Works with custom home or cloud relays",
            "Slash commands, media, and participant presence in a familiar chat layout",
        ],
        need="Hearth Room needs a PrivateClaw room to connect to. The desktop component is free and open source: https://github.com/topcheer/PrivateClaw (the Windows app is on the Microsoft Store).",
        push="Push notifications are only available out of the box on the official relay relay.privateclaw.us. If you switch to a custom relay, wire the relay and app build to your own Firebase / FCM project.",
        keywords="privateclaw,hearth room,encrypted,ai chat,relay,qr,self-hosted,secure chat,group chat",
        promo="Leave public chat behind and talk to your circle and your own AI assistant in a one-time encrypted PrivateClaw room.",
        mac_intro="Hearth Room for Mac is the Mac client for PrivateClaw, an open-source, invite-only chat system that gives your own self-hosted AI assistant a private, end-to-end encrypted room for the people you actually trust.",
        mac_join="Hearth Room joins a room from your Mac: paste the invite link (or open a saved QR image), and chat with your circle and with your assistant. Photos, voice notes, and files travel inside the same encrypted room.",
    ),
    "zh-Hans": dict(
        intro="Hearth Room 是 PrivateClaw 的 iPhone / iPad 客户端。PrivateClaw 是一套开源、仅限邀请的聊天系统，让你自己托管的 AI 助手拥有一个只属于信任之人的私密房间，消息全程端到端加密。",
        how=[
            "PrivateClaw 桌面组件（免费，支持 Windows / macOS / Linux）运行在你自己的电脑上，与你选择的 AI 助手放在一起，负责创建房间并生成一次性二维码邀请。",
            "Hearth Room 在手机上加入房间：扫描邀请（或粘贴邀请链接），即可与你的圈子以及你的助手聊天。照片、语音和文件都在同一个加密房间内传输。",
            "中继服务器只转发密文，永远看不到消息内容；无需注册账号。",
        ],
        features_header="功能：",
        features=[
            "扫码或粘贴链接一键加入",
            "经中继传输的端到端加密",
            "只邀请你信任的人的群聊房间",
            "支持自建或云端中继",
            "斜杠命令、媒体与成员状态，熟悉聊天应用的布局",
        ],
        need="Hearth Room 需要一个 PrivateClaw 房间才能连接。桌面组件免费开源：https://github.com/topcheer/PrivateClaw（Windows 版已在 Microsoft Store 上架）。",
        push="推送通知仅在官方中继 relay.privateclaw.us 下开箱可用；若使用自定义中继，请将中继与 App 构建接入你自己的 Firebase / FCM 项目。",
        keywords="privateclaw,hearth,私密,加密,AI聊天,中继,二维码,自托管,安全聊天,群聊",
        promo="离开公开聊天软件，只和你信任的人以及自己的 AI 助手，在一次性加密的 PrivateClaw 房间里聊天。",
        mac_intro="Hearth Room for Mac 是 PrivateClaw 的 Mac 客户端。PrivateClaw 是一套开源、仅限邀请的聊天系统，让你自己托管的 AI 助手拥有一个只属于信任之人的私密房间，消息全程端到端加密。",
        mac_join="Hearth Room 在 Mac 上加入房间：粘贴邀请链接（或打开保存的二维码图片），即可与你的圈子以及你的助手聊天。照片、语音和文件都在同一个加密房间内传输。",
    ),
    "zh-Hant": dict(
        intro="Hearth Room 是 PrivateClaw 的 iPhone / iPad 用戶端。PrivateClaw 是一套開源、僅限邀請的聊天系統，讓你自己託管的 AI 助手擁有一個只屬於信任之人的私密房間，訊息全程端對端加密。",
        how=[
            "PrivateClaw 桌面組件（免費，支援 Windows / macOS / Linux）運行在你自己的電腦上，與你選擇的 AI 助手放在一起，負責建立房間並產生一次性 QR Code 邀請。",
            "Hearth Room 在手機上加入房間：掃描邀請（或貼上邀請連結），即可與你的圈子以及你的助手聊天。照片、語音和檔案都在同一個加密房間內傳輸。",
            "中繼伺服器只轉發密文，永遠看不到訊息內容；無需註冊帳號。",
        ],
        features_header="功能：",
        features=[
            "掃碼或貼上連結一鍵加入",
            "經中繼傳輸的端對端加密",
            "只邀請你信任的人的群聊房間",
            "支援自建或雲端中繼",
            "斜線指令、媒體與成員狀態，熟悉聊天應用的版面",
        ],
        need="Hearth Room 需要一個 PrivateClaw 房間才能連線。桌面組件免費開源：https://github.com/topcheer/PrivateClaw（Windows 版已在 Microsoft Store 上架）。",
        push="推播通知僅在官方中繼 relay.privateclaw.us 下開箱可用；若使用自訂中繼，請將中繼與 App 建置接入你自己的 Firebase / FCM 專案。",
        keywords="privateclaw,hearth,私密,加密,AI聊天,中繼,QR,自架,安全聊天,群聊",
        promo="離開公開聊天軟體，只和你信任的人以及自己的 AI 助手，在一次性加密的 PrivateClaw 房間裡聊天。",
        mac_intro="Hearth Room for Mac 是 PrivateClaw 的 Mac 用戶端。PrivateClaw 是一套開源、僅限邀請的聊天系統，讓你自己託管的 AI 助手擁有一個只屬於信任之人的私密房間，訊息全程端對端加密。",
        mac_join="Hearth Room 在 Mac 上加入房間：貼上邀請連結（或開啟儲存的 QR Code 圖片），即可與你的圈子以及你的助手聊天。照片、語音和檔案都在同一個加密房間內傳輸。",
    ),
    "ja": dict(
        intro="Hearth Room は PrivateClaw の iPhone / iPad クライアントです。PrivateClaw は、自分でホストする AI アシスタントのために、信頼できる人だけが集まる招待制の暗号化ルームを提供するオープンソースのチャットシステムです。",
        how=[
            "PrivateClaw のデスクトップコンポーネント（無料、Windows / macOS / Linux）は、自分のコンピュータ上でお好みの AI アシスタントと並べて動作し、ルームの作成とワンタイム QR 招待の発行を行います。",
            "Hearth Room はスマートフォンからルームに参加します。招待をスキャン（または招待リンクを貼り付け）すれば、仲間やアシスタントとチャットできます。写真・ボイスメモ・ファイルも同じ暗号化ルーム内でやり取りされます。",
            "リレーは暗号文のみを転送し、メッセージ内容を見ることはありません。アカウント登録も不要です。",
        ],
        features_header="機能：",
        features=[
            "スキャンまたはリンクの貼り付けで簡単参加",
            "リレー経由のエンドツーエンド暗号化",
            "信頼する人だけを招けるグループルーム",
            "自宅 / クラウドのカスタムリレーに対応",
            "スラッシュコマンド、メディア、参加者の状態表示",
        ],
        need="Hearth Room は PrivateClaw のルームがないと接続できません。デスクトップコンポーネントは無料でオープンソース：https://github.com/topcheer/PrivateClaw（Windows 版は Microsoft Store にあります）。",
        push="プッシュ通知は公式リレー relay.privateclaw.us でのみ初期状態で利用できます。カスタムリレーを使う場合は、リレーとアプリビルドを独自の Firebase / FCM プロジェクトに接続してください。",
        keywords="privateclaw,hearth,暗号化,AIチャット,リレー,QR,セルフホスト,セキュアチャット,グループチャット",
        promo="公開チャットを離れて、信頼できる仲間と自分の AI アシスタントと、ワンタイム暗号化の PrivateClaw ルームで話しましょう。",
        mac_intro="Hearth Room for Mac は PrivateClaw の Mac クライアントです。PrivateClaw は、自分でホストする AI アシスタントのために、信頼できる人だけが集まる招待制の暗号化ルームを提供するオープンソースのチャットシステムです。",
        mac_join="Hearth Room は Mac からルームに参加します。招待リンクを貼り付け（または保存した QR 画像を開き）すれば、仲間やアシスタントとチャットできます。写真・ボイスメモ・ファイルも同じ暗号化ルーム内でやり取りされます。",
    ),
    "ko": dict(
        intro="Hearth Room은 PrivateClaw의 iPhone / iPad 클라이언트입니다. PrivateClaw는 직접 호스팅하는 AI 어시스턴트를 위해 신뢰하는 사람들만 모이는 초대 전용 암호화 채팅방을 만들어 주는 오픈소스 채팅 시스템입니다.",
        how=[
            "PrivateClaw 데스크톱 구성 요소(무료, Windows / macOS / Linux)는 사용자의 컴퓨터에서 선택한 AI 어시스턴트와 함께 실행되며, 채팅방을 만들고 일회용 QR 초대를 발급합니다.",
            "Hearth Room은 휴대폰에서 채팅방에 참여합니다. 초대를 스캔하거나(또는 초대 링크를 붙여넣어) 친구들 및 어시스턴트와 채팅하세요. 사진, 음성 메모, 파일도 같은 암호화 채팅방 안에서 전송됩니다.",
            "릴레이는 암호문만 전달하며 메시지 내용을 절대 볼 수 없습니다. 계정 가입도 필요 없습니다.",
        ],
        features_header="기능:",
        features=[
            "스캔 한 번 또는 링크 붙여넣기로 참여",
            "릴레이 경유 종단 간 암호화",
            "신뢰하는 사람만 초대하는 그룹 채팅방",
            "자체 호스팅 / 클라우드 사용자 지정 릴레이 지원",
            "슬래시 명령, 미디어, 참여자 상태 표시",
        ],
        need="Hearth Room은 연결할 PrivateClaw 채팅방이 필요합니다. 데스크톱 구성 요소는 무료 오픈소스입니다: https://github.com/topcheer/PrivateClaw (Windows 앱은 Microsoft Store에 있습니다).",
        push="푸시 알림은 공식 릴레이 relay.privateclaw.us에서만 기본으로 사용할 수 있습니다. 사용자 지정 릴레이를 사용하는 경우 릴레이와 앱 빌드를 자체 Firebase / FCM 프로젝트에 연결하세요.",
        keywords="privateclaw,hearth,암호화,AI채팅,릴레이,QR,셀프호스팅,보안채팅,그룹채팅",
        promo="공개 채팅을 벗어나 신뢰하는 사람들과 내 AI 어시스턴트와 일회성 암호화 PrivateClaw 채팅방에서 대화하세요.",
        mac_intro="Hearth Room for Mac은 PrivateClaw의 Mac 클라이언트입니다. PrivateClaw는 직접 호스팅하는 AI 어시스턴트를 위해 신뢰하는 사람들만 모이는 초대 전용 암호화 채팅방을 만들어 주는 오픈소스 채팅 시스템입니다.",
        mac_join="Hearth Room은 Mac에서 채팅방에 참여합니다. 초대 링크를 붙여넣거나(또는 저장한 QR 이미지를 열어) 친구들 및 어시스턴트와 채팅하세요. 사진, 음성 메모, 파일도 같은 암호화 채팅방 안에서 전송됩니다.",
    ),
    "de-DE": dict(
        intro="Hearth Room ist der iPhone- und iPad-Client für PrivateClaw, ein Open-Source-Chatsystem mit Einladung, das Ihrem selbst gehosteten KI-Assistenten einen privaten, Ende-zu-Ende-verschlüsselten Raum für die Menschen gibt, denen Sie wirklich vertrauen.",
        how=[
            "Die PrivateClaw-Desktopkomponente (kostenlos, Windows/macOS/Linux) läuft auf Ihrem eigenen Computer neben dem KI-Assistenten Ihrer Wahl, erstellt Räume und stellt einmalige QR-Einladungen aus.",
            "Hearth Room tritt von Ihrem Telefon aus einem Raum bei: Einladung scannen (oder Einladungslink einfügen) und mit Ihrem Kreis und Ihrem Assistenten chatten. Fotos, Sprachnachrichten und Dateien bleiben im selben verschlüsselten Raum.",
            "Das Relay leitet nur Chiffretext weiter und sieht nie Nachrichteninhalte. Kein Konto, keine Anmeldung.",
        ],
        features_header="Funktionen:",
        features=[
            "Beitritt per Scan oder eingefügtem Einladungslink",
            "Ende-zu-Ende-verschlüsselter Transport über das Relay",
            "Gruppenräume mit den Menschen Ihrer Wahl",
            "Funktioniert mit eigenen Relay-Servern zu Hause oder in der Cloud",
            "Slash-Befehle, Medien und Teilnehmerstatus",
        ],
        need="Hearth Room braucht einen PrivateClaw-Raum, mit dem es sich verbinden kann. Die Desktopkomponente ist kostenlos und Open Source: https://github.com/topcheer/PrivateClaw (die Windows-App gibt es im Microsoft Store).",
        push="Push-Benachrichtigungen sind ab Werk nur über das offizielle Relay relay.privateclaw.us verfügbar. Bei einem eigenen Relay verbinden Sie Relay und App-Build mit Ihrem eigenen Firebase-/FCM-Projekt.",
        keywords="privateclaw,hearth,verschlüsselt,KI-Chat,Relay,QR,self-hosted,sicherer Chat,gruppenchat",
        promo="Verlassen Sie öffentliche Chats und sprechen Sie mit Ihrem Kreis und Ihrem eigenen KI-Assistenten in einem einmalig verschlüsselten PrivateClaw-Raum.",
        mac_intro="Hearth Room for Mac ist der Mac-Client für PrivateClaw, ein Open-Source-Chatsystem mit Einladung, das Ihrem selbst gehosteten KI-Assistenten einen privaten, Ende-zu-Ende-verschlüsselten Raum für die Menschen gibt, denen Sie wirklich vertrauen.",
        mac_join="Hearth Room tritt von Ihrem Mac aus einem Raum bei: Einladungslink einfügen (oder gespeichertes QR-Bild öffnen) und mit Ihrem Kreis und Ihrem Assistenten chatten. Fotos, Sprachnachrichten und Dateien bleiben im selben verschlüsselten Raum.",
    ),
    "fr-FR": dict(
        intro="Hearth Room est le client iPhone et iPad de PrivateClaw, un système de conversation open source sur invitation qui offre à votre assistant IA auto-hébergé un salon privé, chiffré de bout en bout, réservé aux personnes en qui vous avez vraiment confiance.",
        how=[
            "Le composant de bureau PrivateClaw (gratuit, Windows/macOS/Linux) fonctionne sur votre propre ordinateur, à côté de l'assistant IA de votre choix ; il crée les salons et génère des invitations QR à usage unique.",
            "Hearth Room rejoint un salon depuis votre téléphone : scannez l'invitation (ou collez le lien d'invitation) et discutez avec vos proches et votre assistant. Photos, messages vocaux et fichiers circulent dans le même salon chiffré.",
            "Le relais ne transmet que du texte chiffré et ne voit jamais le contenu des messages. Aucun compte ni inscription.",
        ],
        features_header="Fonctionnalités :",
        features=[
            "Rejoindre en un scan ou via un lien collé",
            "Transport chiffré de bout en bout via le relais",
            "Salons de groupe avec les personnes de votre choix",
            "Compatible avec vos propres relais (domicile ou cloud)",
            "Commandes slash, médias et présence des participants",
        ],
        need="Hearth Room a besoin d'un salon PrivateClaw pour se connecter. Le composant de bureau est gratuit et open source : https://github.com/topcheer/PrivateClaw (l'app Windows est disponible sur le Microsoft Store).",
        push="Les notifications push ne fonctionnent par défaut qu'avec le relais officiel relay.privateclaw.us. Avec un relais personnalisé, reliez le relais et la build de l'app à votre propre projet Firebase / FCM.",
        keywords="privateclaw,hearth,chiffré,chat IA,relais,QR,auto-hébergé,chat sécurisé,chat de groupe",
        promo="Quittez les chats publics et parlez à vos proches et à votre propre assistant IA dans un salon PrivateClaw chiffré à usage unique.",
        mac_intro="Hearth Room for Mac est le client Mac de PrivateClaw, un système de conversation open source sur invitation qui offre à votre assistant IA auto-hébergé un salon privé, chiffré de bout en bout, réservé aux personnes en qui vous avez vraiment confiance.",
        mac_join="Hearth Room rejoint un salon depuis votre Mac : collez le lien d'invitation (ou ouvrez une image QR enregistrée) et discutez avec vos proches et votre assistant. Photos, messages vocaux et fichiers circulent dans le même salon chiffré.",
    ),
    "es-ES": dict(
        intro="Hearth Room es el cliente de iPhone y iPad para PrivateClaw, un sistema de chat de código abierto y solo por invitación que da a tu asistente de IA autoalojado una sala privada cifrada de extremo a extremo para las personas en las que de verdad confías.",
        how=[
            "El componente de escritorio de PrivateClaw (gratis, Windows/macOS/Linux) se ejecuta en tu propio ordenador junto al asistente de IA que elijas; crea salas y emite invitaciones QR de un solo uso.",
            "Hearth Room se une a una sala desde tu teléfono: escanea la invitación (o pega el enlace) y chatea con tu círculo y con tu asistente. Las fotos, notas de voz y archivos viajan dentro de la misma sala cifrada.",
            "El relay solo reenvía texto cifrado y nunca ve el contenido de los mensajes. Sin cuenta ni registro.",
        ],
        features_header="Funciones:",
        features=[
            "Unirse con un escaneo o pegando un enlace",
            "Transporte cifrado de extremo a extremo a través del relay",
            "Salas de grupo con las personas que tú elijas",
            "Funciona con relays propios, en casa o en la nube",
            "Comandos slash, multimedia y presencia de participantes",
        ],
        need="Hearth Room necesita una sala de PrivateClaw a la que conectarse. El componente de escritorio es gratuito y de código abierto: https://github.com/topcheer/PrivateClaw (la app de Windows está en Microsoft Store).",
        push="Las notificaciones push solo funcionan por defecto con el relay oficial relay.privateclaw.us. Si usas un relay personalizado, conecta el relay y la compilación de la app a tu propio proyecto Firebase / FCM.",
        keywords="privateclaw,hearth,cifrado,chat IA,relay,QR,autoalojado,chat seguro,chat de grupo",
        promo="Deja atrás el chat público y habla con tu círculo y tu propio asistente de IA en una sala PrivateClaw cifrada de un solo uso.",
        mac_intro="Hearth Room for Mac es el cliente de Mac para PrivateClaw, un sistema de chat de código abierto y solo por invitación que da a tu asistente de IA autoalojado una sala privada cifrada de extremo a extremo para las personas en las que de verdad confías.",
        mac_join="Hearth Room se une a una sala desde tu Mac: pega el enlace de invitación (o abre una imagen QR guardada) y chatea con tu círculo y con tu asistente. Las fotos, notas de voz y archivos viajan dentro de la misma sala cifrada.",
    ),
    "pt-BR": dict(
        intro="Hearth Room é o cliente de iPhone e iPad do PrivateClaw, um sistema de conversa de código aberto e somente por convite que dá ao seu assistente de IA auto-hospedado uma sala privada criptografada de ponta a ponta para as pessoas em quem você realmente confia.",
        how=[
            "O componente de desktop do PrivateClaw (grátis, Windows/macOS/Linux) roda no seu próprio computador, ao lado do assistente de IA da sua escolha; ele cria salas e emite convites QR de uso único.",
            "Hearth Room entra em uma sala pelo seu telefone: escaneie o convite (ou cole o link) e converse com seu círculo e com o seu assistente. Fotos, mensagens de voz e arquivos trafegam dentro da mesma sala criptografada.",
            "O relay encaminha apenas texto cifrado e nunca vê o conteúdo das mensagens. Sem conta e sem cadastro.",
        ],
        features_header="Recursos:",
        features=[
            "Entrar com um scan ou colando um link",
            "Transporte criptografado de ponta a ponta pelo relay",
            "Salas de grupo com as pessoas que você escolher",
            "Funciona com relays próprios, em casa ou na nuvem",
            "Comandos slash, mídia e presença dos participantes",
        ],
        need="Hearth Room precisa de uma sala do PrivateClaw para se conectar. O componente de desktop é grátis e de código aberto: https://github.com/topcheer/PrivateClaw (o app para Windows está na Microsoft Store).",
        push="As notificações push só funcionam por padrão no relay oficial relay.privateclaw.us. Se usar um relay personalizado, conecte o relay e o build do app ao seu próprio projeto Firebase / FCM.",
        keywords="privateclaw,hearth,criptografado,chat IA,relay,QR,auto-hospedado,chat seguro,chat de grupo",
        promo="Saia dos chats públicos e converse com seu círculo e o seu próprio assistente de IA em uma sala PrivateClaw criptografada de uso único.",
        mac_intro="Hearth Room for Mac é o cliente de Mac do PrivateClaw, um sistema de conversa de código aberto e somente por convite que dá ao seu assistente de IA auto-hospedado uma sala privada criptografada de ponta a ponta para as pessoas em quem você realmente confia.",
        mac_join="Hearth Room entra em uma sala pelo seu Mac: cole o link do convite (ou abra uma imagem QR salva) e converse com seu círculo e com o seu assistente. Fotos, mensagens de voz e arquivos trafegam dentro da mesma sala criptografada.",
    ),
    "id": dict(
        intro="Hearth Room adalah klien iPhone dan iPad untuk PrivateClaw, sistem chat open source berbasis undangan yang memberi asisten AI yang Anda host sendiri ruang privat terenkripsi ujung ke ujung hanya untuk orang yang benar-benar Anda percaya.",
        how=[
            "Komponen desktop PrivateClaw (gratis, Windows/macOS/Linux) berjalan di komputer Anda sendiri di samping asisten AI pilihan Anda; ia membuat ruang dan menerbitkan undangan QR sekali pakai.",
            "Hearth Room bergabung ke ruang dari ponsel Anda: pindai undangan (atau tempel tautan undangan) lalu mengobrol dengan lingkaran Anda dan asisten Anda. Foto, pesan suara, dan file dikirim di dalam ruang terenkripsi yang sama.",
            "Relay hanya meneruskan teks tersandi dan tidak pernah melihat isi pesan. Tanpa akun, tanpa pendaftaran.",
        ],
        features_header="Fitur:",
        features=[
            "Bergabung dengan satu scan atau menempel tautan",
            "Transport terenkripsi ujung ke ujung melalui relay",
            "Ruang grup hanya dengan orang yang Anda pilih",
            "Mendukung relay kustom di rumah atau di cloud",
            "Perintah slash, media, dan status kehadiran peserta",
        ],
        need="Hearth Room membutuhkan ruang PrivateClaw untuk terhubung. Komponen desktop gratis dan open source: https://github.com/topcheer/PrivateClaw (aplikasi Windows tersedia di Microsoft Store).",
        push="Notifikasi push secara bawaan hanya tersedia di relay resmi relay.privateclaw.us. Jika menggunakan relay kustom, hubungkan relay dan build aplikasi ke proyek Firebase / FCM Anda sendiri.",
        keywords="privateclaw,hearth,terenkripsi,chat ai,relay,QR,self-hosted,chat aman,chat grup",
        promo="Tinggalkan chat publik dan bicara dengan lingkaran Anda serta asisten AI Anda sendiri di ruang PrivateClaw terenkripsi sekali pakai.",
        mac_intro="Hearth Room for Mac adalah klien Mac untuk PrivateClaw, sistem chat open source berbasis undangan yang memberi asisten AI yang Anda host sendiri ruang privat terenkripsi ujung ke ujung hanya untuk orang yang benar-benar Anda percaya.",
        mac_join="Hearth Room bergabung ke ruang dari Mac Anda: tempel tautan undangan (atau buka gambar QR yang disimpan) lalu mengobrol dengan lingkaran Anda dan asisten Anda. Foto, pesan suara, dan file dikirim di dalam ruang terenkripsi yang sama.",
    ),
    "vi": dict(
        intro="Hearth Room là ứng dụng khách iPhone và iPad cho PrivateClaw, một hệ thống nhắn tin mã nguồn mở chỉ cho phép mời, mang lại cho trợ lý AI tự lưu trữ của bạn một phòng riêng tư được mã hóa đầu cuối, chỉ dành cho những người bạn thực sự tin tưởng.",
        how=[
            "Thành phần máy tính để bàn của PrivateClaw (miễn phí, Windows/macOS/Linux) chạy trên chính máy tính của bạn, cạnh trợ lý AI mà bạn chọn; nó tạo phòng và cấp lời mời QR dùng một lần.",
            "Hearth Room tham gia phòng từ điện thoại: quét lời mời (hoặc dán liên kết mời) rồi trò chuyện với nhóm của bạn và với trợ lý. Ảnh, ghi âm và tệp được gửi trong cùng phòng mã hóa.",
            "Relay chỉ chuyển tiếp bản mã và không bao giờ thấy nội dung tin nhắn. Không cần tài khoản hay đăng ký.",
        ],
        features_header="Tính năng:",
        features=[
            "Tham gia bằng một lần quét hoặc dán liên kết",
            "Truyền tải mã hóa đầu cuối qua relay",
            "Phòng nhóm chỉ với những người bạn chọn",
            "Hoạt động với relay tự đặt tại nhà hoặc trên đám mây",
            "Lệnh slash, đa phương tiện và trạng thái thành viên",
        ],
        need="Hearth Room cần một phòng PrivateClaw để kết nối. Thành phần máy tính để bàn miễn phí và mã nguồn mở: https://github.com/topcheer/PrivateClaw (ứng dụng Windows có trên Microsoft Store).",
        push="Thông báo đẩy theo mặc định chỉ hoạt động với relay chính thức relay.privateclaw.us. Nếu dùng relay tùy chỉnh, hãy kết nối relay và bản build ứng dụng với dự án Firebase / FCM của riêng bạn.",
        keywords="privateclaw,hearth,mã hóa,trò chuyện ai,relay,QR,tự lưu trữ,chat an toàn,chat nhóm",
        promo="Rời khỏi chat công khai và trò chuyện với nhóm của bạn cùng trợ lý AI của riêng bạn trong phòng PrivateClaw được mã hóa, dùng một lần.",
        mac_intro="Hearth Room for Mac là ứng dụng khách Mac cho PrivateClaw, một hệ thống nhắn tin mã nguồn mở chỉ cho phép mời, mang lại cho trợ lý AI tự lưu trữ của bạn một phòng riêng tư được mã hóa đầu cuối, chỉ dành cho những người bạn thực sự tin tưởng.",
        mac_join="Hearth Room tham gia phòng từ máy Mac: dán liên kết mời (hoặc mở ảnh QR đã lưu) rồi trò chuyện với nhóm của bạn và với trợ lý. Ảnh, ghi âm và tệp được gửi trong cùng phòng mã hóa.",
    ),
    "ar-SA": dict(
        intro="Hearth Room هو تطبيق iPhone وiPad الخاص بـ PrivateClaw، وهو نظام محادثة مفتوح المصدر بالدعوة فقط يمنح مساعد الذكاء الاصطناعي المستضاف ذاتيًا غرفة خاصة مشفرة من الطرف إلى الطرف مخصصة للأشخاص الذين تثق بهم حقًا.",
        how=[
            "مكوّن سطح المكتب من PrivateClaw (مجاني، Windows/macOS/Linux) يعمل على حاسوبك الخاص بجانب مساعد الذكاء الاصطناعي الذي تختاره، وهو ينشئ الغرف ويصدر دعوات QR لمرة واحدة.",
            "ينضم Hearth Room إلى الغرفة من هاتفك: امسح الدعوة ضوئيًا (أو الصق رابط الدعوة) وتحدث مع مقربيك ومع مساعدك. تنتقل الصور والرسائل الصوتية والملفات داخل الغرفة المشفرة نفسها.",
            "يمرّر الوسيط النص المشفر فقط ولا يرى محتوى الرسائل أبدًا. لا حساب ولا تسجيل.",
        ],
        features_header="الميزات:",
        features=[
            "الانضمام بمسح واحد أو لصق رابط",
            "نقل مشفر من الطرف إلى الطرف عبر الوسيط",
            "غرف جماعية مع الأشخاص الذين تختارهم فقط",
            "يعمل مع وسيط مخصص في المنزل أو السحابة",
            "أوامر الشرطة المائلة والوسائط وحالة حضور المشاركين",
        ],
        need="يحتاج Hearth Room إلى غرفة PrivateClaw للاتصال. مكوّن سطح المكتب مجاني ومفتوح المصدر: https://github.com/topcheer/PrivateClaw (تطبيق Windows متوفر على Microsoft Store).",
        push="الإشعارات الفورية متاحة افتراضيًا فقط عبر الوسيط الرسمي relay.privateclaw.us. إذا استخدمت وسيطًا مخصصًا، اربط الوسيط وإصدار التطبيق بمشروع Firebase / FCM الخاص بك.",
        keywords="privateclaw,hearth,مشفر,دردشة ذكاء اصطناعي,وسيط,QR,استضافة ذاتية,دردشة آمنة,دردشة جماعية",
        promo="اترك الدردشات العامة وتحدث مع مقربيك ومع مساعد الذكاء الاصطناعي الخاص بك في غرفة PrivateClaw مشفرة لمرة واحدة.",
        mac_intro="Hearth Room for Mac هو تطبيق Mac الخاص بـ PrivateClaw، وهو نظام محادثة مفتوح المصدر بالدعوة فقط يمنح مساعد الذكاء الاصطناعي المستضاف ذاتيًا غرفة خاصة مشفرة من الطرف إلى الطرف مخصصة للأشخاص الذين تثق بهم حقًا.",
        mac_join="ينضم Hearth Room إلى الغرفة من جهاز Mac: الصق رابط الدعوة (أو افتح صورة QR محفوظة) وتحدث مع مقربيك ومع مساعدك. تنتقل الصور والرسائل الصوتية والملفات داخل الغرفة المشفرة نفسها.",
    ),
}

LOCALES = sorted(COPY)


def description(locale: str, mac: bool) -> str:
    c = COPY[locale]
    intro = c["mac_intro"] if mac else c["intro"]
    how = list(c["how"])
    if mac:
        how[1] = c["mac_join"]
    parts = [
        intro,
        "",
        "How it works:" if locale == "en-US" else {"zh-Hans": "工作方式：", "zh-Hant": "運作方式：", "ja": "仕組み：", "ko": "작동 방식:", "de-DE": "So funktioniert es:", "fr-FR": "Fonctionnement :", "es-ES": "Cómo funciona:", "pt-BR": "Como funciona:", "id": "Cara kerja:", "vi": "Cách hoạt động:", "ar-SA": "كيف يعمل:"}[locale],
        *[f"- {h}" for h in how],
        "",
        c["features_header"],
        *[f"- {f}" for f in c["features"]],
        "",
        c["need"],
        "",
        c["push"],
    ]
    return "\n".join(parts)


def review_notes(mac: bool) -> str:
    platform = "Mac" if mac else "iPhone/iPad"
    app_word = "the Mac app" if mac else "the iOS app"
    scan_step = (
        'In the Mac app, open the saved QR image (or paste the invite text)'
        if mac
        else 'In the iOS app, tap "Scan QR code" and scan the QR image (or paste the invite text)'
    )
    review_dir = pathlib.Path(os.environ.get("REVIEW_DIR", ""))
    def invite(name: str) -> str:
        f = review_dir / name
        return f.read_text().strip() if f.exists() else "<see attached zip>"
    return f"""Thank you for reviewing Hearth Room.

WHAT HEARTH IS
Hearth Room is the {platform} client for PrivateClaw, an open-source, invite-only, end-to-end encrypted chat system for small trusted circles and a self-hosted AI assistant. PrivateClaw has two parts:
1. A free desktop component (Windows/macOS/Linux) that runs on the user's own computer next to the AI assistant runtime of their choice. It creates rooms and issues one-time QR invites.
2. Hearth Room (this app), which joins one of those rooms from a {platform} and sends messages, photos, voice notes, and files.
No account, sign-up, subscription, or third-party login is involved. Messages are end-to-end encrypted; the relay only ever sees ciphertext plus delivery metadata.

HOW TO TEST - READY-TO-USE INVITES (attached)
Attached to this submission: hearth-app-review-pairing-0.1.20.zip, containing two invites, each as text and as a QR image:
- direct-pairing.txt / direct-pairing-qr.png  (one-to-one room, the default flow)
- group-pairing.txt / group-pairing-qr.png    (group room; scan it on two devices or installs to see shared-room behaviour)
{scan_step}. The invites are valid until 2026-12-24. If a session nears expiry during review, use the in-app renew control or send /renew-session.

Direct invite URI:
{invite("direct-pairing.txt")}

Group invite URI:
{invite("group-pairing.txt")}

WALKTHROUGH VIDEO - how the desktop side works
Rooms are created by the desktop component, so {app_word} needs an invite before it can open a room. This recording shows the real flow end to end (desktop component creates the room -> iPhone joins -> messages flow both ways, encrypted):
{VIDEO_URL}
The desktop component is free and open source: https://github.com/topcheer/PrivateClaw (Windows build on the Microsoft Store: https://apps.microsoft.com/detail/9P12LL1LT8RD). Privacy policy: https://privateclaw.us/privacy/

{CONTACT_LINE}
"""


def main() -> None:
    written = 0
    for platform_dir, mac in (("ios", False), ("macos", True)):
        meta = APP_ROOT / platform_dir / "fastlane" / "metadata"
        for locale in LOCALES:
            d = meta / locale
            d.mkdir(parents=True, exist_ok=True)
            (d / "description.txt").write_text(description(locale, mac) + "\n", encoding="utf-8")
            (d / "keywords.txt").write_text(COPY[locale]["keywords"] + "\n", encoding="utf-8")
            (d / "promotional_text.txt").write_text(COPY[locale]["promo"] + "\n", encoding="utf-8")
            (d / "name.txt").write_text(NEW_NAME + "\n", encoding="utf-8")
            written += 4
        notes_dir = meta / "review_information"
        notes_dir.mkdir(parents=True, exist_ok=True)
        (notes_dir / "notes.txt").write_text(review_notes(mac), encoding="utf-8")
        written += 1
    print(f"wrote {written} metadata files across {len(LOCALES)} locales (iOS + macOS)")


if __name__ == "__main__":
    main()
