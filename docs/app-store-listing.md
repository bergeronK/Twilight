# App Store listing — Twilyte 1.0 (iOS)

What to paste into App Store Connect for the first version. Owner
decisions (2026-10-02): **1.0 is free with everything unlocked** (no in-app
purchase until 1.1), primary category **Reference**. Each text block below
is exactly what goes in its field; `app-store-listing.test.js` holds every
one to Apple's length limit.

Privacy questionnaire, age rating and export compliance answers are in
[`app-store-privacy-answers.md`](app-store-privacy-answers.md). With no
purchase in 1.0, leave out its Purchases and Identifiers declarations, as
its "Before you submit" list says.

## App information

### Name (30)
```
Twilyte
```

### Subtitle (30)
```
Twilight times & tonight’s sky
```

### Primary category
Reference. A secondary category is optional; Education would fit.

### Copyright
```
2026 Ken Bergeron
```
(Use a company name instead if the developer account is a company's.)

## URLs

### Support URL
```
https://twilyte.info/support.html
```

### Marketing URL
```
https://twilyte.info
```

### Privacy Policy URL
```
https://twilyte.info/privacy.html
```

## Version 1.0

### Promotional text (170)
```
Tonight’s sky for where you are: when twilight ends, how dark it gets, and what’s worth a look. Point your phone up and Sky View names the stars.
```

### Description (4000)
```
Twilyte shows the twilight and the night sky for wherever you are, as it is right now.

THE SKY TONIGHT
Open the app to a painting of your own sky: the colours of the twilight at this minute, the stars you could actually see from your place, and the Moon and planets where they really are. Under it, tonight runs as one ribbon from sunset to sunrise, with the dark hours and the Moon marked.

TWILIGHT, STAGE BY STAGE
See when each stage of twilight begins and ends, today and any other day: civil, nautical and astronomical dusk and dawn, sunrise and sunset, golden hour and blue hour. A countdown says how long until the next one. Add tonight’s sunset or tomorrow’s sunrise to your calendar with a reminder.

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

### Keywords (100)
```
sunset,sunrise,golden hour,blue hour,stargazing,astronomy,star map,moon phase,constellation,dark sky
```

### What’s New
Not shown for a first version. If 1.0 is already out when the fixes below
ship, they go as **1.0.1** (never 1.1: that number is Pro's, from Build
100), with:
```
Calendar buttons and month exports now work in the app. Red light mode is properly red, to keep your night vision. Sky View and the painted sky use less battery. Offline at a dark site, Twilyte keeps a nearby forecast and lets you type in coordinates. Larger Text is followed, and VoiceOver reads the app more clearly.
```

### Build 2 (2026-10-21)
Build 1 was submitted on 2026-10-06, before the calendar buttons and
exports worked in the app (v162) and before the crash fix for an unknown
time zone (v163). **Never release build 1.** The Xcode project's
`CURRENT_PROJECT_VERSION` is 2 (kept under 100 while the app sells
nothing: `monetization.test.js`). In App Store Connect: if 1.0 is still
waiting for review, in review or pending release, remove build 1 from it,
attach build 2 and submit again (manual release); if 1.0 is already out,
make version 1.0.1 with build 2.

Under Pricing and Availability, untick **Mac** and **Apple Vision**
availability: there Sky View has no motion sensors and says so.

## App Review information

### Sign-in required
No.

### Notes (4000)
```
Thank you. The answers below are also in the Notes field of App Review Information.

1. SCREEN RECORDING
Attached: recorded on an iPhone running the latest iOS, with build 2. It starts at launch and shows the main flow. Twilyte has no account registration or login, no user-generated content and no paid content.

2. PURPOSE AND AUDIENCE
Twilyte is an astronomy reference app for people who watch the sky: casual stargazers, photographers planning golden and blue hour, campers and hikers, and sailors who practise celestial navigation. It answers three questions for wherever the user is: when does it get dark tonight, how dark does the sky get here, and what is worth looking at? On the device it works out sunrise, sunset and each stage of twilight, the Moon's phase and rise and set, the planets and stars, eclipses and meteor showers. It rates the local sky's darkness on the Bortle scale from NASA satellite measurements of light at night. Sky View uses the motion sensors to name the stars, planets and constellations the phone is pointed at.

3. HOW TO USE IT
No login; every feature is free. On first launch, allow location, or tap "Choose your place" and search for a town. Three tabs along the bottom:
- Console: the sky now as a painting, today's twilight times with a countdown, the sky's Bortle class, things worth a look tonight and the next seven nights. The red light button at the top keeps night vision.
- Ephemeris: twilight, Sun and Moon times for any date and place, a chart of the day, and calendar export.
- Stars: tap "Open Sky View" and point the phone at the sky (it also works indoors). Tap a star to name it; "Find" lists what is up and turns you toward it; "Time" moves the sky forward or back. "For navigators", at the foot of the tab, holds sight reduction and Aim Assist.
Permissions: Location while in use (the local sky and forecast); Core Motion (Sky View; no prompt); Camera, optional and off by default (Sky View's Camera button, nothing recorded); Photos add-only (Share, then Save Image); Calendar add-only ("Add to calendar").

4. EXTERNAL SERVICES
- Open-Meteo forecast API (cloud forecast) and geocoding API (place search): the coordinates or the search text are sent, with no identifier.
- CelesTrak (celestrak.org): the space station's orbit, from a fixed URL.
- NOAA Space Weather Prediction Center (services.swpc.noaa.gov): the geomagnetic forecast, from a fixed URL.
No authentication, payment, advertising, analytics or AI services, and no server of our own. All the astronomy is computed on the device.
Bundled data, credited in the app: the HYG star database (CC BY-SA 4.0); d3-celestial constellations, Milky Way and Messier objects (BSD 3-Clause); NASA Black Marble night lights, processed into light-pollution tiles; NOAA's World Magnetic Model 2025; the IAU's lunar place names; SimpleMaps World Cities (CC BY 4.0).

5. REGIONS
The app works the same in every region. Everything is worked out for the user's own location, polar day and night included. The app is in English.

6. REGULATION AND THIRD-PARTY MATERIAL
Twilyte is not in a regulated industry and uses no protected third-party material. The bundled data sets are published under open licences or by public agencies, credited in the app, and their licence files ship with it.

Support: support@twilyte.info
```

Since 2026-10-29 the Notes field holds the answers App Review asked this
new account for, as they asked, so later submissions carry them.

### App Review's request (2026-10-29)
Build 1 came back as **Guideline 2.1, Performance: App Completeness**, but
the message was a request, not a fault: the account has "a limited App
Review history", and App Review asked for a screen recording from a
physical device on the latest iOS, starting at launch, plus the purpose and
audience, how to reach the main features, the outside services, regional
differences, and any licences for regulated or protected material. They
asked for the answers both as a reply and in the Notes field. The text
above went in both, with the recording attached to the reply, when build 2
replaced build 1 on version 1.0.

What the recording showed, in order (about two minutes, the iPhone app at
v167, which is build 2's code): Twilyte opened from the Home Screen; the
Console scrolled through the painting, the twilight times and countdown,
the Bortle block, "Worth a look" and the week; the place search; the
Ephemeris's chart and times, and another date; Stars, Open Sky View, the
phone moved around, a star tapped, Find and its guide; Back; red light on
and off. A later submission may be asked for a new recording: the same
order still covers everything.

The Notes before 2026-10-29, kept for what they said about each
permission:
```text
Twilyte needs no account; every feature is available without one.

Location: asked for on first launch, to work out the sky and twilight times for where the user is; the coordinates are also sent, with no identifier, to Open-Meteo for the local weather forecast. If declined, the app still works: tap the place name over the painted sky to search for a town or enter coordinates.

Motion: Sky View (Stars tab, "Open Sky View") reads the phone's orientation through Core Motion to draw the sky in the direction the phone points. It can be tried indoors.

Camera: optional and off by default. In Sky View, the "Camera" button shows the live camera behind the star labels so they can be lined up with the real sky. Nothing is recorded or sent anywhere.

Photos: add-only. On the Console tab, "Share tonight's sky" opens the share sheet with a picture the app draws; "Save Image" there saves it to Photos. The app never reads the photo library.

Network: the app fetches a weather forecast from Open-Meteo (api.open-meteo.com), the space station's orbit from CelesTrak (celestrak.org) and the geomagnetic forecast from NOAA (services.swpc.noaa.gov). It contacts no server of its own.

There are no in-app purchases in this version; every feature is free.

Support: support@twilyte.info, or the Help page linked at the foot of every screen.
```

The space station's passes and the northern lights are left out of the
description until they're seen working in the app: both fetch from sites
(CelesTrak, NOAA) whose replies to the app haven't been checked yet. On the
iPhone, the Stars tab shows "The space station" when CelesTrak's answer got
through.

## Screenshots

Retaken for 1.0 on 2026-10-05, in `store-assets/ios/`, in the order to
upload them (Console, Stars, Ephemeris, Sky View):
- **6.5-inch iPhone**, 1284 × 2778: `iphone-6.5-01-console.png` to
  `iphone-6.5-04-skyview.png`. This is the iPhone slot App Store Connect
  showed (2026-10-05); it refused the 6.9-inch set.
- **6.9-inch iPhone**, 1260 × 2736: `iphone-6.9-01-console.png` to
  `iphone-6.9-04-skyview.png`, for the 6.9-inch slot where it's offered.
- **13-inch iPad**, 2064 × 2752: `ipad-13-01-console.png` to
  `ipad-13-04-skyview.png`.
- **12.9-inch iPad**, 2048 × 2732: `ipad-12.9-01-console.png` to
  `ipad-12.9-04-skyview.png`, for an iPad slot that asks for the older
  size.

App Store Connect scales these down for the smaller sizes. They show the
app as the iPhone app draws it, with no website wording. To retake them:
`node store-assets/generate.js`, with a local server running.
