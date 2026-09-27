import os
import base64
from PIL import Image

BASE_DIR = 'd:/Ultron'
SRC_WHITE = os.path.join(BASE_DIR, 'Assets', 'brown-white-logo.png')
SRC_BLACK = os.path.join(BASE_DIR, 'Assets', 'brown-black-logo.png')

master_white = Image.open(SRC_WHITE).convert('RGBA')
master_black = Image.open(SRC_BLACK).convert('RGBA')

# 1. Create perfectly square masters on transparent background
def make_square(img):
    max_d = max(img.width, img.height)
    canvas = Image.new('RGBA', (max_d, max_d), (0, 0, 0, 0))
    canvas.paste(img, ((max_d - img.width) // 2, (max_d - img.height) // 2), img)
    return canvas

square_white = make_square(master_white)
square_black = make_square(master_black)

def save_png_transparent(img, dest, size):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(dest, format='PNG')
    print(f"Saved transparent PNG ({size}x{size}): {dest}")

def save_png_centered_white_bg(img, dest, width, height, scale=0.80):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    canvas = Image.new('RGBA', (width, height), (255, 255, 255, 255))
    max_w = int(width * scale)
    max_h = int(height * scale)
    w, h = img.size
    ratio = min(max_w / w, max_h / h)
    tw = max(1, int(w * ratio))
    th = max(1, int(h * ratio))
    resized = img.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((width - tw) // 2, (height - th) // 2), resized)
    canvas.save(dest, format='PNG')
    print(f"Saved white bg PNG ({width}x{height}): {dest}")

def save_multi_ico(square_img, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    square_img.save(dest, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
    print(f"Saved multi-frame ICO: {dest}")

# Locations
web_pub = os.path.join(BASE_DIR, 'brown-website', 'public')
web_pub_assets = os.path.join(web_pub, 'Assets')
web_assets = os.path.join(BASE_DIR, 'brown-website', 'Assets')
dist_pub = os.path.join(BASE_DIR, 'brown-website', 'dist')
dist_assets = os.path.join(dist_pub, 'Assets')

# ------------------------------------------------------------------
# A. BROWSER TABS: WHITE LOGO ON TRANSPARENT
# ------------------------------------------------------------------
for base in [web_pub, dist_pub]:
    save_multi_ico(square_white, os.path.join(base, 'favicon.ico'))
    save_png_transparent(square_white, os.path.join(base, 'favicon-16x16.png'), 16)
    save_png_transparent(square_white, os.path.join(base, 'favicon-32x32.png'), 32)
    save_png_transparent(square_white, os.path.join(base, 'favicon-48x48.png'), 48)
    save_png_transparent(square_white, os.path.join(base, 'apple-touch-icon.png'), 180)

# Create 512x512 transparent white icon for SVG
temp_512 = os.path.join(BASE_DIR, 'scratch_512.png')
save_png_transparent(square_white, temp_512, 512)
with open(temp_512, 'rb') as f:
    b64_white = base64.b64encode(f.read()).decode('ascii')
if os.path.exists(temp_512):
    os.remove(temp_512)

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image width="512" height="512" href="data:image/png;base64,{b64_white}"/>
</svg>'''

for base in [web_pub, dist_pub]:
    with open(os.path.join(base, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"Saved vector favicon.svg: {os.path.join(base, 'favicon.svg')}")

# ------------------------------------------------------------------
# B. SEARCH RESULTS & SEO: BLACK LOGO ON PURE WHITE BACKGROUND (#FFFFFF)
# ------------------------------------------------------------------
for target_dir in [web_pub_assets, web_assets, dist_assets, os.path.join(BASE_DIR, 'Assets')]:
    save_png_centered_white_bg(square_black, os.path.join(target_dir, 'brown-search-logo-48.png'), 48, 48, scale=0.82)
    save_png_centered_white_bg(square_black, os.path.join(target_dir, 'brown-search-logo-96.png'), 96, 96, scale=0.82)
    save_png_centered_white_bg(square_black, os.path.join(target_dir, 'brown-search-logo-192.png'), 192, 192, scale=0.80)
    save_png_centered_white_bg(square_black, os.path.join(target_dir, 'brown-search-logo-512.png'), 512, 512, scale=0.80)
    save_png_centered_white_bg(square_black, os.path.join(target_dir, 'brand-feature-image-1200x630.png'), 1200, 630, scale=0.55)

print("\nAll favicons and SEO search icons generated successfully!")
