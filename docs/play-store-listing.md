# Play Store listing — Twilyte 1.0 (Android)

What to enter in the Play Console for the first Android release, the
Android counterpart of [`app-store-listing.md`](app-store-listing.md). Each
text block below is exactly what goes in its field;
`android-app.test.js` holds every one to Google's length limit and checks
the images' sizes.

**Before 1.0 on Android, one decision is the owner's**
([`monetization.md`](monetization.md)): Android can't tell who had the app
before Pro went on sale (it has no "first version downloaded"), so whoever
installs a free 1.0 would lose Pro's features when 1.1 sells them. Either
ship Android with Pro on sale from its first release, or ship it free and
settle a rule for those people before 1.1. As built, with no RevenueCat key
for Android, everything is unlocked and nothing is sold, as on the iPhone.

## Store listing (Grow → Store presence → Main store listing)

### App name (30)
```
Twilyte
```

### Short description (80)
```
When twilight ends, how dark your sky gets, and what’s worth a look tonight.
```

### Full description (4000)
```
Twilyte shows the twilight and the night sky for wherever you are, as it is right now.

THE SKY TONIGHT
Open the app to a painting of your own sky: the colours of the twilight at this minute, the stars you could actually see from your place, and the Moon and planets where they really are. Under it, tonight runs as one ribbon from sunset to sunrise, with the dark hours and the Moon marked.

TWILIGHT, STAGE BY STAGE
See when each stage of twilight begins and ends, today and any other day: civil, nautical and astronomical dusk and dawn, sunrise and sunset, golden hour and blue hour. A countdown says how long until the next one. Add tonight’s sunset or tomorrow’s sunrise to your calendar.

HOW DARK YOUR SKY IS
Twilyte rates your sky on the Bortle scale from NASA’s satellite measurements of light at night, and says what that means: whether the Milky Way shows, or only the brightest stars.

WORTH A LOOK TONIGHT
Up to three things worth going outside for: a meteor shower at the rate you’d see from your place, two planets close together, a planet at its best, a galaxy or star cluster high in a dark sky.

SKY VIEW
Point your phone at the sky and Sky View names the stars, planets and constellations in front of you. Find anything that’s up and Twilyte turns you toward it. Slide the clock forward to see where Jupiter will rise tonight.

THE WEEK AHEAD
The next seven nights, scored for clear, dark skies from the cloud forecast and the Moon, so you know which night to plan for.

FOR NAVIGATORS
Folded away until you want them: the navigation stars, a three-star fix, the sextant window at dusk and dawn, and sight reduction for the Sun, Moon and stars.

ALSO
• The Moon’s phase for the month, moonrise and moonset, and features on the Moon worth a look tonight
• Eclipses for the next three years, with what you’ll see from where you are
• Jupiter’s moons and Saturn’s rings as they are tonight
• A red light mode that keeps your eyes dark-adapted
• Works without a signal once it has loaded

Twilyte doesn’t track you. There is no account, no advertising and no analytics. All the astronomy is worked out on your phone, and the times agree with professional astronomy software to within a minute.
```

The App Store's description with one change: on Android "Add to calendar"
opens the calendar's own new-event screen, which uses the calendar's
default reminder (Android has no way to pass one in), so it doesn't promise
"with a reminder". The space station and the northern lights stay out, as
on the App Store, until they're seen working in the app.

### Graphics
In `store-assets/android/` (`node store-assets/generate-android.js`, with a
local server running, redoes all but the icon):
- **App icon**, 512 × 512: `play-icon-512.png`, the iPhone app's full-bleed
  icon (Play rounds the corners itself).
- **Feature graphic**, 1024 × 500: `feature-graphic.png`.
- **Phone screenshots**, 1080 × 1920, in this order: `phone-01-console.png`,
  `phone-02-stars.png`, `phone-03-ephemeris.png`, `phone-04-skyview.png`.
  Taken as the Android app, at the Grand Canyon, as the App Store's are.
- Tablet screenshots are optional; without them Play doesn't feature the
  app for tablets.

### Category and contact
- **App category:** Education, where Play keeps astronomy apps; Books &
  Reference would match the App Store's Reference.
- **Email:** support@twilyte.info
- **Website:** https://twilyte.info
- **Privacy policy:** https://twilyte.info/privacy.html

## App content (Policy → App content)

- **Privacy policy:** https://twilyte.info/privacy.html
- **Ads:** No, the app contains no ads.
- **App access:** All functionality is available without special access
  (no account, no login).
- **Content rating:** the IARC questionnaire, category "Reference, News,
  or Educational", every content question No. Expect Everyone / PEGI 3.
- **Target audience:** 13 and over (13-15, 16-17, 18+). Including under-13s
  brings in the Families policy's extra requirements. "Could the app
  appeal to children?" No.
- **Data safety:** as [`app-store-privacy-answers.md`](app-store-privacy-answers.md)
  says under Google Play: Location only, for app functionality. With
  nothing sold in this version, leave out its Purchase history entry.
- **Advertising ID:** No, the app doesn't use one (CI's permission check
  fails if a library ever adds `AD_ID`).
- **News app, government app, financial features, health:** No / none.

## Pricing and distribution
- **Price:** Free. On Play a free app can never become a paid one; Pro is
  sold in the app (1.1), which this doesn't affect.
- **Countries:** all.

## Release 1.0

### Release notes (500)
```
The first Android release of Twilyte: tonight’s twilight, how dark your sky gets, and what’s worth a look, with Sky View to name the stars.
```

### Before the first upload
- **A new personal developer account must run a closed test first:** at
  least 12 testers opted in for the last 14 days in a row, before Play
  allows the production release. Start the closed test as soon as a build
  is up.
- **The upload key:** in Android Studio, Build → Generate Signed App
  Bundle → create a new keystore. Keep the file and its passwords out of
  the repo and backed up: Play App Signing holds the app's own key, but
  every later upload must be signed with this one.
- **The build:** after pulling, `cd native && npm install && npm run sync`,
  then Android Studio (`npm run open:android`), Build → Generate Signed
  App Bundle → release. The bundle is `app-release.aab`. `versionCode` is
  1 and `versionName` "1.0" (`native/android/app/build.gradle`); each upload
  needs a higher `versionCode`.

### Checks on an Android phone, first
CI builds the app and runs it in an emulator, but these need a real phone:
- Sky View follows the phone, and points the right way (Sensor details).
- "Add sunset to calendar" opens the calendar's new-event screen, filled
  in; the Ephemeris's month export opens or shares the .ics; the month as
  CSV, and "Share tonight's sky", open the share sheet.
- Back closes Sky View, Settings and the place picker, goes back from Help
  and Privacy, and only then leaves.
- The status bar's clock is light on the dark header, and nothing is under
  the status or navigation bars.
- Location: one prompt, then the sky for where you are.
