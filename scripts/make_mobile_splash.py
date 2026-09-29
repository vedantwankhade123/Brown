"""Regenerate the mobile splash: logo mark + Brown wordmark underneath.

    python scripts/make_mobile_splash.py
"""
from PIL import Image, ImageDraw, ImageFont

SPLASH = "mobile/Assets/Brown-splash.png"
MARK = "mobile/Assets/Brown-adaptive.png"
FONT = "mobile/node_modules/@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf"

SIZE = 1280
WORD = "Brown"
FONT_PX = 118
TRACKING = -0.025  # em, matches the desktop splash .splash-brand-title letter-spacing
GAP = 62  # logo bottom -> text top
LOGO_H = 380


def tracked_text(draw, font, text, tracking):
    widths = [draw.textlength(c, font=font) for c in text]
    space = font.size * tracking
    return widths, sum(widths) + space * (len(text) - 1)


def draw_tracked(draw, font, text, widths, center_x, top, color):
    space = font.size * TRACKING
    x = center_x - (sum(widths) + space * (len(text) - 1)) / 2
    y = top
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=font, fill=color)
        x += w + space


def main():
    src = Image.open(MARK).convert("RGBA")
    bbox = src.getbbox()
    mark = src.crop(bbox)
    scale = LOGO_H / mark.height
    mark = mark.resize((round(mark.width * scale), LOGO_H), Image.LANCZOS)

    font = ImageFont.truetype(FONT, FONT_PX)
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    widths, text_w = tracked_text(probe, font, WORD, TRACKING)
    asc, desc = font.getmetrics()
    text_h = probe.textbbox((0, 0), WORD, font=font)[3]

    block_h = LOGO_H + GAP + text_h
    top = (SIZE - block_h) // 2
    cx = SIZE // 2

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(mark, (cx - mark.width // 2, top), mark)
    draw = ImageDraw.Draw(canvas)
    draw_tracked(draw, font, WORD, widths, cx, top + LOGO_H + GAP, (255, 255, 255, 255))

    canvas.save(SPLASH)
    print(f"wrote {SPLASH} {canvas.size} block={block_h} text_w={text_w:.0f}")


if __name__ == "__main__":
    main()
