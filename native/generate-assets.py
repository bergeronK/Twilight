#!/usr/bin/env python3
"""Regenerates native launcher icons and splash screens from the repo's
brand art (icon-512.png / icon-512-maskable.png), writing directly into the
Capacitor-generated android/ and ios/ projects.

This replaces `@capacitor/assets`, whose sharp dependency needs a native
binary download that some build environments block. Requires only Pillow:
  pip install pillow && python3 generate-assets.py        # everything
                        python3 generate-assets.py ios    # iOS only

Source art contract:
  ../icon-512.png           full square icon (also the PWA any-purpose icon)
  ../icon-512-maskable.png  full-bleed art, content in the central safe zone
                            (safe for both PWA maskable 80% and Android
                            adaptive ~61% crops)

The iOS app icon and the website's apple-touch-icon.png are `full_bleed` of
icon-512.png: iOS draws its own rounded square, so the round art's faint
ring and dark corners showed as a light circle on the Home Screen.
"""
import math
import os
import statistics
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(HERE, 'android/app/src/main/res')
XC = os.path.join(HERE, 'ios/App/App/Assets.xcassets')
BRAND_BG = (7, 10, 20)  # #070a14

icon_rgba = Image.open(os.path.join(ROOT, 'icon-512.png')).convert('RGBA')
icon = icon_rgba.convert('RGB')
mask_art = Image.open(os.path.join(ROOT, 'icon-512-maskable.png')).convert('RGB')

def save(img, rel):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print(rel, img.size)

# --- Android launcher icons ---
LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
FOREGROUND = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

def circled(img):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0) + img.size, fill=255)
    out = Image.new('RGBA', img.size)
    out.paste(img, (0, 0), m)
    return out

def full_bleed(src, inner=252, band=(244, 251)):
    """The round icon art as a full square, for icons the platform masks
    itself (iOS). Everything outside radius `inner` (the faint ring at ~254
    and the transparent corners) becomes its row's sky or ground colour, read
    just inside the circle on the same side, so the fill continues the edge
    without a step; partly transparent stars are laid over that colour."""
    W, H = src.size
    cx, cy = (W - 1) / 2, (H - 1) / 2
    px = src.load()
    sides = ({}, {})  # left, right: y -> colour
    for y in range(H):
        dy = y - cy
        got = ([], [])
        for r in range(band[0], band[1] + 1):
            if abs(dy) >= r:
                continue
            dx = math.sqrt(r * r - dy * dy)
            for s, x in enumerate((round(cx - dx), round(cx + dx))):
                p = px[x, y]
                if p[3] == 255:
                    got[s].append(p[:3])
        for s in (0, 1):
            if len(got[s]) >= 3:
                sides[s][y] = tuple(int(statistics.median(c[i] for c in got[s])) for i in range(3))
    def colour(s, y):
        d = sides[s]
        return d[y] if y in d else d[min(d, key=lambda k: abs(k - y))]
    out = Image.new('RGB', (W, H))
    op = out.load()
    for y in range(H):
        cl, cr = colour(0, y), colour(1, y)
        for x in range(W):
            c = cl if x < cx else cr
            p = px[x, y]
            if math.hypot(x - cx, y - cy) <= inner and p[3]:
                a = p[3] / 255
                op[x, y] = tuple(round(p[i] * a + c[i] * (1 - a)) for i in range(3))
            else:
                op[x, y] = c
    return out

IOS_ONLY = sys.argv[1:] == ['ios']

for dpi, s in ({} if IOS_ONLY else LAUNCHER).items():
    save(icon.resize((s, s), Image.LANCZOS), f'mipmap-{dpi}/ic_launcher.png')
    save(circled(mask_art.resize((s, s), Image.LANCZOS)), f'mipmap-{dpi}/ic_launcher_round.png')
for dpi, s in ({} if IOS_ONLY else FOREGROUND).items():
    save(mask_art.resize((s, s), Image.LANCZOS), f'mipmap-{dpi}/ic_launcher_foreground.png')

# Adaptive-icon background color (behind the foreground layer)
if not IOS_ONLY:
  with open(os.path.join(RES, 'values/ic_launcher_background.xml'), 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            '    <color name="ic_launcher_background">#070A14</color>\n</resources>')
  print('values/ic_launcher_background.xml #070A14')

# --- Android splash screens (regenerate every existing splash.png in place) ---
def splash(w, h):
    # Circle-cropped art reads as a badge; a square paste against the brand
    # background shows a hard postcard edge.
    img = Image.new('RGB', (w, h), BRAND_BG)
    a = int(min(w, h) * 0.35)
    art = circled(mask_art.resize((a, a), Image.LANCZOS))
    img.paste(art, ((w - a) // 2, (h - a) // 2), art)
    return img

for d in ([] if IOS_ONLY else sorted(os.listdir(RES))):
    p = os.path.join(RES, d, 'splash.png')
    if os.path.exists(p):
        w, h = Image.open(p).size
        save(splash(w, h), f'{d}/splash.png')

# --- iOS ---
square = full_bleed(icon_rgba)
square.resize((1024, 1024), Image.LANCZOS).save(
    os.path.join(XC, 'AppIcon.appiconset/AppIcon-512@2x.png'))
print('AppIcon 1024 (full bleed)')
# The website's Home Screen icon on iPhone: same art, same reason.
square.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'apple-touch-icon.png'))
print('apple-touch-icon 180 (full bleed)')
ios_splash = splash(2732, 2732)
for n in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    ios_splash.save(os.path.join(XC, 'Splash.imageset', n))
print('iOS splash 2732 x3')
print('done')
