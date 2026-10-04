from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'Assets'
LOGOS=ASSETS/'Brown Logos'
# Keep supplied masters intact. Legacy filenames now resolve to the new mark.
SOURCES={
    'browny_black.png':'brown-black-transparent-logo.png',
    'browny_white.png':'brown-white-transparent-logo.png',
    'browny_white_bg.png':'brown-black-white-bg-logo.png',
    'browny_black_bg.png':'brown-whte-black-bg-logo.png',
}
for target, source in SOURCES.items():
    shutil.copy2(LOGOS/source, ASSETS/target)
for dest in [ASSETS/'Brand-Assets',ROOT/'mobile/Assets',ROOT/'brown-website/public/Assets']:
    dest.mkdir(parents=True,exist_ok=True)
    for target, source in SOURCES.items():
        shutil.copy2(LOGOS/source,dest/target)
    for source in SOURCES.values():
        shutil.copy2(LOGOS/source,dest/source)


def fitted(src,size,bg=(0,0,0,0),fraction=1):
    im=Image.open(src).convert('RGBA')
    im.thumbnail((int(size*fraction),int(size*fraction)),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(size,size),bg)
    canvas.alpha_composite(im,((size-im.width)//2,(size-im.height)//2))
    return canvas

def write_icon(src,path,size,bg=(0,0,0,0),fraction=1):
    path.parent.mkdir(parents=True,exist_ok=True)
    fitted(src,size,bg,fraction).save(path)

def bear_tile(size,source='browny_black_bg.png'):
    """White bear on a black rounded tile — legible on light and dark taskbars."""
    im=Image.open(ASSETS/source).convert('RGB')
    w,h=im.size; s=min(w,h)
    im=im.crop(((w-s)//2,(h-s)//2,(w+s)//2,(h+s)//2)).resize((size,size),Image.Resampling.LANCZOS)
    mask=Image.new('L',(size,size),0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,size-1,size-1],max(2,int(size*.22)),fill=255)
    out=im.convert('RGBA'); out.putalpha(mask)
    return out

# Keep the supplied master files untouched; app copies preserve their pixels.
for dest in [ROOT/'mobile/Assets',ROOT/'brown-website/public/Assets']:
    for theme in ['white','black']:
        shutil.copy2(ASSETS/f'browny_{theme}.png',dest/f'browny_{theme}.png')
web=ROOT/'brown-website/public'
for name in ['browny_white_bg.png','browny_black_bg.png']:
    shutil.copy2(ASSETS/name,web/'Assets'/name)
for size in [16,32,48]:
    write_icon(ASSETS/'browny_black.png',web/f'favicon-{size}x{size}.png',size)
# Legacy browser fallback also preserves transparency.
fitted(ASSETS/'browny_black.png',256).save(web/'favicon.ico',sizes=[(x,x) for x in [16,32,48,64,128,256]])
write_icon(ASSETS/'browny_white_bg.png',web/'apple-touch-icon.png',180,(255,255,255,255))
for size in [192,512]:
    write_icon(ASSETS/'browny_white_bg.png',web/'Assets'/f'browny-result-{size}.png',size,(255,255,255,255))
# Windows taskbar/exe icon and installer header mark: bear on rounded black tile.
bear_tile(256).save(ASSETS/'Brown.ico',sizes=[(x,x) for x in [16,24,32,48,64,128,256]])
# Brand-Assets copy kept in sync: resolveWindowIcon() checks that folder first.
bear_tile(256).save(ASSETS/'Brand-Assets/Brown.ico',sizes=[(x,x) for x in [16,24,32,48,64,128,256]])
bear_tile(256).save(ASSETS/'Brand-Assets/Brown-header.ico',sizes=[(16,16),(32,32),(48,48),(256,256)])

def installer_art():
    """NSIS wants 24-bit BMPs: header 150x57 (white), sidebar 164x314 (black)."""
    font_dir=Path('C:/Windows/Fonts')
    bold=lambda px:ImageFont.truetype(str(font_dir/'arialbd.ttf'),px)
    header=Image.new('RGB',(150,57),(255,255,255))
    tile=bear_tile(40); header.paste(tile,(8,8),tile)
    ImageDraw.Draw(header).text((56,17),'Brown',font=bold(22),fill=(17,24,39))
    header.save(ASSETS/'installerHeader.bmp')
    sidebar=Image.new('RGB',(164,314),(9,9,11))
    tile=bear_tile(104); sidebar.paste(tile,(30,84),tile)
    draw=ImageDraw.Draw(sidebar)
    bbox=draw.textbbox((0,0),'Brown',font=bold(26))
    draw.text(((164-(bbox[2]-bbox[0]))//2-bbox[0],208),'Brown',font=bold(26),fill=(255,255,255))
    bbox=draw.textbbox((0,0),'AI Assistant',font=bold(12))
    draw.text(((164-(bbox[2]-bbox[0]))//2-bbox[0],246),'AI Assistant',font=bold(12),fill=(154,160,166))
    sidebar.save(ASSETS/'installerSidebar.bmp')
installer_art()
mobile=ROOT/'mobile/Assets'
write_icon(ASSETS/'browny_black_bg.png',mobile/'Brown-icon.png',1024,(0,0,0,255))
write_icon(ASSETS/'browny_white.png',mobile/'Brown-adaptive.png',1024,fraction=.62)
write_icon(ASSETS/'browny_white.png',mobile/'Brown-splash.png',1280,fraction=.32)
write_icon(ASSETS/'browny_white.png',mobile/'Brown-favicon.png',48)
for p in (ROOT/'mobile/android/app/src/main/res').glob('*/*.png'):
    if p.name.startswith('ic_launcher') or p.name=='splashscreen_image.png':
        with Image.open(p) as im: size=im.width
        fraction=.62 if 'foreground' in p.name else (.32 if 'splash' in p.name else .82)
        if 'foreground' in p.name or 'splash' in p.name:
            write_icon(ASSETS/'browny_white.png',p,size,fraction=fraction)
        else:
            write_icon(ASSETS/'browny_black_bg.png',p,size,(0,0,0,255))

# Remaining legacy assets used by older UI/build surfaces.
for dest in [ASSETS,ASSETS/'Brand-Assets',mobile,web/'Assets']:
    for name, source in [('Brown-white.png','browny_white.png'),('Brown-black.png','browny_black.png'),('Brown-black-w.png','browny_white_bg.png')]:
        shutil.copy2(ASSETS/source,dest/name)
for name, source in [('Brown-white.webp','browny_white.png'),('Brown-black.webp','browny_black.png'),('Brown-black-w.webp','browny_white_bg.png')]:
    Image.open(ASSETS/source).save(web/'Assets'/name,lossless=True)
# All search/PWA variants use the opaque black-on-white artwork.
for size in [48,96,192,512]:
    write_icon(ASSETS/'browny_white_bg.png',web/'Assets'/f'brown-search-logo-{size}.png',size,(255,255,255,255))
# Open Graph: fixed white canvas with black mark, no color reinterpretation.
mark=Image.open(ASSETS/'browny_black.png').convert('RGBA'); mark.thumbnail((380,380),Image.Resampling.LANCZOS)
card=Image.new('RGBA',(1200,630),'white'); card.alpha_composite(mark,((1200-mark.width)//2,(630-mark.height)//2)); card.convert('RGB').save(web/'Assets/brand-feature-image-1200x630.png')
shutil.copy2(ASSETS/'browny_black_bg.png',ASSETS/'Brown-white-b.png')
for size in [48,96,192,512]:
    shutil.copy2(web/'Assets'/f'brown-search-logo-{size}.png',ASSETS/f'brown-search-logo-{size}.png')
# Replace the unused SVG favicon fallback too, retaining the supplied raster.
import base64, io
buffer=io.BytesIO(); fitted(ASSETS/'browny_black.png',128).save(buffer,format='PNG')
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()+'"/></svg>'
(web/'favicon.svg').write_text(svg)
print('Updated new Brown logos, desktop icons, mobile launcher/splash assets, and website assets.')
