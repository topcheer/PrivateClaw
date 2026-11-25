#!/usr/bin/env python3
"""Build App Store screenshots of the real Hearth Room app (iOS, iPadOS, macOS).

Pipeline:
  1. Launch the already-built app (`flutter build ios --simulator` /
     `flutter build macos --debug`) once per locale x scenario. The app reads
     `privateclaw-screenshot.json` from its Documents directory (iOS) or the
     PRIVATECLAW_SCREENSHOT_* environment variables (macOS) and renders a
     deterministic preview of a real session.
  2. Capture the simulator window / macOS window at native resolution.
  3. Compose a store-ready frame: brand gradient, localized headline and
     subline, and the real capture inside a device bezel. Output sizes match
     App Store Connect display types:
       iPhone 6.9"  1320 x 2868   (APP_IPHONE_67)
       iPad 13"     2064 x 2752   (APP_IPAD_PRO_3GEN_129)
       macOS        2880 x 1800   (APP_DESKTOP, 1440 x 900 @2x)

Usage:
  python3 scripts/build-store-screenshots.py [--platform ios|macos|all] \
      [--locales en-US,zh-Hans] [--scenarios welcome,group_chat,rich_media] \
      [--skip-capture] [--skip-compose] [--raw-dir DIR]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_DIR = ROOT_DIR / "apps" / "privateclaw_app"
IOS_BUNDLE_ID = "gg.ai.privateclaw"
MACOS_APP_NAME = "Hearth Room"
IOS_PHONE_DEVICE = os.environ.get("PRIVATECLAW_IOS_PHONE_DEVICE", "iPhone 17 Pro Max")
IOS_TABLET_DEVICE = os.environ.get("PRIVATECLAW_IOS_TABLET_DEVICE", "iPad Pro 13-inch (M5)")
MACOS_WINDOW_SIZE = (1440, 900)
CONFIG_FILE_NAME = "privateclaw-screenshot.json"

LOCALES = ["en-US", "zh-Hans", "zh-Hant", "ja", "ko", "de-DE", "fr-FR", "es-ES", "pt-BR", "id", "vi", "ar-SA"]
SCENARIOS = [("welcome", "01-welcome"), ("group_chat", "02-group-chat"), ("rich_media", "03-rich-media")]

# --------------------------------------------------------------------------
# Copy: (headline, subline) per locale and scenario, aligned with the store
# description (sync-store-copy.py). Keep headlines <= ~30 characters.
# --------------------------------------------------------------------------
CAPTIONS = {
    "en-US": {
        "welcome": ("One scan. A private room.", "Open a one-time QR invite and step into an end-to-end encrypted room with your assistant."),
        "group_chat": ("Your circle and your assistant", "Group rooms with the people you choose. The relay only ever sees ciphertext."),
        "rich_media": ("Photos, voice notes and files", "Markdown, media and slash commands in a familiar chat layout, all inside the encrypted session."),
    },
    "zh-Hans": {
        "welcome": ("扫码即入私密房间", "扫描一次性二维码邀请，与你的 AI 助手进入端到端加密的房间。"),
        "group_chat": ("你的圈子，你的助手", "只邀请你信任的人加入群聊，中继只能看到密文。"),
        "rich_media": ("图片、语音、文件", "Markdown、附件与斜杠命令，熟悉的聊天界面，全部留在加密会话里。"),
    },
    "zh-Hant": {
        "welcome": ("掃碼即入私密房間", "掃描一次性 QR 邀請，與你的 AI 助手進入端對端加密的房間。"),
        "group_chat": ("你的圈子，你的助手", "只邀請你信任的人加入群聊，中繼只能看到密文。"),
        "rich_media": ("圖片、語音、檔案", "Markdown、附件與斜線指令，熟悉的聊天介面，全部留在加密工作階段。"),
    },
    "ja": {
        "welcome": ("スキャンで秘密の部屋へ", "使い捨て QR 招待を読み取るだけで、AI アシスタントとエンドツーエンド暗号化の部屋に入れます。"),
        "group_chat": ("仲間とアシスタントを一つの部屋に", "信頼する人だけを招くグループルーム。リレーが見られるのは暗号文だけです。"),
        "rich_media": ("写真・ボイスメモ・ファイル", "Markdown、添付、スラッシュコマンドも、すべて暗号化セッション内で。"),
    },
    "ko": {
        "welcome": ("한 번의 스캔으로 비공개 방", "일회용 QR 초대를 스캔해 AI 어시스턴트와 종단간 암호화된 방에 입장하세요."),
        "group_chat": ("사람과 어시스턴트를 한 방에", "신뢰하는 사람만 초대하는 그룹 방. 릴레이는 암호문만 전달합니다."),
        "rich_media": ("사진, 음성 메모, 파일", "Markdown, 첨부 파일, 슬래시 명령까지 익숙한 채팅 화면에서, 모두 암호화 세션 안에."),
    },
    "de-DE": {
        "welcome": ("Ein privater Raum per Scan", "Einmal-QR-Einladung scannen und mit deinem Assistenten einen Ende-zu-Ende-verschlüsselten Raum betreten."),
        "group_chat": ("Dein Kreis und dein Assistent", "Gruppenräume nur mit Menschen, denen du vertraust. Das Relay sieht nur Chiffretext."),
        "rich_media": ("Fotos, Sprachnotizen, Dateien", "Markdown, Anhänge und Slash-Befehle im gewohnten Chat-Layout, alles in der verschlüsselten Sitzung."),
    },
    "fr-FR": {
        "welcome": ("Un salon privé en un scan", "Scannez une invitation QR à usage unique et entrez dans un salon chiffré de bout en bout avec votre assistant."),
        "group_chat": ("Votre cercle et votre assistant", "Des salons de groupe avec les personnes que vous choisissez. Le relais ne voit que du texte chiffré."),
        "rich_media": ("Photos, notes vocales, fichiers", "Markdown, pièces jointes et commandes dans une interface de chat familière, tout dans la session chiffrée."),
    },
    "es-ES": {
        "welcome": ("Una sala privada con un escaneo", "Escanea una invitación QR de un solo uso y entra en una sala cifrada de extremo a extremo con tu asistente."),
        "group_chat": ("Tu círculo y tu asistente", "Salas de grupo solo con las personas que elijas. El relay solo ve texto cifrado."),
        "rich_media": ("Fotos, notas de voz y archivos", "Markdown, adjuntos y comandos en un diseño de chat familiar, todo dentro de la sesión cifrada."),
    },
    "pt-BR": {
        "welcome": ("Uma sala privada em um scan", "Escaneie um convite QR de uso único e entre em uma sala criptografada de ponta a ponta com seu assistente."),
        "group_chat": ("Seu círculo e seu assistente", "Salas de grupo só com quem você escolher. O relay só vê texto cifrado."),
        "rich_media": ("Fotos, notas de voz e arquivos", "Markdown, anexos e comandos em um layout de chat familiar, tudo dentro da sessão criptografada."),
    },
    "id": {
        "welcome": ("Ruang privat dalam sekali scan", "Pindai undangan QR sekali pakai dan masuk ke ruang terenkripsi ujung ke ujung bersama asistenmu."),
        "group_chat": ("Lingkaranmu dan asistenmu", "Ruang grup hanya dengan orang yang kamu pilih. Relay hanya melihat ciphertext."),
        "rich_media": ("Foto, catatan suara, dan file", "Markdown, lampiran, dan perintah slash dalam tata letak chat yang akrab, semuanya di dalam sesi terenkripsi."),
    },
    "vi": {
        "welcome": ("Một phòng riêng với một lần quét", "Quét lời mời QR dùng một lần để vào phòng mã hóa đầu cuối cùng với trợ lý của bạn."),
        "group_chat": ("Vòng kết nối của bạn và trợ lý", "Phòng nhóm chỉ với những người bạn chọn. Relay chỉ thấy bản mã."),
        "rich_media": ("Ảnh, ghi âm và tệp", "Markdown, tệp đính kèm và lệnh slash trong giao diện chat quen thuộc, tất cả ở trong phiên mã hóa."),
    },
    "ar-SA": {
        "welcome": ("غرفة خاصة بمسح واحد", "امسح رمز دعوة لمرة واحدة وادخل غرفة مشفرة من الطرف إلى الطرف مع مساعدك."),
        "group_chat": ("دائرتك ومساعدك", "غرف جماعية مع من تختارهم فقط. لا يرى الوسيط سوى النص المشفر."),
        "rich_media": ("صور ورسائل صوتية وملفات", "النصوص المنسقة والمرفقات والأوامر المختصرة في واجهة دردشة مألوفة، وكل ذلك يبقى داخل الجلسة المشفرة."),
    },
}

# --------------------------------------------------------------------------
# Fonts (macOS system fonts). headline / subline per script family.
# --------------------------------------------------------------------------
SF = "/System/Library/Fonts/SFNS.ttf"
FONT_SPECS = {
    "latin": {"path": SF, "headline": {"variation": "Bold"}, "subline": {"variation": "Medium"}, "wordmark": {"variation": "Semibold"}},
    "zh-Hans": {"path": "/System/Library/Fonts/Hiragino Sans GB.ttc", "headline": {"index": 2}, "subline": {"index": 0}},
    "zh-Hant": {"path": "/System/Library/Fonts/STHeiti Medium.ttc", "headline": {"index": 0}, "subline": {"path": "/System/Library/Fonts/STHeiti Light.ttc", "index": 0}},
    "ja": {"path": "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", "headline": {"index": 0}, "subline": {"path": "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc", "index": 0}},
    "ko": {"path": "/System/Library/Fonts/AppleSDGothicNeo.ttc", "headline": {"index": 6}, "subline": {"index": 0}},
    "ar": {"path": "/System/Library/Fonts/GeezaPro.ttc", "headline": {"index": 1}, "subline": {"index": 0}, "rtl": True},
}
LATIN_LOCALES = {"en-US", "de-DE", "fr-FR", "es-ES", "pt-BR", "id", "vi"}


def font_key(locale: str) -> str:
    if locale in LATIN_LOCALES:
        return "latin"
    return "ar" if locale.startswith("ar") else locale


def font_for(locale: str, role: str, size: int) -> ImageFont.FreeTypeFont:
    spec = FONT_SPECS[font_key(locale)]
    opts = dict(spec.get(role, spec["headline"]))
    path = opts.pop("path", spec["path"])
    font = ImageFont.truetype(path, size, index=opts.pop("index", 0))
    variation = opts.pop("variation", None)
    if variation:
        try:
            font.set_variation_by_name(variation)
        except Exception:  # variable font not supported for this face
            pass
    return font


def is_rtl(locale: str) -> bool:
    return FONT_SPECS.get(font_key(locale), {}).get("rtl", False)


def wrap(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw, rtl: bool) -> list[str]:
    tokens = text.split(" ") if " " in text else list(text)
    separators = " " if " " in text else ""
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = token if not current else current + separators + token
        width = draw.textlength(candidate, font=font, direction="rtl" if rtl else "ltr")
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = token
    if current:
        lines.append(current)
    return lines


def fit_block(draw: ImageDraw.ImageDraw, text: str, locale: str, role: str, size: int, max_width: int, max_lines: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    rtl = is_rtl(locale)
    while size > 20:
        font = font_for(locale, role, size)
        lines = wrap(text, font, max_width, draw, rtl)
        if len(lines) <= max_lines:
            return font, lines
        size -= 4
    return font, lines


def draw_block(draw: ImageDraw.ImageDraw, lines: list[str], font: ImageFont.FreeTypeFont, x: int, y: int, fill, line_gap: float, align_center: bool, rtl: bool) -> int:
    ascent, descent = font.getmetrics()
    line_height = ascent + descent
    step = int(line_height * line_gap)
    for line in lines:
        if align_center:
            draw.text((x, y), line, font=font, fill=fill, anchor="mt", direction="rtl" if rtl else "ltr")
        elif rtl:
            # `x` is the right margin for RTL captions
            draw.text((x, y), line, font=font, fill=fill, anchor="rt", direction="rtl")
        else:
            draw.text((x, y), line, font=font, fill=fill, direction="ltr")
        y += step
    return y - step + line_height


def background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    base = Image.new("RGB", size, (10, 20, 38))
    top, bottom = (9, 17, 33), (19, 35, 60)
    gradient = Image.linear_gradient("L").resize((1, height))
    gradient = Image.merge("RGB", (
        gradient.point(lambda v: int(top[0] + (bottom[0] - top[0]) * v / 255)),
        gradient.point(lambda v: int(top[1] + (bottom[1] - top[1]) * v / 255)),
        gradient.point(lambda v: int(top[2] + (bottom[2] - top[2]) * v / 255)),
    ))
    base = gradient.resize(size)
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    radius = int(width * 0.55)
    gdraw.ellipse((width - radius * 0.7, -radius * 0.6, width + radius * 0.7, radius * 0.8), fill=(52, 226, 154, 70))
    gdraw.ellipse((-radius * 0.8, height - radius * 0.9, radius * 0.6, height + radius * 0.5), fill=(93, 95, 239, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 3))
    base = Image.alpha_composite(base.convert("RGBA"), glow)
    return base


def rounded(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius=radius, fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def paste_device(canvas: Image.Image, shot: Image.Image, box: tuple[int, int, int, int], corner: int, bezel: int, rtl: bool = False) -> None:
    x, y, w, h = box
    shot = shot.convert("RGB").resize((w, h), Image.LANCZOS)
    shot = rounded(shot, corner)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - bezel, y - bezel + 36, x + w + bezel, y + h + bezel + 36), radius=corner + bezel, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(48))
    canvas.alpha_composite(shadow)
    frame = Image.new("RGBA", (w + bezel * 2, h + bezel * 2), (8, 10, 16, 255))
    frame = rounded(frame, corner + bezel)
    canvas.alpha_composite(frame, (x - bezel, y - bezel))
    canvas.alpha_composite(shot, (x, y))


def compose_phone(shot: Image.Image, locale: str, scenario: str, size: tuple[int, int], tablet: bool) -> Image.Image:
    width, height = size
    margin = 150 if not tablet else 170
    canvas = background(size)
    draw = ImageDraw.Draw(canvas)
    rtl = is_rtl(locale)
    icon_size = 88 if not tablet else 108
    icon = Image.open(APP_DIR / "assets" / "branding" / "privateclaw_app_icon.png").convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
    icon = rounded(icon, icon_size // 4)
    word_size = 54 if not tablet else 66
    word_font = font_for("latin", "wordmark", word_size)
    word_y = margin - 30
    draw.text((margin + icon_size + 26, word_y + icon_size // 2), "Hearth Room", font=word_font, fill=(255, 255, 255, 255), anchor="lm")
    canvas.alpha_composite(icon, (margin, word_y))

    text_width = width - margin * 2
    text_x = width - margin if rtl else margin
    head_size = 96 if not tablet else 128
    sub_size = 54 if not tablet else 70
    head_font, head_lines = fit_block(draw, CAPTIONS[locale][scenario][0], locale, "headline", head_size, text_width, 2)
    y = word_y + icon_size + 60
    y = draw_block(draw, head_lines, head_font, text_x, y, (255, 255, 255, 255), 1.18, False, rtl)
    sub_font, sub_lines = fit_block(draw, CAPTIONS[locale][scenario][1], locale, "subline", sub_size, text_width, 3)
    y = draw_block(draw, sub_lines, sub_font, text_x, y + 30, (178, 194, 214, 255), 1.25, False, rtl)

    top = y + 76
    bottom_margin = 110
    max_h = height - top - bottom_margin
    ratio = shot.width / shot.height
    frame_w = min(width - margin * 2 + 60, int(max_h * ratio))
    frame_h = int(frame_w / ratio)
    x = (width - frame_w) // 2
    paste_device(canvas, shot, (x, top, frame_w, frame_h), corner=int(frame_w * 0.135), bezel=max(10, frame_w // 70))
    return canvas.convert("RGB")


def compose_desktop(shot: Image.Image, locale: str, scenario: str, size: tuple[int, int]) -> Image.Image:
    width, height = size
    canvas = background(size)
    draw = ImageDraw.Draw(canvas)
    rtl = is_rtl(locale)
    margin = 170
    icon_size = 112
    icon = Image.open(APP_DIR / "assets" / "branding" / "privateclaw_app_icon.png").convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
    icon = rounded(icon, icon_size // 4)
    word_font = font_for("latin", "wordmark", 68)
    word_y = 250
    draw.text((margin + icon_size + 28, word_y + icon_size // 2), "Hearth Room", font=word_font, fill=(255, 255, 255, 255), anchor="lm")
    canvas.alpha_composite(icon, (margin, word_y))

    text_width = 900
    text_x = margin + text_width if rtl else margin
    head_font, head_lines = fit_block(draw, CAPTIONS[locale][scenario][0], locale, "headline", 124, text_width, 3)
    y = draw_block(draw, head_lines, head_font, text_x, word_y + icon_size + 80, (255, 255, 255, 255), 1.16, False, rtl)
    sub_font, sub_lines = fit_block(draw, CAPTIONS[locale][scenario][1], locale, "subline", 68, text_width, 5)
    draw_block(draw, sub_lines, sub_font, text_x, y + 36, (178, 194, 214, 255), 1.28, False, rtl)

    frame_w = width - margin * 2 - text_width - 80
    ratio = shot.width / shot.height
    frame_h = int(frame_w / ratio)
    if frame_h > height - 300:
        frame_h = height - 300
        frame_w = int(frame_h * ratio)
    x = width - frame_w - 150
    y = (height - frame_h) // 2
    paste_device(canvas, shot, (x, y, frame_w, frame_h), corner=28, bezel=2)
    return canvas.convert("RGB")


# --------------------------------------------------------------------------
# Capture helpers
# --------------------------------------------------------------------------
def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kwargs)


def simctl_devices() -> dict[str, str]:
    payload = json.loads(run(["xcrun", "simctl", "list", "devices", "available", "-j"]).stdout)
    found: dict[str, str] = {}
    for devices in payload["devices"].values():
        for device in devices:
            if device.get("isAvailable", True) and device["name"] not in found:
                found[device["name"]] = device["udid"]
    return found


def boot(udid: str) -> None:
    subprocess.run(["xcrun", "simctl", "boot", udid], capture_output=True)
    run(["xcrun", "simctl", "bootstatus", udid, "-b"])


def status_bar(udid: str, clear: bool = False) -> None:
    if clear:
        subprocess.run(["xcrun", "simctl", "status_bar", udid, "clear"], capture_output=True)
        return
    run(["xcrun", "simctl", "status_bar", udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiBars", "3",
        "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "discharging", "--batteryLevel", "100"])


def retouch_ipad_status_bar(path: Path) -> None:
    """iPad simulators print the real date next to the clock (no simctl override
    for it); paint it over with the status bar colour so listings show only 9:41."""
    shot = Image.open(path).convert("RGB")
    width, height = shot.size
    bg = shot.getpixel((int(width * 0.45), 20))
    ImageDraw.Draw(shot).rectangle((int(width * 0.064), 8, int(width * 0.162), 58), fill=bg)
    shot.save(path, optimize=True)


def capture_ios(raw_dir: Path, locales: list[str], scenarios: list[tuple[str, str]]) -> None:
    app = APP_DIR / "build" / "ios" / "iphonesimulator" / "Runner.app"
    if not app.exists():
        sys.exit(f"Missing {app}. Run `flutter build ios --simulator` first.")
    devices = simctl_devices()
    targets = [("iphone", IOS_PHONE_DEVICE), ("ipad", IOS_TABLET_DEVICE)]
    for suffix, name in targets:
        if name not in devices:
            sys.exit(f"Simulator {name!r} not found. Available: {sorted(devices)}")
    boot(devices[IOS_PHONE_DEVICE])
    boot(devices[IOS_TABLET_DEVICE])
    for suffix, name in targets:
        udid = devices[name]
        status_bar(udid)
        run(["xcrun", "simctl", "install", udid, str(app)])
    containers = {suffix: Path(run(["xcrun", "simctl", "get_app_container", devices[name], IOS_BUNDLE_ID, "data"]).stdout.strip()) / "Documents" for suffix, name in targets}
    for c in containers.values():
        c.mkdir(parents=True, exist_ok=True)
    for locale in locales:
        for scenario, file_name in scenarios:
            for suffix, name in targets:
                udid = devices[name]
                config = containers[suffix] / CONFIG_FILE_NAME
                config.write_text(json.dumps({"scenario": scenario, "locale": locale}))
                run(["xcrun", "simctl", "launch", "--terminate-running-process", udid, IOS_BUNDLE_ID])
                time.sleep(3.5)
                out = raw_dir / locale / f"{file_name}-{suffix}.png"
                out.parent.mkdir(parents=True, exist_ok=True)
                run(["xcrun", "simctl", "io", udid, "screenshot", str(out)])
                if suffix == "ipad":
                    retouch_ipad_status_bar(out)
                print(f"captured {out.relative_to(raw_dir)}")
    for suffix, name in targets:
        (containers[suffix] / CONFIG_FILE_NAME).unlink(missing_ok=True)
        status_bar(devices[name], clear=True)


def capture_macos(raw_dir: Path, locales: list[str], scenarios: list[tuple[str, str]]) -> None:
    app = APP_DIR / "build" / "macos" / "Build" / "Products" / "Debug" / f"{MACOS_APP_NAME}.app"
    binary = app / "Contents" / "MacOS" / MACOS_APP_NAME
    if not binary.exists():
        sys.exit(f"Missing {binary}. Run `flutter build macos --debug` first.")
    width, height = MACOS_WINDOW_SIZE
    origin = (80, 80)
    frontmost = (
        'tell application "System Events" to tell (first process whose name is "%s")\n'
        "  set frontmost to true\n"
        "  set position of window 1 to {%d, %d}\n"
        "  set size of window 1 to {%d, %d}\n"
        "end tell" % (MACOS_APP_NAME, *origin, width, height)
    )
    hide_others = (
        'tell application "System Events" to set visible of every process to false\n'
        'tell application "System Events" to tell (first process whose name is "%s") to set visible to true'
        % MACOS_APP_NAME
    )
    for locale in locales:
        for scenario, file_name in scenarios:
            subprocess.run(["pkill", "-f", str(binary)], capture_output=True)
            time.sleep(0.8)
            env = dict(os.environ, PRIVATECLAW_SCREENSHOT_SCENARIO=scenario, PRIVATECLAW_SCREENSHOT_LOCALE=locale)
            process = subprocess.Popen([str(binary)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                time.sleep(5.0)  # first frame + preview state
                out = raw_dir / locale / f"{file_name}.png"
                out.parent.mkdir(parents=True, exist_ok=True)
                captured = False
                for attempt in range(3):
                    subprocess.run(["osascript", "-e", frontmost], capture_output=True)
                    if attempt == 2:
                        subprocess.run(["osascript", "-e", hide_others], capture_output=True)
                    time.sleep(1.2)
                    subprocess.run(["screencapture", "-x", "-R", "%d,%d,%d,%d" % (*origin, width, height), str(out)], capture_output=True)
                    if out.exists() and _looks_like_light_app(out):
                        captured = True
                        break
                    print(f"  window occluded on attempt {attempt + 1} for {locale}/{scenario}, retrying")
                if not captured:
                    sys.exit(f"macOS capture failed for {locale}/{scenario}: the window stayed occluded")
                print(f"captured {out.relative_to(raw_dir)}")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                subprocess.run(["osascript", "-e", 'tell application "System Events" to set visible of every process to true'], capture_output=True)


def _looks_like_light_app(path: Path) -> bool:
    """The app renders a light UI; a dark capture means another window covered it."""
    with Image.open(path) as image:
        sample = image.convert("L").resize((64, 40))
        pixels = list(sample.getdata())
    return sum(pixels) / len(pixels) > 170


def compose(raw_dir: Path, locales: list[str], scenarios: list[tuple[str, str]], platform: str) -> None:
    for locale in locales:
        if locale not in CAPTIONS:
            sys.exit(f"No captions for locale {locale}")
        for scenario, file_name in scenarios:
            if platform == "ios":
                out_dir = APP_DIR / "ios" / "fastlane" / "screenshots" / locale
                out_dir.mkdir(parents=True, exist_ok=True)
                phone = compose_phone(Image.open(raw_dir / locale / f"{file_name}-iphone.png"), locale, scenario, (1320, 2868), tablet=False)
                phone.save(out_dir / f"{file_name}-iphone.png", optimize=True)
                tablet = compose_phone(Image.open(raw_dir / locale / f"{file_name}-ipad.png"), locale, scenario, (2064, 2752), tablet=True)
                tablet.save(out_dir / f"{file_name}-ipad.png", optimize=True)
            else:
                out_dir = APP_DIR / "macos" / "fastlane" / "screenshots" / locale
                out_dir.mkdir(parents=True, exist_ok=True)
                desktop = compose_desktop(Image.open(raw_dir / locale / f"{file_name}.png"), locale, scenario, (2880, 1800))
                desktop.save(out_dir / f"{file_name}.png", optimize=True)
            print(f"composed {locale}/{file_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--platform", choices=["ios", "macos", "all"], default="all")
    parser.add_argument("--locales", default=",".join(LOCALES))
    parser.add_argument("--scenarios", default=",".join(s for s, _ in SCENARIOS))
    parser.add_argument("--skip-capture", action="store_true")
    parser.add_argument("--skip-compose", action="store_true")
    parser.add_argument("--raw-dir", default=str(APP_DIR / "build" / "store-screenshots-raw"))
    args = parser.parse_args()

    locales = [l for l in args.locales.split(",") if l]
    wanted = set(args.scenarios.split(","))
    scenarios = [s for s in SCENARIOS if s[0] in wanted]
    raw_dir = Path(args.raw_dir)

    if args.platform in ("ios", "all") and not args.skip_capture:
        capture_ios(raw_dir, locales, scenarios)
    if args.platform in ("macos", "all") and not args.skip_capture:
        capture_macos(raw_dir, locales, scenarios)
    if not args.skip_compose:
        if args.platform in ("ios", "all"):
            compose(raw_dir, locales, scenarios, "ios")
        if args.platform in ("macos", "all"):
            compose(raw_dir, locales, scenarios, "macos")


if __name__ == "__main__":
    main()
