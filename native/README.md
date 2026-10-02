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

CI compiles the app for the simulator on every change under `native/`
(`.github/workflows/ios-build.yml`: unsigned, no Apple account needed), so a
Swift or project error shows up there first. Signing, running on a phone and
uploading to App Store Connect happen in Xcode on a Mac.

### iOS on a Mac

One-time setup:
1. Install **Xcode** from the Mac App Store and open it once (it installs
   its components). Xcode → Settings → Accounts → **+** → your Apple ID
   (the one in the Apple Developer Program).
2. Install **Node 22 or later** (nodejs.org, or `brew install node`);
   Capacitor 8's tools need it.
3. Get the code and open the project:
   ```sh
   git clone https://github.com/bergeronK/Twilight.git
   cd Twilight/native
   npm install
   npm run sync        # stage the web app + update the native project
   npx cap open ios    # opens native/ios/App/App.xcodeproj in Xcode
   ```
4. In Xcode, select the **App** target → **Signing & Capabilities** →
   **Team**: your team. Leave "Automatically manage signing" on; Xcode
   registers the bundle id `info.twilyte.app` and makes the certificates
   and profiles itself.

Run on your iPhone: plug it in (or pair it over Wi-Fi), pick it as the run
destination at the top of the window, press **Run** (⌘R). The first time,
the phone asks you to turn on Developer Mode (Settings → Privacy & Security)
and to trust the developer (Settings → General → VPN & Device Management).

After pulling changes: `git pull && npm install && npm run sync`, then Run
again (`npm install` picks up a new Capacitor version when `package.json`
changes).

The app uses UIKit's scene life cycle (`App/SceneDelegate.swift`, the
`UIApplicationSceneManifest` in `Info.plist`), which needs Capacitor 8.5 or
later. Built with the current Xcode, an app without it is stopped at
launch: "UIScene life cycle is required for apps built with this SDK".

Upload a build for TestFlight and the App Store:
1. App Store Connect → Apps → **+** → New App: platform iOS, name
   **Twilyte**, bundle ID `info.twilyte.app`, SKU e.g. `twilyte-ios`
   (once).
2. Raise **Build** (the App target's General tab) above the last upload;
   **Version** stays 1.0 until the next release.
3. Run destination **Any iOS Device (arm64)**, then Product → **Archive**.
   In the Organizer: **Distribute App** → **App Store Connect** →
   **Upload**. The build appears in TestFlight after Apple processes it
   (about 15 minutes).

`ITSAppUsesNonExemptEncryption` is false in `Info.plist` (the app uses
only HTTPS), so App Store Connect doesn't ask about encryption for each
build. `App/PrivacyInfo.xcprivacy` is the app's privacy manifest; keep it in
step with `../docs/app-store-privacy-answers.md`.

### Android

```sh
cd native
npm install
npm run sync
npm run open:android  # Android Studio (or: cd android && ./gradlew assembleDebug)
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
   in App Store Connect with bundle id `info.twilyte.app` → build, sign and
   upload in Xcode on a Mac (see "iOS on a Mac" above) → TestFlight →
   submit.
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

**Not yet run on a device** (CI compiles it for the simulator). To try it:
1. `npm run sync`.
2. `npx cap open ios`, then run it on an iPhone (see "iOS on a Mac").
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
