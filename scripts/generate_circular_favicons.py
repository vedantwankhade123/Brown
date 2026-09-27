import os
import base64
from PIL import Image, ImageDraw

BASE_DIR = 'd:/Ultron'
SRC_WHITE = os.path.join(BASE_DIR, 'Assets', 'brown-white-logo.png')
master_white = Image.open(SRC_WHITE).convert('RGBA')

# Render super-sampled circular black favicon at 1024x1024
CANVAS_SIZE = 1024
hi_res = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(hi_res)

# Draw ultra-smooth anti-aliased circular black background
margin = 8  # slight margin for smooth anti-aliased perimeter
draw.ellipse([margin, margin, CANVAS_SIZE - margin, CANVAS_SIZE - margin], fill=(0, 0, 0, 255))

# Center the white logo inside the black circle (~64% of canvas)
target_logo_size = int(CANVAS_SIZE * 0.64)
aspect = master_white.width / master_white.height
if aspect > 1:
    tw = target_logo_size
    th = max(1, int(target_logo_size / aspect))
else:
    th = target_logo_size
    tw = max(1, int(target_logo_size * aspect))

resized_logo = master_white.resize((tw, th), Image.Resampling.LANCZOS)
hi_res.paste(resized_logo, ((CANVAS_SIZE - tw) // 2, (CANVAS_SIZE - th) // 2), resized_logo)

# Directories
web_pub = os.path.join(BASE_DIR, 'brown-website', 'public')
dist_pub = os.path.join(BASE_DIR, 'brown-website', 'dist')

def save_png(img, dest, size):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    out.save(dest, format='PNG')
    print(f"Saved circular favicon PNG ({size}x{size}): {dest}")

for base in [web_pub, dist_pub]:
    save_png(hi_res, os.path.join(base, 'favicon-16x16.png'), 16)
    save_png(hi_res, os.path.join(base, 'favicon-32x32.png'), 32)
    save_png(hi_res, os.path.join(base, 'favicon-48x48.png'), 48)
    save_png(hi_res, os.path.join(base, 'apple-touch-icon.png'), 180)
    
    # Save multi-frame ICO containing exact square frames
    ico_dest = os.path.join(base, 'favicon.ico')
    hi_res.save(ico_dest, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
    print(f"Saved circular multi-frame ICO: {ico_dest}")

# Create SVG favicon with crisp vector circle and embedded white logo
temp_white_path = os.path.join(BASE_DIR, 'scratch_white_temp.png')
resized_logo.save(temp_white_path, format='PNG')
with open(temp_white_path, 'rb') as f:
    b64_logo = base64.b64encode(f.read()).decode('ascii')
if os.path.exists(temp_white_path):
    os.remove(temp_white_path)

# 512x512 SVG coordinate space
offset_x = (512 - int(tw * 512 / CANVAS_SIZE)) // 2
offset_y = (512 - int(th * 512 / CANVAS_SIZE)) // 2
render_w = int(tw * 512 / CANVAS_SIZE)
render_h = int(th * 512 / CANVAS_SIZE)

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <circle cx="256" cy="256" r="250" fill="#000000"/>
  <image x="{offset_x}" y="{offset_y}" width="{render_w}" height="{render_h}" href="data:image/png;base64,{b64_logo}"/>
</svg>'''

for base in [web_pub, dist_pub]:
    svg_dest = os.path.join(base, 'favicon.svg')
    with open(svg_dest, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"Saved circular SVG favicon: {svg_dest}")

print("\n=== Circular black background favicons generated successfully ===")
