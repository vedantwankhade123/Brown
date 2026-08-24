"""Regenerate mobile/Assets/splash.png: keep the crest, render "Ultron"
wordmark (first letter capital, rest lowercase) in the original wordmark
slot, and drop the "OFFLINE INTELLIGENCE" tagline entirely."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np

SRC = r'd:\Ultron\mobile\Assets\splash.png'
FONT = r'd:\Ultron\mobile\node_modules\@expo-google-fonts\outfit\800ExtraBold\Outfit_800ExtraBold.ttf'

W, H = 1284, 2778
WORDMARK_SLOT_TOP = 1541  # original "ULTRON" band top (1541-1601, 61px tall)
TAGLINE_START = 1443      # wipe everything below the crest (old wordmark + tagline)

img = Image.open(SRC).convert('RGBA')
arr = np.array(img)

# Wipe all content below the crest (removes old wordmark + tagline)
arr[TAGLINE_START:, :] = (0, 0, 0, 255)
img = Image.fromarray(arr)

# Find Outfit_800ExtraBold size whose rendered cap height matches 61px
def glyph_height(font, text='U'):
    probe = Image.new('L', (400, 200), 0)
    d = ImageDraw.Draw(probe)
    d.text((10, 10), text, fill=255, font=font)
    a = np.array(probe)
    rows = np.where((a > 100).any(axis=1))[0]
    return rows[-1] - rows[0] + 1 if len(rows) else 0

size = 10
step = 128
for _ in range(12):  # coarse then fine binary search
    step = max(1, step // 2)
    candidates = [size, size + step, size - step]
    best = min(candidates, key=lambda s: abs(glyph_height(ImageFont.truetype(FONT, max(2, s))) - 61))
    size = best
font = ImageFont.truetype(FONT, size)
print('font size chosen:', size, 'cap height:', glyph_height(font))

# Render "Ultron" and measure its bbox for horizontal centering
probe = Image.new('RGBA', (W, H), (0, 0, 0, 0))
pd = ImageDraw.Draw(probe)
pd.text((0, 0), 'Ultron', fill=(255, 255, 255, 255), font=font)
pa = np.array(probe)
cols = np.where((pa[:, :, 0] > 100).any(axis=0))[0]
rows = np.where((pa[:, :, 0] > 100).any(axis=1))[0]
x0, x1 = cols.min(), cols.max()
y0, y1 = rows.min(), rows.max()
print('rendered bbox:', (x0, y0, x1, y1), 'size:', x1 - x0 + 1, 'x', y1 - y0 + 1)

# Draw centered on image center, top aligned to the original wordmark slot
draw = ImageDraw.Draw(img)
offset_x = (W - (x1 - x0 + 1)) // 2 - x0
offset_y = WORDMARK_SLOT_TOP - y0
draw.text((offset_x, offset_y), 'Ultron', fill=(255, 255, 255, 255), font=font)

img.save(SRC)
print('saved', SRC)

# Verify: report content bands
a = np.array(img.convert('L'))
rows = (a > 100).sum(axis=1)
bands, in_band = [], False
for y, c in enumerate(rows):
    if c > 0 and not in_band:
        start = y; in_band = True
    elif c == 0 and in_band:
        bands.append((start, y - 1)); in_band = False
if in_band:
    bands.append((start, len(rows) - 1))
print('content bands:', bands)
