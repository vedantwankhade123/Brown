import os
import shutil
from PIL import Image
import numpy as np

BASE_DIR = 'd:/Ultron'
SRC_LOGO = os.path.join(BASE_DIR, 'Assets', 'Brown_White_Logo.png')

print(f"Loading master logo from: {SRC_LOGO}")
master_white = Image.open(SRC_LOGO).convert('RGBA')
print(f"Master white logo size: {master_white.size}")

# Create dark graphite/black version for light themes
arr = np.array(master_white, dtype=np.float32)
r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
lum = 0.299 * r + 0.587 * g + 0.114 * b
dark_lum = (1.0 - (lum / 255.0)) * 75.0 + 18.0
out = np.zeros_like(arr, dtype=np.uint8)
out[:, :, 0] = np.clip(dark_lum, 0, 255).astype(np.uint8)
out[:, :, 1] = np.clip(dark_lum, 0, 255).astype(np.uint8)
out[:, :, 2] = np.clip(dark_lum, 0, 255).astype(np.uint8)
out[:, :, 3] = a.astype(np.uint8)
master_dark = Image.fromarray(out, 'RGBA')
print(f"Master dark logo created: {master_dark.size}")

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

def save_square_on_black(src_img, dest_path, canvas_dim, scale=0.82):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    canvas = Image.new('RGBA', (canvas_dim, canvas_dim), (0, 0, 0, 255))
    target_dim = int(canvas_dim * scale)
    w, h = src_img.size
    aspect = w / h
    if aspect > 1:
        tw = target_dim
        th = int(target_dim / aspect)
    else:
        th = target_dim
        tw = int(target_dim * aspect)
    resized = src_img.resize((tw, th), Image.Resampling.LANCZOS)
    offset_x = (canvas_dim - tw) // 2
    offset_y = (canvas_dim - th) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    canvas.save(dest_path)
    print(f"Saved square-on-black: {dest_path} ({canvas_dim}x{canvas_dim})")

# 1. Root Assets
print("\n--- Updating Root Assets ---")
root_assets = os.path.join(BASE_DIR, 'Assets')
save_png(master_white, os.path.join(root_assets, 'brown-white-logo.png'))
save_png(master_white, os.path.join(root_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(root_assets, 'brown-b-white-logo.png'))
save_png(master_white, os.path.join(root_assets, 'brown-lg.png'))
save_png(master_dark, os.path.join(root_assets, 'brown-black-logo.png'))
save_png(master_dark, os.path.join(root_assets, 'brown-b-black-logo.png'))
save_ico(master_white, os.path.join(root_assets, 'brown-logo.ico'))
save_ico(master_white, os.path.join(root_assets, 'brown-b-white-logo.ico'))
save_ico(master_white, os.path.join(root_assets, 'brown-lg.ico'))

# 2. Assets/Brand-Assets
print("\n--- Updating Brand-Assets ---")
brand_assets = os.path.join(root_assets, 'Brand-Assets')
save_png(master_white, os.path.join(brand_assets, 'brown-white-logo.png'))
save_png(master_white, os.path.join(brand_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(brand_assets, 'brown-b-white-logo.png'))
save_png(master_dark, os.path.join(brand_assets, 'brown-black-logo.png'))
save_png(master_dark, os.path.join(brand_assets, 'brown-b-black-logo.png'))
save_ico(master_white, os.path.join(brand_assets, 'brown-logo.ico'))
save_ico(master_dark, os.path.join(brand_assets, 'brown-black-logo.ico'))

# 3. brown-releases/Assets
print("\n--- Updating brown-releases/Assets ---")
releases_assets = os.path.join(BASE_DIR, 'brown-releases', 'Assets')
if os.path.exists(os.path.dirname(releases_assets)):
    save_png(master_white, os.path.join(releases_assets, 'brown-white-logo.png'))
    save_png(master_white, os.path.join(releases_assets, 'brown-logo.png'))
    save_png(master_white, os.path.join(releases_assets, 'brown-b-white-logo.png'))
    save_png(master_dark, os.path.join(releases_assets, 'brown-black-logo.png'))
    save_png(master_dark, os.path.join(releases_assets, 'brown-b-black-logo.png'))

# 4. brown-website/Assets
print("\n--- Updating brown-website/Assets ---")
web_assets = os.path.join(BASE_DIR, 'brown-website', 'Assets')
save_webp(master_white, os.path.join(web_assets, 'brown-white-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-b-white-logo.webp'))
save_webp(master_white, os.path.join(web_assets, 'brown-lg.webp'))
save_webp(master_white, os.path.join(web_assets, 'ultron-logo.webp'))
save_webp(master_dark, os.path.join(web_assets, 'brown-black-logo.webp'))
save_webp(master_dark, os.path.join(web_assets, 'brown-b-black-logo.webp'))
save_ico(master_white, os.path.join(web_assets, 'brown-logo.ico'))
save_ico(master_white, os.path.join(web_assets, 'brown-lg.ico'))

# 5. brown-website/public/Assets
print("\n--- Updating brown-website/public/Assets ---")
web_pub_assets = os.path.join(BASE_DIR, 'brown-website', 'public', 'Assets')
save_webp(master_white, os.path.join(web_pub_assets, 'brown-white-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-b-white-logo.webp'))
save_webp(master_white, os.path.join(web_pub_assets, 'brown-lg.webp'))
save_webp(master_dark, os.path.join(web_pub_assets, 'brown-black-logo.webp'))
save_webp(master_dark, os.path.join(web_pub_assets, 'brown-b-black-logo.webp'))
save_ico(master_white, os.path.join(web_pub_assets, 'brown-b-white-logo.ico'))
save_ico(master_white, os.path.join(web_pub_assets, 'brown-lg.ico'))
save_square_on_black(master_white, os.path.join(web_pub_assets, 'brown-b-white-192.png'), 192)
save_square_on_black(master_white, os.path.join(web_pub_assets, 'brown-b-white-512.png'), 512)

# 6. brown-website/public favicons
print("\n--- Updating brown-website/public Favicons ---")
web_pub = os.path.join(BASE_DIR, 'brown-website', 'public')
save_square_on_black(master_white, os.path.join(web_pub, 'favicon-16x16.png'), 16)
save_square_on_black(master_white, os.path.join(web_pub, 'favicon-32x32.png'), 32)
save_square_on_black(master_white, os.path.join(web_pub, 'favicon-48x48.png'), 48)
save_square_on_black(master_white, os.path.join(web_pub, 'apple-touch-icon.png'), 180)
# favicon.ico with black-backed icons
ico_48 = Image.open(os.path.join(web_pub, 'favicon-48x48.png'))
ico_32 = Image.open(os.path.join(web_pub, 'favicon-32x32.png'))
ico_16 = Image.open(os.path.join(web_pub, 'favicon-16x16.png'))
ico_48.save(os.path.join(web_pub, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
print(f"Saved website favicon.ico: {os.path.join(web_pub, 'favicon.ico')}")

# 7. brown-website/dist (if exists)
web_dist_assets = os.path.join(BASE_DIR, 'brown-website', 'dist', 'Assets')
if os.path.exists(web_dist_assets):
    print("\n--- Updating brown-website/dist/Assets ---")
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-white-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-b-white-logo.webp'))
    save_webp(master_white, os.path.join(web_dist_assets, 'brown-lg.webp'))
    save_webp(master_dark, os.path.join(web_dist_assets, 'brown-black-logo.webp'))
    save_webp(master_dark, os.path.join(web_dist_assets, 'brown-b-black-logo.webp'))
    save_ico(master_white, os.path.join(web_dist_assets, 'brown-b-white-logo.ico'))

# 8. mobile/Assets
print("\n--- Updating mobile/Assets ---")
mob_assets = os.path.join(BASE_DIR, 'mobile', 'Assets')
save_png(master_white, os.path.join(mob_assets, 'brown-white-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-white-wordmark.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-b-white-logo.png'))
save_png(master_white, os.path.join(mob_assets, 'brown-lg.png'))
save_png(master_white, os.path.join(mob_assets, 'ultron-logo.png'))
save_png(master_dark, os.path.join(mob_assets, 'brown-black-logo.png'))
save_png(master_dark, os.path.join(mob_assets, 'brown-b-black-logo.png'))

# Mobile App Icons (1024x1024)
save_png(master_white, os.path.join(mob_assets, 'icon.png'))
save_png(master_white, os.path.join(mob_assets, 'adaptive-icon.png'))
save_png(master_white, os.path.join(mob_assets, 'favicon.png'))
save_png(master_white, os.path.join(mob_assets, 'splash.png'))
save_png(master_white, os.path.join(mob_assets, 'splash-small.png'))

print("\n=== ALL LOGOS REPLACED SUCCESSFULLY ===")
