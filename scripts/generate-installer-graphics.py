import os
from PIL import Image, ImageDraw, ImageFont

def generate_installer_graphics():
    assets_dir = os.path.join(os.path.dirname(__file__), '..', 'Assets')
    logo_path = os.path.join(assets_dir, 'ultron-logo.png')
    
    if not os.path.exists(logo_path):
        print(f"Error: Logo file not found at {logo_path}")
        return
        
    logo = Image.open(logo_path).convert('RGBA')
    
    # ----------------------------------------------------
    # 1. NSIS MUI Welcome / Finish Page Sidebar (164 x 314)
    # ----------------------------------------------------
    sidebar_w, sidebar_h = 164, 314
    sidebar = Image.new('RGB', (sidebar_w, sidebar_h), color=(10, 15, 29))
    draw_s = ImageDraw.Draw(sidebar)
    
    # Elegant dark gradient background
    for y in range(sidebar_h):
        factor = y / float(sidebar_h)
        r = int(10 + factor * 14)
        g = int(15 + factor * 22)
        b = int(29 + factor * 45)
        draw_s.line([(0, y), (sidebar_w, y)], fill=(r, g, b))
        
    # Futuristic subtle cyber accents
    accent_color = (30, 58, 102)
    for y in range(0, sidebar_h, 24):
        draw_s.line([(0, y), (sidebar_w, y)], fill=accent_color)
    for x in range(0, sidebar_w, 24):
        draw_s.line([(x, 0), (x, sidebar_h)], fill=accent_color)
        
    # Cyan highlight stripe on the right edge
    for y in range(sidebar_h):
        intensity = int(120 + 80 * (1.0 - abs(y - sidebar_h / 2.0) / (sidebar_h / 2.0)))
        draw_s.point((sidebar_w - 1, y), fill=(0, intensity, 255))
        draw_s.point((sidebar_w - 2, y), fill=(0, int(intensity * 0.6), int(intensity * 0.9)))

    # Centered Logo in upper half
    logo_sidebar_size = 96
    logo_sidebar = logo.resize((logo_sidebar_size, logo_sidebar_size), Image.Resampling.LANCZOS)
    logo_x = (sidebar_w - logo_sidebar_size) // 2
    logo_y = 48
    sidebar.paste(logo_sidebar, (logo_x, logo_y), logo_sidebar)

    sidebar_bmp_path = os.path.join(assets_dir, 'installerSidebar.bmp')
    sidebar.save(sidebar_bmp_path, 'BMP')
    print(f"Generated {sidebar_bmp_path} ({sidebar_w}x{sidebar_h})")

    # ----------------------------------------------------
    # 2. NSIS MUI Header Bitmap (150 x 57)
    # ----------------------------------------------------
    header_w, header_h = 150, 57
    header = Image.new('RGB', (header_w, header_h), color=(10, 15, 29))
    draw_h = ImageDraw.Draw(header)
    
    for y in range(header_h):
        factor = y / float(header_h)
        r = int(10 + factor * 14)
        g = int(15 + factor * 22)
        b = int(29 + factor * 45)
        draw_h.line([(0, y), (header_w, y)], fill=(r, g, b))
        
    # Top/Bottom accent borders
    draw_h.line([(0, header_h - 1), (header_w, header_h - 1)], fill=(0, 150, 255))

    # Logo on right side
    logo_header_size = 46
    logo_header = logo.resize((logo_header_size, logo_header_size), Image.Resampling.LANCZOS)
    header_x = header_w - logo_header_size - 8
    header_y = (header_h - logo_header_size) // 2
    header.paste(logo_header, (header_x, header_y), logo_header)

    header_bmp_path = os.path.join(assets_dir, 'installerHeader.bmp')
    header.save(header_bmp_path, 'BMP')
    print(f"Generated {header_bmp_path} ({header_w}x{header_h})")

if __name__ == '__main__':
    generate_installer_graphics()
