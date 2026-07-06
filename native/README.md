# Twilight — native shell (iOS & Android)

A [Capacitor](https://capacitorjs.com) wrapper around the PWA in the repo
root. The web app is the single source of truth; nothing here forks it. The
shell bundles the same `index.html` + assets into native app packages so
Twilight can ship on the App Store and Play Store (and later sell the Pro
tier through StoreKit / Play Billing instead of the current free-preview
flag).

## Layout

| Path | What it is | Committed? |
| --- | --- | --- |
| `package.json`, `capacitor.config.json` | shell config | yes |
| `sync-web.js` | stages the web app from the repo root into `www/` | yes |
| `generate-assets.py` | regenerates launcher icons + splash screens from `../icon-512*.png` (Pillow-based; replaces `@capacitor/assets`, whose sharp binary download is blocked in some build environments) | yes |
| `android/`, `ios/` | Capacitor-generated native projects (with our manifest/plist edits) | yes |
| `www/`, `*/public/`, copied `capacitor.config.json` | build artifacts of `npm run sync` | no (gitignored) |

## Building

```sh
cd native
npm install
npm run sync          # stage web app + update native projects
npm run open:android  # Android Studio (or: cd android && ./gradlew assembleDebug)
npm run open:ios      # Xcode (macOS only)
```

After **any** change to the web app, re-run `npm run sync` before building.

If the brand art (`../icon-512.png` / `../icon-512-maskable.png`) changes:
`python3 generate-assets.py` (needs `pip install pillow`).

## Platform notes

- **Service worker:** `index.html` skips SW registration when
  `window.Capacitor` is present. Assets are bundled in the binary, so there
  is nothing for a SW to cache; `sw.js` is deliberately not staged into
  `www/`.
- **Geolocation:** uses the same `navigator.geolocation` code as the web
  app, bridged by `@capacitor/geolocation`. The Android manifest declares
  COARSE+FINE location (GPS marked not-required); the iOS
  `NSLocationWhenInUseUsageDescription` string is in `Info.plist`.
- **App ID:** `info.twilyte.app` (Android `applicationId` and iOS bundle id).

## Release checklist (owner actions — cannot be automated)

1. **Apple:** Apple Developer Program membership ($99/yr) → create the app
   in App Store Connect with bundle id `info.twilyte.app` → build & sign in
   Xcode on a Mac (or a cloud mac CI like Codemagic) → TestFlight → submit.
2. **Google:** Play Console account ($25 once) → create the app → build a
   signed AAB (`cd android && ./gradlew bundleRelease`, then sign, or use
   Play App Signing) → internal testing track → production.
3. **Store listings:** the repo's `screenshot-narrow.png`/`screenshot-wide.png`
   are the right starting points; both stores need their own size variants.
4. **Later (Pro monetization):** create matching IAP products in both
   consoles, then swap `prefStore`'s `pro` default for a real entitlement
   check (RevenueCat recommended to unify both stores).
