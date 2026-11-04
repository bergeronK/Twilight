# Store assets

Screenshots for app store listings. These are submission artifacts, not
served by the site — separate from `screenshot-narrow.png` /
`screenshot-wide.png` at the repo root, which are the PWA install-prompt
images referenced by `manifest.json`. `generate.js` writes those two as well
(Console, 390 × 844 at 2x and 1280 × 800 at 1x, the sizes the manifest
declares); they are in `sw.js`'s precache list, so bump `CACHE` when they
change.

## `ios/`

Four screenshots at **1260 × 2736 px** — the 6.9" iPhone size, required by
App Store Connect for any app that runs on iPhone (per
[Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)).
One per tab (Console, Stars, Ephemeris) plus Sky View, captured with a mocked
forecast and a fixed evening clock so the app shows a fully-populated
"tonight" state rather than empty/loading placeholders.

The Sky View shot (`openSkyView` in `generate.js`, shared with the Android
generator) aims the view by reading a well-placed bright star out of the
app's own star table, preferring a patch of sky with neighbours over a lone
bright star, then dispatching one synthetic `DeviceOrientationEvent`.
Headless Chromium has no magnetometer, so without that the view sits in its
drag-to-look fallback and captions itself "No compass here" — which is not
what any real phone shows. Everything in the frame is still the app's own
rendering and its own computed positions; only the "which way is the phone
pointed" input is supplied.

Regenerate after any visual change to `index.html`:

```sh
python3 -m http.server 8137 &      # from the repo root
node store-assets/generate.js
```

### iPad

Four more at **2064 × 2752 px** — the 13" iPad size, required because the
Xcode project targets `TARGETED_DEVICE_FAMILY = "1,2"` (Universal). A
1032 × 1376 CSS viewport at 2x renders exactly that.

`isMobile` is **false** for these. iPadOS Safari reports a desktop-class
viewport, so emulating a mobile one would screenshot a layout no real iPad
ever shows.

The layout was reviewed at 13" portrait, 13" landscape and 11" portrait
before these were generated: no overflow on any tab, the `max-width: 1080`
containers centre with margins in landscape, and the Stars tab's star table
and sight-reduction form both use the extra width sensibly. No iPad-specific
CSS was needed.

## `android/`

Four assets for the Play Console store listing:

- `feature-graphic.png` — **1024 × 500 px**, the banner shown at the top of
  the listing. Rendered from `feature-graphic.html` (a standalone brand card,
  same look as the root `og-image.png`, resized/recomposed to fit 1024×500 —
  it's a separate static file, not part of `index.html`, so it isn't subject
  to the 5-script/CSP-hash rules). Uses a seeded PRNG for the starfield so
  regenerating it produces a pixel-identical result.
- `phone-01-console.png` / `phone-02-stars.png` / `phone-03-ephemeris.png` /
  `phone-04-skyview.png` — **1080 × 1920 px** (9:16), one per tab plus Sky
  View. Google Play has no fixed required resolution for phone screenshots
  (just bounds: 320–3840px per side, max:min ratio ≤ 2:1); 9:16 at 1080 px
  wide is what Play asks for a listing to be eligible for its
  recommendations, rendered from a 360×640 CSS viewport at 3x.
- `play-icon-512.png` — **512 × 512 px**, the Play listing's icon: the
  iPhone app's full-bleed icon (`AppIcon-512@2x.png`) at half size. Play
  rounds the corners itself. Not made by the generator.

Since 2026-11-04 the phone shots go through `generate.js`'s own `capture`,
taken as the App Store's are: the Grand Canyon, tonight at 22:15, a clear
forecast, and the page loaded **as the Android app** (`app: 'android'`), so
they show none of the website's "PRO", "free preview", Share link or visit
count. (They showed the website at Stowe, VT before.)

Regenerate after any visual change to `index.html` or `feature-graphic.html`:

```sh
python3 -m http.server 8137 &      # from the repo root
node store-assets/generate-android.js
```

The sandbox can't build Android (`dl.google.com` is blocked by its network
policy), so these are the web app rendered as the Android app would draw
it. The app itself is built and run in an emulator by CI
(`.github/workflows/android-build.yml`); signing and the Play upload are
done in Android Studio, as the iOS app's are in Xcode on a Mac.
