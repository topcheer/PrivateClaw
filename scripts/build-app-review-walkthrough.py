#!/usr/bin/env python3
"""Build the Hearth App Review walkthrough video from real captures (Pillow + ffmpeg)."""
from __future__ import annotations

import glob
import os
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

D = Path("/tmp/hearth-demo")
SITE = Path("/Volumes/new/ggai/PrivateClaw/apps/privateclaw_site/assets/showcase")
QR = sorted(glob.glob(os.path.expanduser("~/.openclaw/media/privateclaw/privateclaw-45a8445d-*.png")))[-1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else D / "hearth-app-review-walkthrough.mp4"
W, H = 1920, 1080
BG = (11, 16, 32)
ACCENT = (183, 173, 255)
SOFT = (200, 206, 226)

FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not Path(FONT_REG).exists():
    FONT_REG = FONT_BOLD = "/System/Library/Fonts/Helvetica.ttc"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    out: list[str] = []
    for para in text.split("\n"):
        if not para:
            out.append("")
            continue
        lines: list[str] = []
        cur = ""
        for word in para.split(" "):
            cand = word if not cur else cur + " " + word
            if draw.textlength(cand, font=fnt) <= max_w or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        out.extend(lines)
    return out


def draw_paragraph(draw, xy, text, fnt, fill, max_w, line_gap=10):
    x, y = xy
    for line in wrap(draw, text, fnt, max_w):
        if line:
            draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    # soft brand glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((-300, -400, 900, 600), fill=(143, 125, 255, 60))
    g.ellipse((1300, 600, 2300, 1500), fill=(72, 214, 180, 40))
    img = Image.alpha_composite(img.convert("RGBA"), glow.convert("RGBA")).convert("RGB")
    return img, ImageDraw.Draw(img)


def fit_h(img: Image.Image, h: int) -> Image.Image:
    w = round(img.width * h / img.height)
    return img.resize((w, h), Image.LANCZOS)


def step_badge(draw, xy, label):
    draw.rounded_rectangle((xy[0], xy[1], xy[0] + draw.textlength(label, font=font(24, True)) + 36, xy[1] + 44), radius=22, fill=(143, 125, 255, 60), outline=ACCENT, width=2)
    draw.text((xy[0] + 18, xy[1] + 9), label, font=font(24, True), fill=ACCENT)


def frame_title(title, subtitle, body):
    img, d = canvas()
    d.text((W / 2 - d.textlength(title, font=font(64, True)) / 2, 300), title, font=font(64, True), fill=(255, 255, 255))
    d.text((W / 2 - d.textlength(subtitle, font=font(32)) / 2, 400), subtitle, font=font(32), fill=ACCENT)
    lines = wrap(d, body, font(34), 1200)
    y = 520
    for ln in lines:
        d.text((W / 2 - d.textlength(ln, font=font(34)) / 2, y), ln, font=font(34), fill=SOFT)
        y += 50
    return img


def frame_left_caption(img_path, caption, badge, caption_xy=(100, 380), img_h=900, img_xy=(1180, 90)):
    img, d = canvas()
    ph = fit_h(Image.open(img_path).convert("RGB"), img_h)
    img.paste(ph, img_xy)
    d.rounded_rectangle((img_xy[0] - 8, img_xy[1] - 8, img_xy[0] + ph.width + 8, img_xy[1] + ph.height + 8), radius=48, outline=(255, 255, 255, 40), width=3)
    step_badge(d, (caption_xy[0], caption_xy[1] - 70), badge)
    head, _, rest = caption.partition("\n\n")
    draw_paragraph(d, caption_xy, head.strip(), font(40, True), (255, 255, 255), 960, 12)
    draw_paragraph(d, (caption_xy[0], caption_xy[1] + 150), rest.strip(), font(32), SOFT, 960, 12)
    return img


def frame_desktop_left(caption, badge):
    img, d = canvas()
    dk = fit_h(Image.open(D / "desk-final-cropped.png").convert("RGB"), 620)
    img.paste(dk, (80, 110))
    step_badge(d, (80, 760), badge)
    draw_paragraph(d, (80, 830), caption, font(30), SOFT, 1040, 10)
    return img


def clip_image(src_png, dur, out):
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(src_png), "-t", str(dur),
        "-vf", f"fade=t=in:st=0:d=0.5,fade=t=out:st={dur - 0.5}:d=0.5,format=yuv420p",
        "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", str(out),
    ], check=True)


def main():
    clips = []
    f0 = frame_title("Hearth — how it works", "App Review walkthrough",
                     "A free desktop component creates an end-to-end encrypted room and issues a one-time QR invite.\nHearth joins that room from the phone.")
    f0.save(D / "f0.png"); clip_image(D / "f0.png", 4, D / "c0.mp4"); clips.append(D / "c0.mp4")

    f1 = frame_left_caption(QR, "Desktop component creates the room\n\nPrivateClaw (free, Windows / macOS / Linux) runs on the user's own computer next to the AI assistant of their choice. It creates a room and shows a one-time QR invite (plus an invite link) for the people the user trusts.", "STEP 1", caption_xy=(980, 260), img_h=760, img_xy=(120, 160))
    f1.save(D / "f1.png"); clip_image(D / "f1.png", 10, D / "c1.mp4"); clips.append(D / "c1.mp4")

    f2 = frame_left_caption(SITE / "iphone-welcome.jpg", "Open the invite in Hearth\n\nScan the QR code with the camera, or paste the invite link. No account or sign-up is needed.", "STEP 2", caption_xy=(100, 400))
    f2.save(D / "f2.png"); clip_image(D / "f2.png", 8, D / "c2.mp4"); clips.append(D / "c2.mp4")

    # Step 3: live phone recording (right) over a pre-composited background (left)
    f3 = frame_desktop_left("Hearth joins the encrypted room (live capture). Right: Hearth on iPhone, recorded while the desktop sent two messages — they arrive in real time together with the assistant's replies. Left: the desktop side of the same room.", "STEP 3")
    f3.save(D / "f3.png")
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(D / "f3.png"), "-ss", "34", "-t", "22", "-i", str(D / "phone-live.mp4"),
        "-filter_complex",
        "[1:v]scale=-2:900:flags=lanczos,fps=30,setsar=1,format=yuv420p[ph];[0:v]format=yuv420p[bg];[bg][ph]overlay=1180:90:shortest=1,"
        "fade=t=in:st=0:d=0.5,fade=t=out:st=21.5:d=0.5,format=yuv420p[v]",
        "-map", "[v]", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", str(D / "c3.mp4"),
    ], check=True)
    clips.append(D / "c3.mp4")

    img, d = canvas()
    dk = fit_h(Image.open(D / "desk-final-cropped.png").convert("RGB"), 880)
    img.paste(dk, (80, 100))
    step_badge(d, (1180, 380), "STEP 4")
    draw_paragraph(d, (1180, 450), "The same room on the desktop", font(40, True), (255, 255, 255), 700, 12)
    draw_paragraph(d, (1180, 600), "Participants, messages, and the assistant's replies appear on both sides. The relay only routes ciphertext; it never sees message contents.", font(32), SOFT, 700, 12)
    img.save(D / "f4.png"); clip_image(D / "f4.png", 10, D / "c4.mp4"); clips.append(D / "c4.mp4")

    f5 = frame_left_caption(SITE / "iphone-group.jpg", "End-to-end encrypted by design\n\nThe status card shows the encrypted session and its members. The relay server only ever sees ciphertext plus delivery metadata.", "STEP 5", caption_xy=(100, 400))
    f5.save(D / "f5.png"); clip_image(D / "f5.png", 8, D / "c5.mp4"); clips.append(D / "c5.mp4")

    f6 = frame_title("No account. No sign-up. End-to-end encrypted.", "Hearth is the mobile client for PrivateClaw",
                     "Desktop component (free, open source): github.com/topcheer/PrivateClaw\nWindows build: Microsoft Store")
    f6.save(D / "f6.png"); clip_image(D / "f6.png", 4, D / "c6.mp4"); clips.append(D / "c6.mp4")

    (D / "concat.txt").write_text("".join(f"file '{c}'\n" for c in clips))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(D / "concat.txt"), "-c", "copy", "-movflags", "+faststart", str(OUT)], check=True)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(OUT)], capture_output=True, text=True).stdout.strip()
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB, {float(dur):.1f} s)")


if __name__ == "__main__":
    main()
