#!/usr/bin/env python3
"""Render the 1200x630 Open Graph card for privateclaw.us.

Same visual language as the site: deep navy, three aurora glows (cyan, violet,
mint), fine grid + noise, the app icon, and the real phone screenshot cropped
into a glowing device that breaks the top edge of the card.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
HERE = Path(__file__).resolve().parent
SITE = HERE.parent / "apps" / "privateclaw_site" / "assets"
OUT = SITE / "og-privateclaw.png"

BG = (7, 16, 31)
AURORA = [((62, 217, 255), 0.55), ((143, 125, 255), 0.55), ((92, 255, 196), 0.42)]
TEXT = (244, 247, 255)
TEXT_SOFT = (205, 216, 240)
ACCENT = (143, 125, 255)
ACCENT2 = (62, 217, 255)
ACCENT3 = (92, 255, 196)

FONT_DIR = Path("/System/Library/Fonts")
def font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for rel in candidates:
        for base in (FONT_DIR / "Supplemental", FONT_DIR, Path("/Library/Fonts")):
            p = base / rel
            if p.exists():
                return ImageFont.truetype(str(p), size)
    raise SystemExit(f"no font among {candidates}")

DISPLAY = ["AvenirNext-Heavy.ttf", "AvenirNext-DemiBold.ttf", "HelveticaNeue.ttc"]
MEDIUM = ["AvenirNext-Medium.ttf", "AvenirNext-Regular.ttf", "HelveticaNeue.ttc"]


def radial(size: tuple[int, int], center: tuple[float, float], radius: float, color, peak: float) -> Image.Image:
    w, h = size
    small = (w // 4, h // 4)
    img = Image.new("RGB", small, (0, 0, 0))
    px = img.load()
    cx, cy = center[0] / 4, center[1] / 4
    r = max(radius / 4, 1)
    for y in range(small[1]):
        for x in range(small[0]):
            d = math.hypot(x - cx, y - cy) / r
            fall = max(0.0, 1 - d) ** 1.6
            px[x, y] = tuple(int(c * fall * peak) for c in color)
    return img.filter(ImageFilter.GaussianBlur(18)).resize(size, Image.BICUBIC)


def linear_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        img.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img.resize((w, h), Image.BILINEAR)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def text_with_glow(canvas: Image.Image, xy: tuple[float, float], s: str, fnt, fill, glow_color, glow_radius: int = 24, glow_alpha: int = 140) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, s, font=fnt, fill=(*glow_color, glow_alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(glow_radius)))
    ImageDraw.Draw(canvas).text(xy, s, font=fnt, fill=fill)


def gradient_text(canvas: Image.Image, xy: tuple[float, float], s: str, fnt, c1, c2, c3) -> None:
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).text(xy, s, font=fnt, fill=255)
    grad = Image.new("RGB", canvas.size)
    gp = grad.load()
    for x in range(canvas.size[0]):
        t = x / (canvas.size[0] - 1)
        if t < 0.5:
            k = t / 0.5
            col = tuple(int(a + (b - a) * k) for a, b in zip(c1, c2))
        else:
            k = (t - 0.5) / 0.5
            col = tuple(int(a + (b - a) * k) for a, b in zip(c2, c3))
        for y in range(canvas.size[1]):
            gp[x, y] = col
    canvas.paste(grad, (0, 0), mask)


def main() -> None:
    random.seed(7)
    base = linear_gradient((W, H), (9, 19, 38), (3, 7, 16)).convert("RGBA")

    # aurora glows (same hues as the site)
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    for (color, peak), center, radius in zip(
        AURORA,
        [(1000, 60), (120, 620), (560, 700)],
        [600, 700, 640],
    ):
        glow = ImageChops.add(glow, radial((W, H), center, radius, color, peak))
    base = Image.alpha_composite(base, glow.convert("RGBA"))

    # fine grid, fading out towards the bottom
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 48
    for x in range(0, W + 1, step):
        gd.line([(x, 0), (x, H)], fill=(120, 150, 220, 26), width=1)
    for y in range(0, H + 1, step):
        a = int(30 * (1 - y / H) ** 1.4)
        gd.line([(0, y), (W, y)], fill=(120, 150, 220, a), width=1)
    base.alpha_composite(grid)

    # particles
    pd = ImageDraw.Draw(base)
    for _ in range(140):
        x, y = random.uniform(0, W), random.uniform(0, H)
        r = random.choice([0.8, 1.0, 1.2, 1.6, 2.2])
        a = random.randint(30, 130)
        col = random.choice([ACCENT2, ACCENT, ACCENT3, (220, 230, 255)])
        pd.ellipse((x - r, y - r, x + r, y + r), fill=(*col, a))

    # subtle noise
    noise = Image.effect_noise((W // 2, H // 2), 22).resize((W, H), Image.BILINEAR).convert("L")
    noise_rgba = Image.merge("RGBA", (noise, noise, noise, noise.point(lambda v: 10)))
    base.alpha_composite(noise_rgba)

    # ---- phone with the real screenshot, breaking the top edge
    raw_chat = HERE.parent / "apps" / "privateclaw_app" / "build" / "store-screenshots-raw" / "en-US" / "02-group-chat-iphone.png"
    shot_src = raw_chat if raw_chat.exists() else SITE / "showcase" / "iphone-group.jpg"
    shot = Image.open(shot_src).convert("RGB")
    # keep the lower (message list + composer) part of a tall phone capture
    sw, sh = shot.size
    if sh / sw > 2.2:
        top = int(sh * 0.42)
        shot = shot.crop((0, top, sw, sh))
    pw, ph = 430, 934
    shot = shot.resize((pw, ph), Image.LANCZOS)
    px0, py0 = 760, 92
    bezel = 14
    corner = 62
    # outer glow
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).rounded_rectangle((px0 - 60, py0 - 60 + 200, px0 + pw + 60, py0 + ph + 60), radius=corner + 60, fill=(*ACCENT2, 70))
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(60)))
    halo2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo2).rounded_rectangle((px0 + 80, py0 + 260, px0 + pw + 90, py0 + ph), radius=corner, fill=(*ACCENT, 90))
    base.alpha_composite(halo2.filter(ImageFilter.GaussianBlur(70)))

    device = Image.new("RGBA", (pw + bezel * 2, ph + bezel * 2), (0, 0, 0, 0))
    dd = ImageDraw.Draw(device)
    dd.rounded_rectangle((0, 0, device.width - 1, device.height - 1), radius=corner + bezel, fill=(16, 22, 40, 255), outline=(150, 170, 230, 140), width=3)
    inner = Image.new("RGBA", device.size, (0, 0, 0, 0))
    inner.paste(shot, (bezel, bezel))
    mask = Image.new("L", device.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((bezel, bezel, bezel + pw - 1, bezel + ph - 1), radius=corner, fill=255)
    device.paste(inner, (0, 0), mask)
    # dynamic island
    island = Image.new("RGBA", device.size, (0, 0, 0, 0))
    ImageDraw.Draw(island).rounded_rectangle((device.width // 2 - 54, bezel + 14, device.width // 2 + 54, bezel + 48), radius=17, fill=(5, 8, 16, 255))
    device.alpha_composite(island)
    base.alpha_composite(device, (px0 - bezel, py0 - bezel))
    # glass reflection streak across the screen
    streak = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(streak).polygon([(0, 0), (pw * 0.55, 0), (0, ph * 0.7)], fill=(255, 255, 255, 26))
    clipped = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    clipped.paste(streak, (0, 0), rounded_mask((pw, ph), corner))
    base.alpha_composite(clipped, (px0, py0))

    # ---- copy
    f_kicker = font(MEDIUM, 26)
    f_title = font(DISPLAY, 96)
    f_sub = font(MEDIUM, 32)
    f_tag = font(MEDIUM, 22)
    draw = ImageDraw.Draw(base)

    draw.text((84, 196), "H E A R T H   R O O M", font=f_kicker, fill=(*ACCENT2, 230))
    text_with_glow(base, (78, 232), "Private rooms.", f_title, TEXT, ACCENT, 28, 120)
    gradient_text(base, (78, 342), "Your AI, inside.", f_title, ACCENT2, ACCENT, ACCENT3)
    draw.rounded_rectangle((84, 462, 92, 520), radius=4, fill=(*ACCENT3, 220))
    sub = "Encrypted rooms for the people you trust — and the assistant that works for you."
    # wrap the subline
    words, lines, cur = sub.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if draw.textlength(trial, font=f_sub) > 600:
            lines.append(cur); cur = wd
        else:
            cur = trial
    lines.append(cur)
    for i, line in enumerate(lines):
        draw.text((110, 462 + i * 42), line, font=f_sub, fill=TEXT_SOFT)

    # tags
    tags = ["End-to-end encrypted", "OpenClaw native", "iOS / macOS / Windows / Linux"]
    x = 84
    for t in tags:
        tw = draw.textlength(t, font=f_tag)
        draw.rounded_rectangle((x, 548, x + tw + 30, 586), radius=19, fill=(255, 255, 255, 18), outline=(255, 255, 255, 60), width=1)
        draw.text((x + 15, 555), t, font=f_tag, fill=TEXT_SOFT)
        x += tw + 44

    # brand lockup bottom-left: app icon + domain
    icon = Image.open(SITE / "privateclaw_app_icon.png").convert("RGBA").resize((56, 56), Image.LANCZOS)
    icon.putalpha(rounded_mask((56, 56), 14))
    base.alpha_composite(icon, (84, 118))
    draw.text((152, 130), "privateclaw.us", font=font(MEDIUM, 24), fill=TEXT_SOFT)

    # vignette + edge highlight
    vign = Image.new("L", (W // 4, H // 4), 0)
    vp = vign.load()
    for y in range(H // 4):
        for x in range(W // 4):
            d = math.hypot((x - W / 8) / (W / 8), (y - H / 8) / (H / 8))
            vp[x, y] = int(min(1.0, max(0.0, d - 0.95)) * 120)
    valpha = vign.resize((W, H), Image.BICUBIC)
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    dark.putalpha(valpha)
    base = Image.alpha_composite(base, dark)
    edge = ImageDraw.Draw(base)
    edge.rounded_rectangle((0, 0, W - 1, H - 1), radius=0, outline=(120, 140, 200, 60), width=2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(OUT, optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
