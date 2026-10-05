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
Not shown for a first version.

## App Review information

### Sign-in required
No.

### Notes (4000)
```
Twilyte needs no account; every feature is available without one.

Location: asked for on first launch and used only on the device, to work out the sky and twilight times for where the user is. If declined, the app still works: tap the place name over the painted sky to search for a town or enter coordinates.

Motion: Sky View (Stars tab, "Open Sky View") reads the phone's orientation through Core Motion to draw the sky in the direction the phone points. It can be tried indoors.

Camera: optional and off by default. In Sky View, the "Camera" button shows the live camera behind the star labels so they can be lined up with the real sky. Nothing is recorded or sent anywhere.

Photos: add-only. On the Console tab, "Share tonight's sky" opens the share sheet with a picture the app draws; "Save Image" there saves it to Photos. The app never reads the photo library.

Network: the app fetches a weather forecast from Open-Meteo (api.open-meteo.com), the space station's orbit from CelesTrak (celestrak.org) and the geomagnetic forecast from NOAA (services.swpc.noaa.gov). It contacts no server of its own.

There are no in-app purchases in this version. The week planner, marked Pro on the website, is free for everyone in the app.
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

App Store Connect scales these down for the smaller sizes. They show the
app as the iPhone app draws it, with no website wording. To retake them:
`node store-assets/generate.js`, with a local server running.
