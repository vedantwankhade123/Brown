"""Regenerate every derived brand asset from the new Brown logo sources.

Sources (added 2026-09-27):
  Assets/Brown-white.png    white mark, transparent bg  (dark surfaces)
  Assets/Brown-black.png    black mark, transparent bg  (light surfaces)
  Assets/Brown-black-w.png  black mark on solid white   (favicon / exe / Google)

Outputs land in desktop Assets/, mobile/Assets/, brown-website/public/.
Run from D:/Ultron:  python scripts/apply_new_logos.py
"""
import base64
import io
import os
import shutil

from PIL import Image

ROOT = 'd:/Ultron'
SRC_WHITE = os.path.join(ROOT, 'Assets', 'Brown-white.png')
SRC_BLACK = os.path.join(ROOT, 'Assets', 'Brown-black.png')
SRC_BLACK_W = os.path.join(ROOT, 'Assets', 'Brown-black-w.png')
SRC_LOTTIE = os.path.join(ROOT, 'Assets', 'brown-logo-animation.json')

DESKTOP_ASSETS = os.path.join(ROOT, 'Assets')
BRAND_ASSETS = os.path.join(DESKTOP_ASSETS, 'Brand-Assets')
MOBILE_ASSETS = os.path.join(ROOT, 'mobile', 'Assets')
ANDROID_RES = os.path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res')
WEB_PUBLIC = os.path.join(ROOT, 'brown-website', 'public')
WEB_ASSETS = os.path.join(WEB_PUBLIC, 'Assets')


def ensure(d):
    os.makedirs(d, exist_ok=True)


def load(path):
    return Image.open(path).convert('RGBA')


def trimmed(img):
    """Crop to the alpha bounding box (keeps transparent-bg marks tight)."""
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def place(mark, canvas_w, canvas_h, fill_pct, bg=None):
    """Center `mark` on a canvas so it covers `fill_pct` of the smaller side."""
    mode = 'RGB' if bg else 'RGBA'
    out = Image.new(mode, (canvas_w, canvas_h), bg if bg else (0, 0, 0, 0))
    m = trimmed(mark) if mark.mode == 'RGBA' and mark.getbbox() != (0, 0, mark.width, mark.height) else mark
    target = int(min(canvas_w, canvas_h) * fill_pct / 100)
    ratio = min(target / m.width, target / m.height)
    m = m.resize((max(1, int(m.width * ratio)), max(1, int(m.height * ratio))), Image.Resampling.LANCZOS)
    out.paste(m, ((canvas_w - m.width) // 2, (canvas_h - m.height) // 2), m if m.mode == 'RGBA' else None)
    return out


def save_png(img, path):
    ensure(os.path.dirname(path))
    img.save(path, format='PNG')
    print('png ', path)


def save_webp(img, path, lossless=False):
    ensure(os.path.dirname(path))
    if lossless:
        img.save(path, format='WEBP', lossless=True)
    else:
        img.save(path, format='WEBP', quality=92, method=6)
    print('webp', path)


def save_ico(img, path, sizes=(16, 24, 32, 48, 64, 128, 256)):
    ensure(os.path.dirname(path))
    img.save(path, format='ICO', sizes=[(s, s) for s in sizes])
    print('ico ', path)


def save_bmp(img, path):
    ensure(os.path.dirname(path))
    img.convert('RGB').save(path, format='BMP')
    print('bmp ', path)


def round_mask(img):
    """Circular alpha mask for legacy round launcher icons."""
    size = min(img.width, img.height)
    mask = Image.new('L', (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img.resize((size, size), Image.Resampling.LANCZOS), (0, 0), mask)
    return out


def rounded_tile(img, radius_pct=22.5):
    """ChatGPT-style: bake rounded corners into a square tile (RGBA)."""
    img = img.convert('RGBA').resize((img.width, img.height), Image.Resampling.LANCZOS)
    from PIL import ImageDraw
    r = max(1, int(img.width * radius_pct / 100))
    mask = Image.new('L', (img.width, img.height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=r, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def web_favicons(white, black_w):
    """Website tab/search icon set. Split out so favicons can be regenerated alone:
      python -c "import sys;sys.path.insert(0,'d:/Ultron/scripts');import apply_new_logos as m;m.web_favicons(m.load(m.SRC_WHITE),m.load(m.SRC_BLACK_W))"
    """
    # browser tab favicons — WHITE mark on transparent, no tile behind it.
    # The .ico stays the BLACK-on-white tile: browsers that honour the declared icon links below
    # render the white tab mark, while Googlebot always fetches the root /favicon.ico, so the
    # search-results tile keeps the black mark.
    tab = {s: place(white, s, s, 100) for s in (16, 24, 32, 48, 128)}
    black_tile = {s: rounded_tile(black_w.resize((s, s), Image.Resampling.LANCZOS)) for s in (48, 180)}
    save_ico(black_tile[48], os.path.join(WEB_PUBLIC, 'favicon.ico'), sizes=(16, 24, 32, 48))
    for s in (16, 32, 48):
        save_png(tab[s], os.path.join(WEB_PUBLIC, f'favicon-{s}x{s}.png'))
    save_png(black_tile[180], os.path.join(WEB_PUBLIC, 'apple-touch-icon.png'))
    # favicon.svg with the raster embedded (browsers accept <image> in SVG)
    png64 = io.BytesIO()
    tab[128].save(png64, format='PNG')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'viewBox="0 0 128 128" width="128" height="128">'
        f'<image width="128" height="128" xlink:href="data:image/png;base64,{base64.b64encode(png64.getvalue()).decode()}"/>'
        '</svg>'
    )
    with open(os.path.join(WEB_PUBLIC, 'favicon.svg'), 'w') as f:
        f.write(svg)
    print('svg  ', os.path.join(WEB_PUBLIC, 'favicon.svg'))


def main():
    white = load(SRC_WHITE)
    black = load(SRC_BLACK)
    black_w = load(SRC_BLACK_W)

    # ---------------- Desktop ----------------
    # exe / shortcut / installer icon: white mark on transparent, matching the
    # in-app window icon. Windows paints this straight onto the wallpaper.
    save_ico(place(white, 256, 256, 92), os.path.join(DESKTOP_ASSETS, 'Brown.ico'))
    save_ico(place(white, 256, 256, 92), os.path.join(BRAND_ASSETS, 'Brown.ico'))
    # installer page header icon: black mark on transparent
    save_ico(place(black, 256, 256, 92), os.path.join(BRAND_ASSETS, 'Brown-header.ico'))
    # NSIS wizard art (24bpp BMPs, exact dims electron-builder expects)
    save_bmp(place(white, 164, 314, 52, bg=(9, 9, 11)), os.path.join(DESKTOP_ASSETS, 'installerSidebar.bmp'))
    save_bmp(place(black, 150, 57, 78, bg=(255, 255, 255)), os.path.join(DESKTOP_ASSETS, 'installerHeader.bmp'))
    # non-Windows window icon fallback
    save_png(white, os.path.join(BRAND_ASSETS, 'Brown-white.png'))

    # ---------------- Mobile ----------------
    save_png(white, os.path.join(MOBILE_ASSETS, 'Brown-white.png'))
    save_png(black, os.path.join(MOBILE_ASSETS, 'Brown-black.png'))
    # legacy launcher icon: white mark on solid black (matches app.json backgroundColor)
    save_png(place(white, 1024, 1024, 62, bg=(0, 0, 0)), os.path.join(MOBILE_ASSETS, 'Brown-icon.png'))
    # adaptive foreground inside Android safe zone
    save_png(place(white, 1024, 1024, 42), os.path.join(MOBILE_ASSETS, 'Brown-adaptive.png'))
    # splash (contain mode on #000000 background)
    # NOTE: this drops the "Brown" wordmark — re-run scripts/make_mobile_splash.py after this script.
    save_png(place(white, 1280, 1280, 30), os.path.join(MOBILE_ASSETS, 'Brown-splash.png'))
    save_png(black_w.resize((48, 48), Image.Resampling.LANCZOS), os.path.join(MOBILE_ASSETS, 'Brown-favicon.png'))
    # animated mark: the mobile app bundles the same Lottie JSON the desktop splash uses
    shutil.copyfile(SRC_LOTTIE, os.path.join(MOBILE_ASSETS, 'brown-logo-animation.json'))
    print('copy', os.path.join(MOBILE_ASSETS, 'brown-logo-animation.json'))

    # ---------------- Android native res (bare workflow; these override app.json in the APK) ----------------
    splash = place(white, 1536, 1024, 30)  # transparent; splashscreen_background #000000 shows through
    for d in ('drawable-mdpi', 'drawable-hdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi'):
        save_png(splash, os.path.join(ANDROID_RES, d, 'splashscreen_image.png'))
    icon_sizes = {'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432}
    for d, s in icon_sizes.items():
        save_png(place(white, s, s, 62, bg=(0, 0, 0)), os.path.join(ANDROID_RES, d, 'ic_launcher.png'))
        save_png(round_mask(place(white, s, s, 62, bg=(0, 0, 0))), os.path.join(ANDROID_RES, d, 'ic_launcher_round.png'))
        save_png(place(white, s, s, 50), os.path.join(ANDROID_RES, d, 'ic_launcher_foreground.png'))

    # ---------------- Website ----------------
    save_webp(white, os.path.join(WEB_ASSETS, 'Brown-white.webp'), lossless=True)
    save_webp(black, os.path.join(WEB_ASSETS, 'Brown-black.webp'), lossless=True)
    save_webp(black_w, os.path.join(WEB_ASSETS, 'Brown-black-w.webp'))
    # Google search / PWA tiles (black on white)
    for s in (48, 96, 192, 512):
        save_png(black_w.resize((s, s), Image.Resampling.LANCZOS),
                 os.path.join(WEB_ASSETS, f'brown-search-logo-{s}.png'))
    # Open Graph card: white bg, black mark centered (same composition as before)
    save_png(place(black, 1200, 630, 57, bg=(255, 255, 255)),
             os.path.join(WEB_ASSETS, 'brand-feature-image-1200x630.png'))
    web_favicons(white, black_w)

    print('\nAll derived brand assets regenerated.')


if __name__ == '__main__':
    main()
