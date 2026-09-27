import os
import base64
from PIL import Image

BASE_DIR = 'd:/Ultron'
SRC_WHITE = os.path.join(BASE_DIR, 'Assets', 'brown-white-logo.png')
img = Image.open(SRC_WHITE).convert('RGBA')

# 1. Crop to exact pixel bounding box to remove all built-in margins
bbox = img.getbbox()
cropped = img.crop(bbox)
cw, ch = cropped.size
print(f"Original: {img.size} -> Cropped bounding box: {cropped.size}")

def make_maximized_icon(cropped_img, size, fill_ratio=0.96):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    target_d = int(size * fill_ratio)
    ratio = min(target_d / cw, target_d / ch)
    tw = max(1, int(cw * ratio))
    th = max(1, int(ch * ratio))
    resized = cropped_img.resize((tw, th), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - tw) // 2, (size - th) // 2), resized)
    return canvas

# Directories
web_pub = os.path.join(BASE_DIR, 'brown-website', 'public')
dist_pub = os.path.join(BASE_DIR, 'brown-website', 'dist')

for base in [web_pub, dist_pub]:
    os.makedirs(base, exist_ok=True)
    # Save transparent maximized PNGs
    f16 = make_maximized_icon(cropped, 16, fill_ratio=0.96)
    f16.save(os.path.join(base, 'favicon-16x16.png'), format='PNG')
    
    f32 = make_maximized_icon(cropped, 32, fill_ratio=0.96)
    f32.save(os.path.join(base, 'favicon-32x32.png'), format='PNG')
    
    f48 = make_maximized_icon(cropped, 48, fill_ratio=0.96)
    f48.save(os.path.join(base, 'favicon-48x48.png'), format='PNG')
    
    f180 = make_maximized_icon(cropped, 180, fill_ratio=0.96)
    f180.save(os.path.join(base, 'apple-touch-icon.png'), format='PNG')
    
    # Save multi-frame ICO (16, 24, 32, 48, 64)
    f1024 = make_maximized_icon(cropped, 1024, fill_ratio=0.96)
    ico_dest = os.path.join(base, 'favicon.ico')
    f1024.save(ico_dest, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
    print(f"Saved maximized multi-frame ICO to {ico_dest}")

# Create 512x512 maximized white icon for SVG
f512 = make_maximized_icon(cropped, 512, fill_ratio=0.96)
temp_512 = os.path.join(BASE_DIR, 'scratch_max_512.png')
f512.save(temp_512, format='PNG')
with open(temp_512, 'rb') as f:
    b64_logo = base64.b64encode(f.read()).decode('ascii')
if os.path.exists(temp_512):
    os.remove(temp_512)

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image width="512" height="512" href="data:image/png;base64,{b64_logo}"/>
</svg>'''

for base in [web_pub, dist_pub]:
    svg_dest = os.path.join(base, 'favicon.svg')
    with open(svg_dest, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"Saved maximized vector favicon.svg: {svg_dest}")

print("\n=== Maximized transparent white favicons created successfully ===")
