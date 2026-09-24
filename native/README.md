# Twilyte — native shell (iOS & Android)

A [Capacitor](https://capacitorjs.com) wrapper around the PWA in the repo
root. The web app is the single source of truth; nothing here forks it. The
shell bundles the same `index.html` + assets into native app packages so
Twilyte can ship on the App Store and Play Store (and later sell the Pro
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
4. **Pro monetization (wired, awaiting keys):** the web app already contains
   the full RevenueCat integration — boot-time entitlement sync, an
   Unlock/Restore purchase UI in Settings, and the `@revenuecat/purchases-capacitor`
   plugin is installed. It activates per-platform the moment a public SDK
   key is set in `RC_KEYS` in `../index.html` (search for `RC_KEYS`). Until
   then the app keeps today's free-preview behavior. To go live:
   - App Store Connect: create the app (bundle id `info.twilyte.app`) and a
     **non-consumable** IAP product (suggested id `tw_pro_lifetime`).
   - RevenueCat (free tier): create a project + iOS app, connect App Store
     Connect, add the product to an **entitlement named exactly `pro`**
     inside the **current offering**, then copy the public Apple SDK key
     (`appl_…`) into `RC_KEYS.ios`.
   - Same flow later for Google Play (`goog_…` key into `RC_KEYS.android`).
   The purchase flow buys the first package of the current offering, so no
   product ids appear in code — pricing and product changes are RevenueCat
   dashboard operations.

## Sky View orientation from CoreMotion (iOS)

The iPhone app doesn't read the browser's orientation events. It reads
CoreMotion's own fused orientation, referenced to **true north**, through a
small plugin in `ios/App/App/AppDelegate.swift` (`TwilyteMotionPlugin`,
JS name `TwilyteMotion`). This is how native sky apps such as Stellarium get
their accuracy. The website can't: it has only the browser's angles plus a
separate, whole-degree, magnetic compass heading.

- **Registered** by `TwilyteBridgeViewController` (same file), which
  `Base.lproj/Main.storyboard` names in place of `CAPBridgeViewController`.
  Both live in `AppDelegate.swift`, so the Xcode project file needed no
  changes.
- **No permission prompt.** CoreMotion needs none. True north uses the
  device's location, which the app already asks for. Without it, the plugin
  falls back to magnetic north, and the web code applies the declination.
- **Calibration.** iOS shows its own figure-eight prompt when the compass
  needs it (`showsDeviceMovementDisplay`).
- **Frame direction is checked, not assumed.** `index.html`'s
  `iosAttitudeToEnu` uses gravity to settle which way round CoreMotion's
  matrix goes, once the phone has turned a little from where it started.

**Not yet built or run on a device**: this sandbox has no Mac. To try it:
1. `npm run sync`.
2. `npx cap open ios`, then build to an iPhone.
3. Open Sky View and aim at the Moon.
4. Open Sensor details. **Fusion** should read "iOS CoreMotion (native, gyro +
   compass)", and **CoreMotion frame** should read "true north · matrix …"
   once you've turned the phone a little.
5. Send that readout. If the drawn Moon sits on the real one, it works. If
   it's mirrored (right when it should be left), the frame direction or the
   west axis is the suspect: `native-motion.test.js` pins both against a
   simulated CoreMotion.

Android is unchanged: the browser's `deviceorientationabsolute` already
comes from Android's fused rotation vector.
