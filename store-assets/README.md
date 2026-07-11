# Store assets

Screenshots for app store listings. These are submission artifacts, not
served by the site — separate from `screenshot-narrow.png` /
`screenshot-wide.png` at the repo root, which are the PWA install-prompt
images referenced by `manifest.json`.

## `ios/`

Three screenshots at **1260 × 2736 px** — the 6.9" iPhone size, required by
App Store Connect for any app that runs on iPhone (per
[Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)).
One per tab (Console, Stars, Ephemeris), captured with a mocked forecast and
a fixed evening clock so the app shows a fully-populated "tonight" state
rather than empty/loading placeholders.

Regenerate after any visual change to `index.html`:

```sh
python3 -m http.server 8137 &      # from the repo root
node store-assets/generate.js
```

**iPad screenshots are not included.** The Xcode project currently targets
`TARGETED_DEVICE_FAMILY = "1,2"` (Universal — iPhone + iPad), which means
Apple will also require 13" iPad screenshots (2064 × 2752 px) at actual
submission time. The app's layout hasn't been specifically reviewed at
iPad's aspect ratio yet, so before generating those:

1. Check how the Console/Ephemeris/Stars layouts actually look at a
   13"-iPad viewport (~1032×1376 CSS px) — the max-width containers should
   mostly cope, but this hasn't been verified.
2. Decide whether Twilight should ship as Universal (broader reach, more
   surface to QA and screenshot) or iPhone-only for v1 (set
   `TARGETED_DEVICE_FAMILY = "1"` in `native/ios/App/App.xcodeproj/project.pbxproj`
   to drop the iPad requirement entirely and simplify submission).

## Android

Not yet started. Google Play's required feature graphic and phone
screenshots have their own dimensions, separate from both the iOS set here
and the PWA install images.
