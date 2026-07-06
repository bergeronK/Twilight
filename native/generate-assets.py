#!/usr/bin/env python3
"""Regenerates native launcher icons and splash screens from the repo's
brand art (icon-512.png / icon-512-maskable.png), writing directly into the
Capacitor-generated android/ and ios/ projects.

This replaces `@capacitor/assets`, whose sharp dependency needs a native
binary download that some build environments block. Requires only Pillow:
  pip install pillow && python3 generate-assets.py

Source art contract:
  ../icon-512.png           full square icon (also the PWA any-purpose icon)
  ../icon-512-maskable.png  full-bleed art, content in the central safe zone
                            (safe for both PWA maskable 80% and Android
                            adaptive ~61% crops)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(HERE, 'android/app/src/main/res')
XC = os.path.join(HERE, 'ios/App/App/Assets.xcassets')
BRAND_BG = (7, 10, 20)  # #070a14

icon = Image.open(os.path.join(ROOT, 'icon-512.png')).convert('RGB')
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

for dpi, s in LAUNCHER.items():
    save(icon.resize((s, s), Image.LANCZOS), f'mipmap-{dpi}/ic_launcher.png')
    save(circled(mask_art.resize((s, s), Image.LANCZOS)), f'mipmap-{dpi}/ic_launcher_round.png')
for dpi, s in FOREGROUND.items():
    save(mask_art.resize((s, s), Image.LANCZOS), f'mipmap-{dpi}/ic_launcher_foreground.png')

# Adaptive-icon background color (behind the foreground layer)
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

for d in sorted(os.listdir(RES)):
    p = os.path.join(RES, d, 'splash.png')
    if os.path.exists(p):
        w, h = Image.open(p).size
        save(splash(w, h), f'{d}/splash.png')

# --- iOS ---
icon.resize((1024, 1024), Image.LANCZOS).save(
    os.path.join(XC, 'AppIcon.appiconset/AppIcon-512@2x.png'))
print('AppIcon 1024')
ios_splash = splash(2732, 2732)
for n in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    ios_splash.save(os.path.join(XC, 'Splash.imageset', n))
print('iOS splash 2732 x3')
print('done')
