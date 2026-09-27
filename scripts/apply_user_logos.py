import os
from PIL import Image

BASE_DIR = 'd:/Ultron'
SRC_WHITE = os.path.join(BASE_DIR, 'Assets', 'brown-white-logo.png')
SRC_BLACK = os.path.join(BASE_DIR, 'Assets', 'brown-black-logo.png')

print(f"Loading master white logo: {SRC_WHITE}")
master_white = Image.open(SRC_WHITE).convert('RGBA')
print(f"Loading master black logo: {SRC_BLACK}")
master_black = Image.open(SRC_BLACK).convert('RGBA')

def save_png(img, dest_path, size=None):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if size and size != img.size:
        resized = img.resize(size, Image.Resampling.LANCZOS)
        resized.save(dest_path, format='PNG')
    else:
        img.save(dest_path, format='PNG')
    print(f"Saved PNG: {dest_path}")

def save_webp(img, dest_path, size=None):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    if size and size != img.size:
        resized = img.resize(size, Image.Resampling.LANCZOS)
        resized.save(dest_path, format='WEBP', quality=95, method=6)
    else:
        img.save(dest_path, format='WEBP', quality=95, method=6)
    print(f"Saved WEBP: {dest_path}")

def save_ico(img, dest_path, sizes=[16, 24, 32, 48, 64, 128, 256]):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    ico_sizes = [(s, s) for s in sizes]
    img.save(dest_path, format='ICO', sizes=ico_sizes)
    print(f"Saved ICO: {dest_path}")

def save_centered_on_bg(src_img, dest_path, width, height, bg_color=(255, 255, 255, 255), scale=0.80):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    canvas = Image.new('RGBA', (width, height), bg_color)
    max_w = int(width * scale)
    max_h = int(height * scale)
    w, h = src_img.size
    ratio = min(max_w / w, max_h / h)
    tw = max(1, int(w * ratio))
    th = max(1, int(h * ratio))
    resized = src_img.resize((tw, th), Image.Resampling.LANCZOS)
    offset_x = (width - tw) // 2
    offset_y = (height - th) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    canvas.save(dest_path, format='PNG')
    print(f"Saved centered-on-bg ({width}x{height}): {dest_path}")

def make_transparent_icon(src_img, size, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    w, h = src_img.size
    aspect = w / h
    if aspect > 1:
        tw = size
        th = max(1, int(size / aspect))
    else:
        th = size
        tw = max(1, int(size * aspect))
    resized = src_img.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - tw) // 2, (size - th) // 2), resized)
    canvas.save(dest_path, format='PNG')
    print(f"Saved transparent icon ({size}x{size}): {dest_path}")

# ==============================================================================
# 1. ROOT ASSETS
# ==============================================================================
print("\n--- 1. Root Assets ---")
root_assets = os.path.join(BASE_DIR, 'Assets')
save_png(master_white, os.path.join(root_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(root_assets, 'brown-b-white-logo.png'))
save_png(master_white, os.path.join(root_assets, 'brown-lg.png'))
save_png(master_white, os.path.join(root_assets, 'Brown_White_Logo.png'))
save_png(master_black, os.path.join(root_assets, 'brown-b-black-logo.png'))
save_png(master_black, os.path.join(root_assets, 'brown-black-bg.png'))
save_ico(master_white, os.path.join(root_assets, 'brown-logo.ico'))
save_ico(master_white, os.path.join(root_assets, 'brown-b-white-logo.ico'))
save_ico(master_white, os.path.join(root_assets, 'brown-lg.ico'))

# ==============================================================================
# 2. BRAND-ASSETS
# ==============================================================================
print("\n--- 2. Brand-Assets ---")
brand_assets = os.path.join(root_assets, 'Brand-Assets')
save_png(master_white, os.path.join(brand_assets, 'brown-white-logo.png'))
save_png(master_white, os.path.join(brand_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(brand_assets, 'brown-b-white-logo.png'))
save_png(master_black, os.path.join(brand_assets, 'brown-black-logo.png'))
save_png(master_black, os.path.join(brand_assets, 'brown-b-black-logo.png'))
save_ico(master_white, os.path.join(brand_assets, 'brown-logo.ico'))
save_ico(master_black, os.path.join(brand_assets, 'brown-black-logo.ico'))

# ==============================================================================
# 3. BROWN-RELEASES / ASSETS
# ==============================================================================
print("\n--- 3. brown-releases/Assets ---")
rel_assets = os.path.join(BASE_DIR, 'brown-releases', 'Assets')
if os.path.exists(os.path.dirname(rel_assets)):
    save_png(master_white, os.path.join(rel_assets, 'brown-white-logo.png'))
    save_png(master_white, os.path.join(rel_assets, 'brown-logo.png'))
    save_png(master_white, os.path.join(rel_assets, 'brown-b-white-logo.png'))
    save_png(master_black, os.path.join(rel_assets, 'brown-black-logo.png'))
    save_png(master_black, os.path.join(rel_assets, 'brown-b-black-logo.png'))

# ==============================================================================
# 4. BROWN-WEBSITE / ASSETS
# ==============================================================================
print("\n--- 4. brown-website/Assets ---")
web_assets = os.path.join(BASE_DIR, 'brown-website', 'Assets')
save_webp(master_white, os.path.join(web_assets, 'brown-white-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-b-white-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-lg.webp'))
save_webp(master_white, os.path.join(web_assets, 'ultron-logo.webp'))
save_webp(master_black, os.path.join(web_assets, 'brown-black-logo.webp'))
save_webp(master_black, os.path.join(web_assets, 'brown-b-black-logo.webp'))
save_ico(master_white, os.path.join(web_assets, 'brown-logo.ico'))
save_ico(master_white, os.path.join(web_assets, 'brown-lg.ico'))

# ==============================================================================
# 5. BROWN-WEBSITE / PUBLIC / ASSETS
# ==============================================================================
print("\n--- 5. brown-website/public/Assets ---")
web_pub_assets = os.path.join(BASE_DIR, 'brown-website', 'public', 'Assets')
save_webp(master_white, os.path.join(web_pub_assets, 'brown-white-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-b-white-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-lg.webp'))
save_webp(master_black, os.path.join(web_pub_assets, 'brown-black-logo.webp'))
save_webp(master_black, os.path.join(web_pub_assets, 'brown-b-black-logo.webp'))
save_ico(master_white, os.path.join(web_pub_assets, 'brown-b-white-logo.ico'))
save_ico(master_white, os.path.join(web_pub_assets, 'brown-lg.ico'))
make_transparent_icon(master_white, 192, os.path.join(web_pub_assets, 'brown-b-white-192.png'))
make_transparent_icon(master_white, 512, os.path.join(web_pub_assets, 'brown-b-white-512.png'))

# ==============================================================================
# 6. BROWN-WEBSITE FAVICONS (Transparent)
# ==============================================================================
print("\n--- 6. brown-website Favicons (Transparent) ---")
web_pub = os.path.join(BASE_DIR, 'brown-website', 'public')
make_transparent_icon(master_white, 16, os.path.join(web_pub, 'favicon-16x16.png'))
make_transparent_icon(master_white, 32, os.path.join(web_pub, 'favicon-32x32.png'))
make_transparent_icon(master_white, 48, os.path.join(web_pub, 'favicon-48x48.png'))
make_transparent_icon(master_white, 180, os.path.join(web_pub, 'apple-touch-icon.png'))

# Transparent multi-size ICO for browser tab
ico_canvas = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
resized_48 = master_white.resize((48, int(48 * (master_white.height / master_white.width))), Image.Resampling.LANCZOS)
ico_canvas.paste(resized_48, ((48 - resized_48.width) // 2, (48 - resized_48.height) // 2), resized_48)
ico_canvas.save(os.path.join(web_pub, 'favicon.ico'), format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48)])
print("Saved transparent browser favicon.ico")

# ==============================================================================
# 7. SEO & SEARCH RESULTS (Black Logo on Pure White Background)
# ==============================================================================
print("\n--- 7. SEO & Search Results (Black Logo on White BG) ---")
# 512x512 for Schema.org Organization logo (crawled by Google Search)
save_centered_on_bg(master_black, os.path.join(web_pub_assets, 'brown-search-logo-512.png'), 512, 512, (255, 255, 255, 255), scale=0.80)
# 192x192 for Search snippets & Google favicon crawlers
save_centered_on_bg(master_black, os.path.join(web_pub_assets, 'brown-search-logo-192.png'), 192, 192, (255, 255, 255, 255), scale=0.80)
# 1200x630 Social / Search preview card with black logo on white background
save_centered_on_bg(master_black, os.path.join(web_pub_assets, 'brand-feature-image-1200x630.png'), 1200, 630, (255, 255, 255, 255), scale=0.55)
# Also copy to brown-website/Assets
save_centered_on_bg(master_black, os.path.join(web_assets, 'brown-search-logo-512.png'), 512, 512, (255, 255, 255, 255), scale=0.80)
save_centered_on_bg(master_black, os.path.join(web_assets, 'brown-search-logo-192.png'), 192, 192, (255, 255, 255, 255), scale=0.80)
save_centered_on_bg(master_black, os.path.join(web_assets, 'brand-feature-image-1200x630.png'), 1200, 630, (255, 255, 255, 255), scale=0.55)

# Also update brown-b-black-bg-preview to match
save_centered_on_bg(master_black, os.path.join(web_pub_assets, 'brown-b-black-bg-preview.png'), 1024, 1024, (255, 255, 255, 255), scale=0.80)

# ==============================================================================
# 8. DIST (Vite build folder)
# ==============================================================================
web_dist_assets = os.path.join(BASE_DIR, 'brown-website', 'dist', 'Assets')
if os.path.exists(web_dist_assets):
    print("\n--- 8. brown-website/dist/Assets ---")
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-white-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-b-white-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-lg.webp'))
    save_webp(master_black, os.path.join(web_dist_assets, 'brown-black-logo.webp'))
    save_webp(master_black, os.path.join(web_dist_assets, 'brown-b-black-logo.webp'))
    save_ico(master_white, os.path.join(web_dist_assets, 'brown-b-white-logo.ico'))
    save_centered_on_bg(master_black, os.path.join(web_dist_assets, 'brown-search-logo-512.png'), 512, 512, (255, 255, 255, 255), scale=0.80)
    save_centered_on_bg(master_black, os.path.join(web_dist_assets, 'brand-feature-image-1200x630.png'), 1200, 630, (255, 255, 255, 255), scale=0.55)

# ==============================================================================
# 9. MOBILE ASSETS
# ==============================================================================
print("\n--- 9. mobile/Assets ---")
mob_assets = os.path.join(BASE_DIR, 'mobile', 'Assets')
save_png(master_white, os.path.join(mob_assets, 'brown-white-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-white-wordmark.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-b-white-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-lg.png'))
save_png(master_white, os.path.join(mob_assets, 'ultron-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'icon.png'))
save_png(master_white, os.path.join(mob_assets, 'adaptive-icon.png'))
save_png(master_white, os.path.join(mob_assets, 'favicon.png'))
save_png(master_white, os.path.join(mob_assets, 'splash.png'))
save_png(master_white, os.path.join(mob_assets, 'splash-small.png'))
save_png(master_black, os.path.join(mob_assets, 'brown-black-logo.png'))
save_png(master_black, os.path.join(mob_assets, 'brown-b-black-logo.png'))

print("\n=== COMPLETE: ALL LOGOS & SEO ASSETS UPDATED ===")
