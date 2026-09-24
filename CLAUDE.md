# Twilyte — project memory

Single-file PWA for stargazing / celestial navigation, live at **twilyte.info**
(GitHub Pages, repo `bergeronK/twilight`).

**The app is called Twilyte** (owner decision, 2026-09-22), matching the
domain; it was "Twilight" until then. The rule when touching copy: **Twilyte
is the product, twilight is the sky.** The wordmark, titles, metadata, native
app names, privacy policy and any sentence where the app speaks as itself say
Twilyte. Civil/nautical/astronomical twilight, "Twilight Ephemeris", "A
Twilight Almanac", "Twilight Times in <city>" (the search phrase the city
pages exist for) and every almanac fact are about the phenomenon and stay.
Internal names (`RealtimeTwilight`, `TwilightBands`, `twilight-times/`
paths, `tw_*` keys, the `twilight-counter` Worker, `sw.js`'s cache name)
were deliberately left alone: users never see them, and renaming URLs or
storage keys would break links and saved settings. The GitHub repo is still
`bergeronK/Twilight`; renaming it is the owner's call (GitHub redirects the
old URL, and `/privacy.html` links to it). This file is read automatically at
the start of every Claude Code session in this repo — keep it current so a
fresh session (or a Cowork session) never has to re-derive project state.

## What this app is

Three tabs, one `index.html`, no build step:
- **Console** — live sky dashboard for right now: sun/moon/planet positions,
  twilight countdowns, sextant window, the "Clear & Dark" observing score
  (tonight + hourly strip + 7-night Pro planner), a curiosities/almanac card.
- **Ephemeris** — twilight times for any date/place, solar altitude chart,
  iCal/CSV export, upcoming sky events.
- **Stars** — navigational stars up now, recommended 3-star fix, compass dial.

## Architecture

- **Single HTML file**, React 18 (production build) inlined, `React.createElement`
  only — no JSX, no bundler. Exactly **5 executable `<script>` blocks** (a 6th
  `<script type="application/ld+json">` is non-executable and not counted).
- **Strict CSP** via `<meta http-equiv>` with **SHA-256 hashes** of those 5
  scripts. Edit any inline script → hashes go stale → CSP silently blocks
  the app ("Starting Twilyte…" hang, no console error). **Always run the
  hash-recompute step before committing** (see Build workflow below).
- **Design tokens**: all color/type driven by `:root` CSS custom properties
  + a `C` object that mirrors them for JS. Two independent color systems:
  - `--bg`, `--surface`, `--accent`, etc. — warm near-black, used by panels,
    cards, buttons. Intentionally warm ("candle-lit instrument").
  - `PAGE_BG` (a JS constant, not a CSS var) — the page backdrop wash, a
    cool navy-to-blue-black radial gradient, deliberately independent of the
    warm tokens so panels stay warm while the page's negative space reads
    as night sky. Shared across all three tabs.
  - **Inter loads in two parts** (2026-09-24): `fonts/inter-latin.woff2`
    (141 KB; both axes and every OpenType feature, made by
    `scripts/subset-inter.sh` with fonttools) is preloaded and covers what
    the app writes; `fonts/inter-var.woff2` (352 KB) is a second face whose
    `unicode-range` is exactly Inter's other glyphs, so it's fetched only for
    e.g. a Cyrillic place name. Throttled phone profile (1.6 Mbps, 4× CPU):
    fonts and painting ready 7.0 s → 4.8 s, 1,092 → 888 KB. **Any new
    character outside the core range pulls the full font on every visit and
    looks no different**: `load.test.js` checks every character in
    `index.html`, `facts.json` and the constellation names (it caught the
    fullwidth ＋ of "Add to calendar"). The tab icon is `favicon-64.png`
    (5 KB), not the 79 KB `icon-512.png`.
  - Typography: Inter for everything functional (labels, numerals, UI, body);
    Cormorant Garamond reserved only for the wordmark and "voice" moments
    (verdict lines, almanac headings) — never for data or controls.
  - **Design rule**: bordered/filled containers are reserved for actionable
    controls (inputs, buttons, toggles). Read-only content is flat, separated
    by hairlines only. If you're tempted to put a box around informational
    text, don't.
  - **Voice rule** (owner decision, applied in the copy pass): warmer but
    still precise — full sentences rather than telegraphic fragments, plain
    words wherever a plain word exists, every number and claim unchanged.
    The app serves two audiences at once, and the rule that resolves it is:
    **the Navigator's vocabulary must not leak outward.** A sextant user
    needs `Hs`, `index error`, `on the arc`, so those field names stay — but
    each is glossed in plain language nearby, and terms like *limiting
    magnitude*, *Bortle*, *cut* and *marine horizon* do not belong on the
    Console, which is where a casual stargazer lands first. Reference
    sentence for the intended register: *"Dark skies and the Moon is down."*
- **Accessibility (2026-09-24)**: axe-core reports no violations on any tab
  or in Sky View (run it with Playwright and `bypassCSP: true`; axe is on
  npm). What that took, and what to keep:
  - `--ink-faint` is `#888174`, 4.6:1 on the lightest panel. `#7d766a` was
    4.3, under AA, despite its "AA-safe" comment.
  - Every input and select has an `aria-label`. The labels on screen are
    `div`s above the fields, which look like labels but aren't.
  - Landmarks: one `header`, one `main`, one `footer`. The tip and install
    banners are named regions, and the place name is the Console's `h1`.
  - The focus ring is `!important`: inline `outline: none` on some fields
    beat it.
  - Sky View is a named modal dialog. Focus goes to Back when it opens and
    returns when it closes, and Escape closes it. Its canvas is an `img`
    whose label says where it looks and what's in frame
    (`skyViewSummary`).
  - The Ephemeris chart is an `img` with the day in words (`daySummary`).
  - Segmented buttons carry `aria-pressed`.
- **prefStore**: external store (`useSyncExternalStore` pattern) holding
  `h24`, `bortle`/`bortleMode` (auto|manual), `pro`. Persisted to
  `localStorage` under `tw_*` keys.
- **Service worker** (`sw.js`): network-first navigations, stale-while-revalidate
  assets, **this site's own files only** (2026-09-24). It used to cache every
  GET, other sites' too, so each forecast shown was the one fetched the time
  before (stale-while-revalidate answers from the cache first), often hours
  old, and the visit count lagged. Offline, the Console falls back to its own
  saved forecast (`tw_wx_*`: `wxCacheUse` says 'fresh' under an hour, 'stale'
  up to a day, used only when a fetch fails, and the score's line says
  "forecast from 3 hours ago", `staleNote`). `CACHE` version string must be bumped on every asset-affecting change.
  Skips registration entirely when `window.Capacitor` is present (native shell
  bundles assets itself; nothing for a SW to cache there).
- **`native/`**: Capacitor 8 shell (iOS + Android), documented in
  `native/README.md`. `npm run sync` stages the web app into `native/www/`.
  RevenueCat IAP is fully wired in `index.html` (`RC_KEYS`, `rcPlugin()`,
  purchase/restore flow) but **inert until a public SDK key is set** — see
  "Pending" below.
- **`scripts/verify-build.js`**: CI build guard — asserts exactly 5 inline
  scripts, syntax-checks them, and asserts the CSP hashes match. Runs in
  `.github/workflows/build-guard.yml` on every push/PR.
- **Console horizon view (redesign direction A)** — the Console's first
  screen: a painted panorama of this location's sky now, the verdict over
  it, tonight as one ribbon, three facts. **The default since 2026-09-23**
  (before that it sat behind `?preview=horizon`; the flag is gone and the
  old `tw_preview_horizon` key is cleared on load). It replaced the old top's
  italic verdict line and its Moon and Planets-up figures, which it repeats;
  the location header, the "Sky tonight" score and "Faintest star visible"
  follow it, then everything else as before. The hero carries the verdict's
  `aria-live` status now. Nothing in the painting
  is invented — `skyColors(sunAlt)` gives the gradient, the stars drawn are
  those brighter than `live.mag` (the app's own faintest-visible estimate,
  Moon and light pollution included), and Moon, Sun and planets sit at their
  computed bearing and height. 200° panorama facing the equator
  (`heroFacing`), turning only to keep a risen Moon in frame; azimuth
  increases to the right, so facing south puts east on the left. Pure and
  tested: `nightSpan`, `nightPlan`, `moonNote`, `heroLabel`, `heroFacing`,
  `panoX`/`panoY`, `ribbonGradient`; `drawHorizonScene` paints. The night
  ribbon is one smooth gradient (each twilight colour at its band's middle,
  night flat from astronomical dusk to dawn), not a block per band. **The location is the
  painting's header** (2026-09-23): the place name and ▾, with date and time
  under it, sit over the top-left of the sky; tapping opens a panel right
  under the painting with coordinates, Use my location, Save, saved places
  and the city search (the old block of those below the painting is gone).
  `HorizonHero` takes them as `header` and `panel` props; `pickerOpen` is the
  panel's state, and a failed first geolocation still opens it. **Tabs sit
  in a bar along the bottom at ≤780 px** (2026-09-23): the same three buttons
  inside `<nav class="tw-tabs">`, which is `display:contents` on wide screens
  so they stay in the header there; `aria-current="page"` marks the active
  one, and `#root` gets bottom padding so the footer clears the bar. That
  also retired the ≤384 px rule that hid the wordmark (the tabs were what
  overflowed the header). **Reference below the fold** (2026-09-23,
  option B of three the owner was offered): after the week planner a
  "Details" heading groups the look-up material. The older sky panel's
  picture, "Right now" verdict, faintest-star figure and Moon line are gone
  (all repeated the horizon view and facts); what only it had stays, flat:
  the next-twilight countdown, Sun height, horizon visible, and the sextant
  window with its calendar button. Then "Above the horizon now", the twilight
  schedule, the band notes and the almanac, unchanged. Phase 2 is done. **Painting fixes
  from a phone screenshot (2026-09-23):** planets are drawn only once the
  Sun is 3° down (they were painted and labelled in a blue daytime sky);
  body labels keep clear of the place-name header (`o.reserve`, measured
  from the header's text with a DOM Range) by flipping sides or being left
  off. **No buildings on the horizon** (owner, twice): one soft ridge and
  treeline everywhere, smoothed so no neighbouring points step more than
  4 px; a city (Bortle 5+) shows after dark as a warm light dome over the
  horizon and lights on the ground. Rectangles of any size read as a bar
  chart. `horizon-scene.test.js` pins all of this with a recording canvas.
  **The painting moves (2026-09-23).** Three canvases: the still sky
  (`drawHorizonScene` with `part: 'sky'`, redrawn once a second as before),
  a moving layer (`drawSkyMotion`: stars brighter than `TWINKLE_MAG` 2.5
  twinkle, strongest low down, never over the painted Moon; meteors), and the
  ground (`part: 'ground'`, drawn `HERO_BLEED` px past each side) sliding up
  to 10 px as the phone tilts, from plain `deviceorientation` — the painting
  never asks iOS for motion access, so there it only moves once Sky View has.
  **Meteors come at real rates**: `meteorRate` is each shower's ZHR (nine
  IMO showers in `METEOR_SHOWERS`) times the sine of its radiant's height,
  plus 8 sporadics an hour, cut by 2.2 per magnitude of limiting magnitude
  below 6.5, nothing before the Sun is 12° down; `newMeteor` flies shower
  meteors straight out from their radiant. On an ordinary night that is one
  every ten minutes or more; at a Perseid peak about one a minute. Don't
  speed it up. One `requestAnimationFrame` loop at ~30 fps, asleep when the
  hero is off screen, the tab hidden, or nothing moves (daytime, no tilt).
  `prefers-reduced-motion` gets the one still canvas, drawn whole, exactly as
  before. `sky-motion.test.js` covers the rates, directions, twinkle and
  the layer split.
- **The Milky Way (2026-09-23)** — `milkyway.bin` (9.8 KB), a 1° whole-sky
  grid of its brightness (0..250, run-length coded), built by
  `scripts/generate-milky-way.js` from d3-celestial's `mw.json` (five nested
  isophotes) at the same pinned commit as the constellations; same BSD
  licence file, which now names it, and the footer credit says so. Loaded by
  `loadMilkyWay`; sampled by `milkyWayField(mw, cols, rows, dirAt, lat, lst)`
  through each view's inverse projection (`horizToEq`; the painting's
  panorama; `chartDir` for the chart; `screenDir` for Sky View), turned into a
  small image and drawn scaled up, which is what makes it a soft glow. **On
  the Console it is honest**: `milkyWayVisibility(live.mag)` — all of it at
  limiting magnitude 6.25+, none at 5.2 (Bortle 7, a big Moon, twilight) —
  and it dims toward the horizon. **On the chart and in Sky View it is
  always drawn, faintly**, as charts show it (they show every star too); not
  over Sky View's camera image. `milky-way.test.js` checks the data against
  the galaxy (brightest in Sagittarius, empty at the galactic poles, 95%+ of
  the glow within 20° of the plane) and each inverse against its projection.
- **The Moon's face and the stars' colours (2026-09-23).** `drawMoonDisc(g,
  x, y, r, illum, litLeft, angle, north)` draws the near side's maria
  (`MOON_MARIA`: IAU centres and sizes, Procellarum and Frigoris as patches,
  Tycho and Copernicus bright) foreshortened toward the limb, the lit side
  turned to the Sun (`angle`; `litLeft` is now a half turn, never a mirror,
  which would flip the face) and lunar north to `north`, so the Moon is the
  right way up for where it is: upright on the meridian from the north,
  upside down from the south, tipped at moonrise. Directions come from
  `skyBearing` (0 toward the zenith, 90 toward increasing azimuth) mapped
  into each view: the painting's own stretch, `bearingOnScreen` through the
  chart's and Sky View's projections. Sky View's Moon, a flat grey disc
  before, is now the same disc. **Star colours**: `stars.bin` gained a
  trailing `"CI"` section, B-V ×50 for every star and then for each of
  `NAV_STARS` in order (the catalogue entry each replaced), appended so the
  old reader still works; the generator reproduced the old file byte for
  byte first. `starColor(ci, mag)` maps B-V to Mitchell Charity's
  spectral-class colours and fades to white below about magnitude 4, where
  the eye sees none; `starGlow` gives stars of magnitude 1.5 and brighter a
  halo in their own colour. Applied on the painting (still and twinkling),
  the chart and Sky View. HYG gives Betelgeuse B-V 1.50, not the textbook
  1.85; it is still orange.
- **Ephemeris and Stars open like the Console (2026-09-23).** Stars leads
  with `SkyViewPreview`: Sky View itself, full-bleed, looking toward the
  equator 28° up (`previewFacing`, which is also where the overlay starts
  without sensors, via `SkyDome`'s `initialAz`), redrawn once a minute; the
  place, "Use my location" and an "Open Sky View" button sit over it, and
  the whole picture opens the overlay. It replaced the Star Finder title
  block and the launcher card. To share the drawing, Sky View's painter came
  out of `SkyDome`'s effect as `drawSkyView(g, w, h, o)`, with `keepClear`
  (body names left off under overlaid text), `clearTop`/`clearBottom` for
  constellation names, and `reticle: false`. Ephemeris: the place name is
  the button that opens the form (search, coordinates, date, UTC offset,
  DST), folded away by default (`formOpen`; open anyway when nothing valid
  is entered), so the chart follows the header straight away; "Twilight
  Ephemeris" is now the small eyebrow and the tagline is gone. The month
  export is its own section after the results (grid `order: 3`, full width),
  visible with the form closed. `sky-view-preview.test.js`.
- **Sky View's Find (2026-09-23).** A **Find** button in Sky View's top bar
  lists what's up now (`findList`): the Moon and planets (brightest first),
  named stars of magnitude 1.5 or brighter, and rank-1 constellations 10°+
  up at their label point, each with plain words for where
  (`whereWords`: "low in the south-east", "almost overhead"). **Never the
  Sun**: nobody should be steered into looking at it. Picking one sets the
  shared target (`onPick`, the same one a tap sets, and Aim Assist's). Then
  the bottom line says how to get there (`findGuide`: "Turn left 45° and
  tilt up 18°."; turn left out under 3° or when looking 80°+ up; "That's
  Orion, in the ring." within 4°, which buzzes once on Android and is said
  once to a screen reader), and off screen an arrow sits at the edge
  (`edgePoint`) with the name just inside. A constellation target is drawn
  in amber even with Lines off, named once, above the ring. The list is the
  top bar's last row (flex-basis 100%), so it sits under the buttons however
  they wrap. **`aimTarget` in StarFinder now resolves anything Sky View can
  pick** (`findTarget`: planets, catalogue stars, constellations). It used to
  know only the Sun, the Moon and the navigation stars, so tapping Jupiter
  left Aim Assist and Sky View's Align with nothing. That meant moving
  `skyBodies` and the constellation memos above it: a `useMemo` reading a
  later `const` throws on render. `find.test.js`.
- **Worth a look tonight (2026-09-23).** Under the horizon view's facts,
  `tonightHighlights(plan, lat, lon, bortle, fmt)` (pure, real astronomy,
  every 15 min across tonight's night span) lists up to four things worth
  going out for, most important first: a meteor shower at the rate you'd see
  from here (`meteorRate` with that hour's `skyLimit`; 20+ an hour leads,
  5-20 comes last), two of the Moon/planets/bright ecliptic stars
  (`HIGHLIGHT_STARS`) close together (Moon ≤5°, planets ≤4°, planet-star ≤3°,
  both 8°+ up with the Sun 8°+ down; brighter body named first), an outer
  planet at opposition (≥165° from the Sun), Mercury in twilight, the Milky
  Way's centre when `milkyWayVisibility` allows, new or full Moon, and
  otherwise the brightest planet up after dark. `skyLimit(sunAlt, moon,
  bortle)` is the Console's limiting-magnitude formula pulled out of `live`
  so the highlights use the same one. Flat list, hairlines only
  (`TonightHighlights`). `highlights.test.js` runs it on published nights:
  the 2026 Perseid peak, Venus–Jupiter on 9 June 2026, Saturn's 4 October
  2026 opposition, plus a year's sweep for order and length.
- **Share tonight's sky (2026-09-23).** A button under the highlights makes
  a 1080×1350 (4:5) picture: `drawShareCard` paints the Console's scene at
  half size scaled ×2 (so stars and labels keep phone proportions, the
  horizon about 60% down), the place and time over the sky, the hero label,
  verdict and subtitle under it (`wrapText`, two lines at most), the first
  highlight in amber, and "✦ twilyte.info". `shareSkyCard` waits for fonts,
  makes a PNG and uses `navigator.share({ files })` where the browser can
  share files (phones), otherwise downloads `twilyte-tonight.png`. Inside
  the native apps it goes through the same web share, untested on a device.
  `share-card.test.js`.
- **First-run welcome (2026-09-23).** On a first visit to the Console
  (no `tw_welcomed`, no `?tab=` deep link) `WelcomeSky` covers the screen
  with the same painting the hero draws, from the same scene, fading in as
  it loads and repainting when the location arrives, with one line
  (`welcomeLine`: "Finding your sky…", then "This is the sky over <place>
  right now.", "you" for a device location), a "Show me tonight" button and
  "Not here? Choose your place", which opens the place picker. Closing
  writes `tw_welcomed` and fades it onto the dashboard already laid out
  beneath. It is a portal into `<body>`: the tab content's fade-in makes a
  stacking context that kept a fixed overlay under the bottom tab bar
  whatever its z-index. Escape closes it. **The store screenshot generators
  set `tw_welcomed`**, or every shot would be the welcome. `welcome.test.js`.
- **Ephemeris: real time zones and the painted day (2026-09-22, #84).** The tab
  used to open on a hard-coded New York solstice (2026-06-21) with a hand-set
  "UTC-5 +DST", so anyone elsewhere — or anyone after a daylight-saving change —
  got wrong times until they noticed. It now opens on **today, at the Console's
  saved place (`tw_loc`), in that place's IANA zone**; `zoneOffsets(tz, Y, Mo,
  D)` gives the offset for the date shown (read at local noon; standard = the
  smaller of the January and July offsets, so both hemispheres work; never
  "std + 60" — Lord Howe's DST is 30 min). Typing coordinates, the offset, Auto
  or the DST toggle switches to manual (`tz = null`), carrying the current
  offset over so nothing jumps; "Use my location" uses the device's zone. A
  place/date bar with ‹ Today › (`shiftDate`) sits under the title; on a phone
  the form moves below the results (CSS `order`). The chart's flat bands are
  replaced by the day's actual sky (`daySkyStops` → an SVG gradient of
  `skyColors` along the day), stars where the Sun is well down, the Moon's
  track (`moonDayTrack`, parallax-corrected) and a "now" line. The CSV month
  export gives **each day its own offset** — it applied one to the whole month,
  so every day after a DST change was an hour out. **The altitude scale is fixed,
  -24° to 90°** (2026-09-23): it used to top out at the day's highest Sun
  + 4°, so every curve nearly touched the top and a 20° winter noon looked
  as high as a 70° summer one — the owner found it "exaggerated". Now 30°,
  60° and 90° are labelled, the painted sky stops at the horizon, and below
  it is dark ground with the twilight bands faintly tinted. The painted day uses
  skyColors' overhead colour (`s`), not the middle band (`m`), whose dusk
  pinks made a magenta stripe down the chart; a touch cancelled by a scroll
  now clears the readout (it stuck on iOS); the Moon label stays inside. Below 560 px the chart is drawn
  at its shown width, one viewBox unit per pixel, at 4:3 (it was 820×380
  scaled to ~340 px: 4 px labels; then nearly square, which made a correct
  48° noon look like a spike — the owner asked why the arch was so high);
  wide screens keep 820×380. City search at the top of the form uses the same
  `geocodePlaces` as the Console (Open-Meteo geocoder); a chosen place
  brings its own IANA zone, and if the date shown was today it moves to the
  new place's today (it can already be tomorrow there). It does not write
  `tw_loc` — the Console's saved place stays the Console's.
- **Ephemeris: golden and blue hours, moonrise and moonset (2026-09-24).**
  Under the times, two flat sections for the date shown:
  - **For photographers**, from `photoWindows(lat, lon, p)`. Golden hour is
    the Sun from 4° below to 6° up; blue hour is 6° to 4° below. The
    sub-lines say so, since definitions vary between sources.
  - **The Moon**, from `moonRiseSet(lat, lon, startMs)`: the Console's
    topocentric `moonAltSeen` scanned over the local day, plus % lit.
    "No moonrise today" happens about once a month, which is real, not a
    bug.
  - The CSV export gains six columns, and iCal a "photography" mode.
  - `computeDay` is untouched, so `twilight-calc.js` and the city pages
    need no port. `ephemeris-extras.test.js`.
- **Star Finder sky chart** — the whole sky on one disc at the top of the
  Stars tab, replacing the 184 px, 57-dot compass dial. Stereographic
  (`chartXY`), because an equidistant disc squashes constellations near the
  horizon into unrecognisable arcs. **North up, EAST ON THE LEFT** — the
  convention for a chart held up against the sky, and the mirror of the old
  dial, which was a plan view; cardinal letters on the rim keep it
  unambiguous, and `star-chart.test.js` pins the handedness. Draws the full
  `stars.bin` catalogue, constellation lines, planets, the Moon at its phase
  with the lit limb turned toward the Sun (`drawMoonDisc` gained an angle for
  this), Polaris, and the recommended three-star fix as rings joined by a
  dashed triangle so the cut can be judged by shape. The catalogue and lines
  now load when the Stars tab opens rather than when Sky View does. Recomputed
  once a minute (`minuteKey`): ~2,500 positions is too much for the tab's 30 s
  tick.
- **Visit counter** — the "N visits" total in the header. Two halves:
  - **Client, `pingVisitorCounter(show)` in `index.html`.** Pings the Worker
    at most once per `COUNTER_WINDOW_MS` (24h), tracked in `tw_counted_at`,
    and shows the cached `tw_count` in between. The window is enforced here
    because the Worker can only recognise a visitor by IP, and a phone's IP
    changes with its network. Four rules, each tested in
    `visitor-counter.test.js`: check `r.ok` before trusting the body (the
    Worker's errors are `{"count":0}` with status 500, and 0 passes a typeof
    check); write the window only on success; **return immediately when
    `window.Capacitor` is present** — the counter is website-only; and
    **return unless `location.hostname` is `twilyte.info`**, because a page on
    localhost or a preview host still reaches the live Worker (CORS only
    blocks reading the reply) and would count a developer as a visit.
  - **Worker, `worker/`** (`twilight-counter.ken-b39.workers.dev`),
    committed 2026-09-22 from the dashboard copy — before that it existed only
    in Cloudflare. Dedupes by a salted hash of `visitorKey(ip)` in KV with a
    **24h TTL** (1 year before 2026-09-22). `visitorKey` keeps IPv4 as is but
    reduces IPv6 to its /64, because OS privacy addresses rotate the second
    half (often daily) and made one visitor look new at every rotation.
    (Since 2026-09-22. IPv4 keys didn't change; each IPv6 visitor was counted
    once more that day because their key did.) The salt is the `IP_SALT`
    Worker secret, never in the repo, because the repo is public and a salted
    IPv4 hash is only as private as its salt. **Merging does not deploy the
    Worker**; Pages serves only the static site. Deploy with `npx wrangler
    deploy` from `worker/` on `main`, so what runs matches the repo (needs
    `npx wrangler login` on the machine). First deployed from the repo
    2026-09-22 (`0bba4ff8`); live as of this writing: `2017aee9`, the /64
    change. `npx wrangler deployments list` shows what is actually live.
  - **Checking the live Worker can inflate the count — every GET is a
    potential visit.** Verify a deploy with `curl -4` from a machine whose
    IPv4 address was already counted: expect `"new":false` and an unchanged
    total, which also proves the salt is right (a wrong salt means a different
    hash, so `"new":true`). Don't use a plain `curl`: a dual-stack machine may
    go out over a temporary IPv6 address the Worker has never seen, and count.
    That happened once, 435 -> 436. To see which address you are using, ask
    `https://www.cloudflare.com/cdn-cgi/trace` (`ip=` line), never the
    counter. One live machine can't exercise the /64 logic anyway (it needs
    two addresses in one prefix); `worker.test.js` covers that.
  - **The total counts visits, not people.** With both windows at 24h, one
    browser visiting on five different days adds five, so the header says
    "visits". Within 24h it's one per browser; a phone and a laptop are two.
  - **Three documents depend on this code staying as it is:**
    `/privacy.html` (says the hash is kept 24h, and that the apps never
    contact the counter), `docs/app-store-privacy-answers.md` (answers "not
    collected" for Usage Data / App activity *because of* the Capacitor
    guard) and `worker/README.md`. Change the TTL, the guard, or what is
    sent, and update all three in the same PR.
  - **Why the Capacitor guard exists** (reasoned from the code, not seen on a
    device): the apps' origin isn't on the Worker's CORS allow-list, so the
    count could never display there — but a plain GET needs no preflight, so
    every launch still reached the Worker and was counted. That is data
    collected for nothing, which both store forms would have had to declare.
- **The Twilight Almanac (2026-09-23)** — the Console's "Tell me a twilight
  fact" card deals from `facts.json` (336 facts, `{id, tag, title, body}`),
  fetched on the first tap by `loadFacts()` and precached by `sw.js` and
  bundled by `native/sync-web.js`. It was an inline `FACTS` array of 111;
  the owner asked to triple it and cut repeats. 44 of the original 111 were
  corrected or replaced in the same pass (wrong figures, muddled claims,
  three near-duplicates). **ids are slugs of the titles and must stay
  stable**: `drawFact(ids, deck, rand)` (pure, tested in `facts.test.js`)
  keeps a deck in `tw_fact_deck` of what this reader has seen, so nothing
  repeats until all 336 have come up, across visits; a new fact is simply
  unseen, a removed one forgotten, and a round never starts with the fact
  that ended the last. Renaming an id makes that fact unseen again, which is
  harmless but avoidable. Keep facts accurate and plain (the voice rule), use
  curly quotes (the test rejects straight ones), and check for an existing
  fact on the same topic before adding one.
- **`twilight-times/`**: static SEO landing pages, one per city (e.g.
  `new-york-ny.html`), generated by `scripts/generate-city-pages.js` from a
  curated `CITIES` list in that script. Each page has its own standalone CSP
  (`script-src 'self'`, no inline scripts — separate from index.html's
  hash-gated CSP, so editing these never touches the 5-script hash system)
  and loads the shared `twilight-times/twilight-calc.js`, a hand-written
  vanilla-JS port of index.html's `computeDay`/`solarParams`/`eventUTC`/
  `fmtLocal`/`tzOffset` (Ephemeris tab's NOAA solar-position algorithm).
  Times are computed **client-side at view time**, not baked in at generate
  time, so pages never go stale — no rebuild schedule needed. If those
  functions ever change in `index.html`, port the change to
  `twilight-calc.js` too (verified once by cross-checking against the
  Ephemeris tab directly — see git history for the check). Re-run the
  generator after editing the `CITIES` list; it rewrites all pages, the
  `twilight-times/index.html` hub, and appends/updates the corresponding
  `sitemap.xml` entries (idempotent — safe to re-run any time).
  Deliberately **not** added to `sw.js`'s precache list — these are
  low-traffic content pages, not core app shell, so normal network-first
  navigation is sufficient.

## Sky View orientation pipeline

Orientation is a **quaternion** from the moment an event arrives. Never
smooth, combine or reason about alpha/beta/gamma directly: at beta = 90 only
alpha + gamma is defined, and as the phone rolls past gamma = ±90 the browser
switches representation, (a, b, g) → (a+180, 180−b, g−180), so two readings
0.2° apart physically differ by 180 in two angles. Filtering those one at a
time lands the view 180° away (measured; see `fusion.test.js`).

Flow, all in `index.html`:

```
event --quatFromEuler--> sample --fuseOrientation--> state --fusedView--> orient.q
orient.q --correctView(headingCorr)--> viewQ --> aimOf / screenUpAz  (Aim Assist)
                                           \--> viewBasis --> toScreen   (Sky View)
```

- **Fusion is a complementary filter.** The smooth gyro-based *relative*
  stream (Android plain `deviceorientation`; iOS alpha) drives the view. The
  noisy *north* source (Android `deviceorientationabsolute`; iOS
  `webkitCompassHeading`) only estimates one slow yaw offset (`NORTH_SMOOTH`).
  A device with no relative stream falls back to the absolute one directly.
  **This inverts the pre-quaternion handler**, which discarded Android's
  relative stream once the absolute one appeared.
- **iOS heading axis — SETTLED ON HARDWARE 2026-09-22.**
  `webkitCompassHeading` is the bearing of the **camera / back of the phone**,
  not of its top. Two Sensor details readouts from an iPhone aimed at the
  Moon (in `fusion.test.js` as `IPHONE`) decide it: read as the camera the
  view lands 5° and 19° from the Moon's true bearing — ordinary magnetometer
  error — read as the top it lands 180° and 158° away. The app had assumed
  the top, so `yawFromHeading` captured an offset while the phone lay flat
  and then drew the sky *behind the observer* when it was raised; Aim Assist
  reported "aimed at az 331" while the phone pointed at az 149, tilt correct
  the whole time. Now: the heading is trusted whenever the camera axis is at
  least `NORTH_MIN_HORIZ` from vertical — which is exactly when aiming — and
  ignored with the phone flat, where the camera points at the ground and its
  bearing means nothing. **The lesson is the one this file already carried:
  every synthetic test agreed with the assumption because they all built
  their heading out of it.** Two of them literally constructed the heading
  from the top axis; they were rewritten, not patched.
- **iOS heading reference — MAGNETIC north since build v109 (2026-09-24).**
  A fourth reading (v107, 42.09, -72.62: camera on the Moon at true az
  152.7, alt 31; `webkitCompassHeading` 168, "way off to the left") settled
  it by weight of evidence. Heading minus the Moon's true bearing, over all
  four: +4.8, +18.5, +5, +15.3. Every one errs the same way, mean +10.9,
  about the local declination (13.3° W); read as magnetic they scatter
  around −2.4. So iOS headings are now `trueNorth: false` and declination
  is applied, as on Android. `fusion.test.js` pins the four readings and
  that comparison, and `heading-reference.test.js` checks this reading end
  to end (corrected to within 4° of the Moon). The note below is kept for
  the history; its conclusion was reversed with more data.
  **Align was also undiscoverable**: its row only appeared once a target was
  picked, and nothing said so. Now, with sensors live and nothing picked,
  Sky View's bottom offers **Align on the Moon** when it's up (picks it),
  otherwise "Tap a bright star or planet you can see, then Align."
- **The iPhone app reads CoreMotion (2026-09-24, v111; unbuilt).** In the
  Capacitor app, Sky View's orientation comes from CoreMotion's fused
  attitude in the true-north frame, the source native sky apps use, via
  `TwilyteMotionPlugin` in `native/ios/App/App/AppDelegate.swift` (JS
  `TwilyteMotion`; registered by `TwilyteBridgeViewController`, which the
  storyboard now names). `nativeMotion()` finds it (iOS only); the effect
  then skips the browser's events and feeds `{kind:'abs'}` samples through
  the same `publish` step. `iosAttitudeToEnu(r, g, dir)` converts the
  matrix and **uses gravity to decide which way round it goes** rather than
  trusting the docs (a wrong guess mirrors every bearing). One band of
  compass directions can't be told apart by gravity, so the decision waits
  until the phone turns out of it and is then kept. Sensor details shows
  "iOS CoreMotion" and the frame. **Never built or run on a device**: no
  Mac here. `native-motion.test.js` (W3C matrix written out independently,
  CoreMotion simulated both ways, a physical "camera east" pose, Swift and
  JS names in step) and `native/README.md` for the device check.
- **(Superseded) iOS heading reference — kept as TRUE north (2026-09-23, build v100).**
  A third iPhone reading (42.11, -72.54, declination 13.3° W; Moon at az 120,
  alt 12; `webkitCompassHeading` 125) drew the Moon 6° left of the real one.
  Treating iOS as magnetic and applying declination would make it 7° out the
  other way, and the confirmed earlier reading 8.5° out, so the true-north
  assumption stays; the residual 5-6° is ordinary phone-compass error.
  The fix is the user's Align, which Sky View now carries itself (bottom
  row once a body is picked: "Put the real one in the ring, then Align",
  plus Reset), wired to the same `alignHere` as Aim Assist. Sensor details
  also shows iOS's `webkitCompassAccuracy`. The reading is in
  `fusion.test.js` as the third `IPHONE` sample.
- **One corrected rotation.** `viewQ` is computed once in `StarFinder` and
  passed to `SkyDome` as a prop; both Aim Assist and Sky View read that one
  object, so they cannot disagree (the v1.3 bug class).
- **What the tests can and cannot prove.** `orientation.test.js` separates
  *self-consistency* tests (hold by construction — they cannot see a mirrored
  or transposed convention) from *correspondence* tests (the W3C matrix
  written out independently, plus physical postures described in words). The
  latter pin the app to the spec, not to what a given browser sends. A
  pre-quaternion suite that was entirely self-consistency passed while the
  feature was "way off all around" on a real phone. **Only a device reading
  settles convention questions** — Sensor details shows fusion mode, north
  offset and where the camera is computed to be aimed, for exactly that.

## The Moon: geocentric for the sextant, topocentric for everything else

`moonState` is **geocentric** — right for sight reduction, where `sightToHo`
applies the Moon's parallax to Ho. Everything that *draws* the Moon or times
its rising and setting uses `moonTopo(moonState(...))` (or `moonAltSeen` in
`scanCrossings`): the Moon as seen from the ground, lower by the parallax in
altitude — 0.83° at 25° up, about a full degree on the horizon, 1½–2
Moon-widths. Found 2026-09-22 when Sky View's Moon sat visibly high over the
camera image. Bearing is untouched. Moonrise/set shift by several minutes
(one field night: 03:15 → 03:09). **Never pass `moonTopo` to the sextant
path** — it would correct parallax twice; `moon-parallax.test.js` guards
both directions by reading the call sites in `StarFinder`.

## Magnetic declination

Every azimuth the app computes is TRUE-referenced. Phone compasses are not,
and on both platforms the heading is MAGNETIC north: Android's
`deviceorientationabsolute` yaw by its definition, iOS's `webkitCompassHeading`
by four field readings (see the pipeline section; it was assumed true north
until v109). Nothing in either platform corrects it. Uncorrected that is a fixed error of
the local declination — near zero in the eastern US, 15-20° in Alaska, the
Pacific Northwest and the Southern Ocean.

`magneticDeclination(lat, lon, date)` evaluates the **World Magnetic Model
2025** to degree 12 and returns `{ deg, stale }`, east positive. The
coefficients are NOAA's, bundled as a 1.1 KB string (`WMM_COF`) and parsed on
first use. **The model expires: WMM2025 is valid 2025.0–2030.0.** Past that
`stale` goes true, the date is clamped, and the diagnostics panel says so —
regenerate with `node scripts/generate-wmm.js path/to/WMM2025.COF` from the
new epoch's download. `declination.test.js` fails once the bundled model no
longer covers today, so this cannot pass unnoticed.

**One correction, applied once.** `headingCorr` (declination + the manual
"Align" nudge) is applied to the quaternion as a single world-yaw rotation
(`correctView`), producing `viewQ` — see the pipeline section above. Do not
reintroduce a separate correction inside `SkyDome`.
Declination is added only when the heading is absolute (Android's absolute
stream, or iOS's compass heading): a relative heading has an arbitrary yaw
origin with no north in it, so there is nothing for declination to correct
there.

## Build workflow (do this every time you edit `index.html`)

```
node scripts/update-csp-hashes.js   # rewrites script-src from the current scripts
node scripts/verify-build.js        # will fail if hashes are stale
```

Run the first whenever you touch any inline `<script>` content, then the
second to confirm. Both extract scripts identically (bare `<script>` blocks,
so the `ld+json` data block stays excluded) — if they ever disagreed about
what counts as an executable script, the guard would pass on a set of hashes
the browser rejects, which is the one outcome both exist to prevent.

Bump `BUILD` in `index.html` alongside `CACHE`: it is what a Sensor details
screenshot reports, and it sat at `v56` for weeks while the app moved on,
making every field report ambiguous about what was actually running.

Also bump `CACHE` in `sw.js` (and mirror any new/changed asset filename into
its `ASSETS` array and into `native/sync-web.js`'s file list) whenever a
cached asset changes.

## Git workflow — a landmine to know about

PRs #55 onward have landed as **merge commits**, not squashes — keep doing
that, especially for stacked PRs (a branch cut from another open PR's branch).
With a merge commit the stacked branch shares real history with `main` and
reduces to its own commits once the lower PR lands; with a squash it does not.

If a PR *is* ever squash-merged, the landmine below applies: **the branch's
own commit objects for already-merged work never match `main`'s squash
commit**, even though content is identical, so `git merge origin/main` shows
conflicts on files touched by the just-merged PR purely because git's
merge-base is stale.

**Fix, every time, before pushing new work**: `git fetch origin main && git
merge origin/main --no-edit`. If it conflicts, first establish which of two
cases you are in, per conflicted file:

```
git diff origin/main <branch-tip> -- <file>
```

- **Only `+` lines** (ignoring the CSP `script-src` line and `sw.js`
  `CACHE`, which always differ and are regenerated, not chosen): the branch
  is a strict superset of main. Resolve with `git checkout --ours <file>`.
- **Any `-` lines**: main has work the branch doesn't. **Never use
  `--ours` here** — it silently deletes that work, and nothing afterwards
  will flag it. Resolve each hunk by hand.

The second case is not hypothetical. On 2026-09-21 the long-lived dev branch
was a week behind main (PRs #59–#62, the Sky View orientation rewrite), and
the `--ours` recipe this section used to give unconditionally would have
thrown all of it away. It is most likely whenever a branch has sat idle while
other branches merged.

Either way: regenerate the CSP hashes (`node scripts/update-csp-hashes.js`),
set `CACHE` above main's value, run `node scripts/verify-build.js` and the
full `node --test scripts/test/*.test.js`, then confirm `git diff
origin/main HEAD` is *exactly* the new work, nothing more or less.

**Run merge-and-push chains with `set -eo pipefail`.** Piping each step
through `tail` for tidier output replaces its exit code with `tail`'s,
so a failed merge and a failed build guard both read as success and the
push still runs. That is how a push went out mid-conflict on 2026-09-21
(harmlessly, only because the half-finished merge was never committed).

## Deploy

**GitHub Pages deploys production (twilyte.info) from `main`**, switched on
2026-09-15 (it previously deployed from `claude/web-app-style-review-x4rrz4`,
so pushes went live before review). Production is now merge-gated: pushing a
branch publishes nothing; merging a PR does. Check with
`gh api repos/bergeronK/Twilight/pages --jq .source.branch`. A quick way to
confirm what is live: compare the 4th `sha256-` hash in twilyte.info's CSP
with the one in `origin/main:index.html`.

The Pages deploy job has intermittently failed on first attempt with a
generic "Deployment failed, try again later" (platform-side flake, not a
content problem) — re-running the full workflow (not just the failed job)
has fixed it every time.

## Math tests — `scripts/test/`

```
node --test scripts/test/*.test.js     # unquoted: the shell expands the glob
```

Runs in CI on every push and PR, alongside the build guard. Covers the three
things a syntax check cannot see:

- **`solar-parity.test.js`** — asserts `index.html` and
  `twilight-times/twilight-calc.js` produce *identical* twilight times across
  12 locations × 8 dates, including the polar no-event cases. This is the
  lockstep the Architecture section asks you to maintain by hand; it is now
  enforced rather than remembered.
- **`orientation.test.js`** — the quaternion geometry, split deliberately
  into *correspondence* tests (the W3C matrix written out independently;
  physical postures described in words) and *self-consistency* tests (aim
  lands at centre; nothing behind the phone is drawn; roll invariance). See
  the pipeline section for why the split matters. Also drives the shipped
  `viewQ` / `aimNow` / `aimAzC` / `view` / `basis` expressions, and runs
  the **Align** button's `alignHere` from source with exactly the names in
  scope. That handler read `aimAz`, which the quaternion rewrite removed, so
  every tap of Align threw and replaced the app with the error screen from
  2026-09-15 until a user pressed it in the field. **A button handler inside
  a component is code no test executes unless one is written to** — when a
  rewrite removes a variable, grep for it, and run handlers via `declSource`.
- **`fusion.test.js`** — `fuseOrientation` against simulated devices with a
  known true pose: Android gyro+compass, compass-only, magnetometer jitter,
  iOS tipping past vertical, the representation switch at gamma = ±90. Ends
  with `IPHONE`: two real readouts from a phone aimed at the Moon, the only
  hardware evidence for the heading axis — and a test that the discarded
  top-of-phone rule *is* ~180° out on that sample, so the mistake cannot
  quietly return.
- **`orient-lib.js`** — not a test; extracts the whole orientation pipeline
  in one piece for the three suites above.
- **`horizon.test.js`** — the Console horizon view. `nightPlan`'s edges with
  synthetic events (a night that never gets fully dark, a Moon up the whole
  dark stretch, two moonless gaps, no sunset at all), the words `moonNote`
  and `heroLabel` put on screen, the panorama mapping, and `NightRibbon` /
  `NightFacts` rendered with a stub React. One test runs the real astronomy
  for Boston on 2026-09-22 against the Ephemeris times — and note the trap it
  found: the app's *morning* figures on a date are that morning's, while
  tonight's sunrise is tomorrow's, about a minute later in late September.
- **`star-chart.test.js`** — Star Finder's chart. `chartXY`'s handedness and
  stereographic radii, and `drawSkyChart` driven against a **recording
  stand-in for the canvas context**: what it labels, that nothing below the
  horizon is drawn, that nothing lands outside the disc, that the fix stars
  are ringed and joined, and that the Moon's lit limb turns toward the Sun.
  The stub tracks `translate`/`save`/`restore`, or the Moon disc — drawn in
  its own frame — reads as painted at the corner. This is how to test a
  canvas painter here; no browser needed.
- **`ephemeris.test.js`** — `zoneOffsets` across both hemispheres, a
  changeover day each way, a half-hour zone and Lord Howe's 30-minute DST;
  `shiftDate` across month, year and leap boundaries; `daySkyStops`; the
  Moon track; and the month export's `monthRows` run from source across
  March's DST change, since the whole-month offset was the bug.
- **`moon-parallax.test.js`** — `moonTopo` against the standard relation
  sin p = sin HP · cos h (derived differently from its vector shift), the
  Moon's geocentric altitude at moonset against Meeus's h0 = 0.7275·HP −
  0.5667°, and a source-level guard that the sextant path stays geocentric
  while every display call site in `StarFinder` is corrected.
- **`planets.test.js`** — `planetAltAz` against dated events rather than
  against itself: at published oppositions (Saturn 2024-09-08 and 2025-09-21,
  Jupiter 2024-12-07 and 2026-01-10, Mars 2025-01-16) each planet must be
  opposite the Sun, and Venus beside it at the 2025-03-23 inferior
  conjunction. Until 2026-09-22 the orbital-element code subtracted the node
  twice (`v + w - O` with Schlyter's argument of perihelion) and every planet
  was tens of degrees off — Saturn ~114° along the ecliptic — on the Console,
  in Sky View and in the planet count, and no test compared it with the sky.
- **`sight-reduction.test.js`** — Hs→Ho corrections and, importantly, the
  v1.6 guards: below-horizon, near-zenith, weak-low and blunder-sized
  intercepts.
- **`declination.test.js`** — the WMM evaluation against NOAA's own published
  test vectors. The reference table is extracted from NOAA's file by script,
  never typed: a first pass at it got four of six values wrong by hand, and a
  wrong reference value is worse than no test.
- **`heading-reference.test.js`** — drives the real `orientHandler` with
  synthetic iOS / Android / spec events (the v1.5 lesson: name all three
  platform contracts), plus the publish throttle and the declination
  correction end to end.
- **`announcement.test.js`** — the spoken form of Aim Assist's guidance. Its
  failure mode is invisible to a sighted developer: the panel looks identical
  whether the announcement says "turn 20 degrees right" or "left".
- **`facts.test.js`** — `facts.json`'s shape (unique ids and titles, lengths,
  no straight quotes) and `drawFact` played over whole rounds with the deck
  stored as JSON between visits: no repeat within a round, never the same
  fact twice running, additions and removals, junk in storage.
- **`sky-motion.test.js`** — the moving painting: shower activity across
  the year boundary, `meteorRate` against ZHR × sin(radiant height) at the
  2026 Perseid peak, the limiting-magnitude cut, none by day or with the
  radiant down, shower meteors flying out from the radiant, twinkle
  strongest low, no star drawn over the Moon, and sky + ground layers
  together drawing exactly what the still picture draws.
- **`milky-way.test.js`** — `milkyway.bin` against the galaxy (Sagittarius
  brightest, galactic poles empty, glow near the plane, Cygnus in and
  Orion's belt out), `horizToEq` against `starHcZn`, `chartDir` and
  `screenDir` against their projections, the visibility thresholds, and
  that the painting draws the band under the stars and not in a bright sky.
- **`moon-and-colours.test.js`** — the Moon's north up on the meridian from
  the north, down from the south, tipped left rising in the south-east;
  `drawMoonDisc`'s rotations (Sun, then north, then back); maria where they
  are (Crisium east, Imbrium north-west, Tycho south); `bearingOnScreen` at
  the chart's horizon; the real `stars.bin` colours (Betelgeuse and Antares
  orange, Rigel blue-white, Sirius white, 99%+ of stars coloured); faint
  stars white; halos only on the brightest.
- **`sky-view-preview.test.js`** — `drawSkyView` with the preview's
  `keepClear` (names under the overlaid text left off, stars still drawn)
  and `reticle: false`, and a source check that `SkyDome` and
  `SkyViewPreview` both draw through it and start facing the same way.
- **`highlights.test.js`** — `tonightHighlights` on real nights: the
  Perseid peak leads (40-100 an hour, radiant north-east, no Moon), thinner
  and without the Milky Way from a city, Venus and Jupiter ~2° apart on
  2026-06-09 named brighter first, Saturn at its best at opposition and not
  three months on, nothing when the Sun never sets, ≤4 items in rank order
  across a year of nights, and the list rendered with a stub React.
- **`find.test.js`** — Sky View's Find: `whereWords`, `findList` (only
  what's up, never the Sun, the order), `findGuide` against physical
  postures (facing south, west is right; across north the short way; near
  the zenith only tilt), the edge arrow agreeing with the words across the
  whole sky (computed separately: azimuth arithmetic vs the projection),
  `edgePoint`, a picked constellation drawn amber and named once, and at
  source level that `aimTarget` resolves Sky View's picks and is declared
  after what it reads.
- **`ephemeris-extras.test.js`** — golden and blue hours against geometry
  that doesn't depend on the code: 40 and 8 minutes at the equator on an
  equinox, longer at a slant; windows that can't happen far north in
  midsummer and midwinter. Moonrise and moonset against the 26 Sep 2026
  full Moon (rises with sunset, sets with sunrise), the Moon's height at the
  minute given, the next day's later rise, and a month with a moonless day.
  The CSV and the photography iCal are run from source.
- **`accessibility.test.js`** — `--ink-faint` against every surface
  token by the WCAG formula, every input/select named (a source scan, so a
  screen no one visits is covered too), the landmarks and Console `h1`, the
  `!important` focus ring, Sky View's dialog wiring, and the words of
  `skyViewSummary` and `daySummary`.
- **`load.test.js`** — first load and offline: the two Inter faces (core
  = `subset-inter.sh`'s range, no overlap, same in the city pages,
  preloaded, the core precached not the full font), no shipped character in
  the full font's range, the small tab icon, `sw.js` run against a fake scope
  leaving other origins to the network, `wxCacheUse`/`staleNote`, and the
  Console's offline fallback at source level.
- **`share-card.test.js`** — the share picture carries place, time,
  label, verdict, highlight and address; the painting is drawn scaled;
  long names and verdicts wrap inside the margins and clear the address;
  no highlight line without one; `wrapText` never splits a word.
- **`welcome.test.js`** — `welcomeLine`'s words, and at source level the
  "once" wiring (flag written on close, deep links skip it, "Not here?"
  opens the picker), the portal, and both store generators setting the flag.
- **`console-copy.test.js`** — `tonightGlance()`'s branch order and
  thresholds, plus the two countdown formatters. Every branch returns a
  sentence that reads fine even when it is the wrong one for the sky outside.
- **`components.test.js`** — smoke tests for extracted presentational
  components. **This is how to verify a component extraction here.** There is
  no render harness and CI has no browser, but a React function component is
  just a function returning `createElement` output, so calling it with a
  stubbed React executes every line and a lost closure variable surfaces as a
  ReferenceError. Only works on hook-free components — which is a reason to
  prefer extracting hook-free markup, and why the remaining large components
  are still large.
- **`constellations.test.js`** — Sky View's constellation lines. Runs the
  app's own `loadConstellationLines` on the real `constellations.bin` and
  checks the lines against the stars Sky View draws (NAV_STARS plus
  `stars.bin` via the app's `loadStarCatalog`): at least 95% of vertices within
  1′ of a drawn star (97.1% when written), and named figures through the right
  stars. A decoder with the wrong RA scale still returns 88 tidy
  constellations, just across the wrong stars, which is why it checks against
  the stars rather than the file's own header. Plus `constellationSegments`:
  end gaps, gap capping, behind-camera drops, below-horizon, zero length.
- **`worker.test.js`** — the counter Worker itself. Evaluates
  `worker/src/index.js` as text (CI's Node 20 can't import an ES-module
  `.js`) and drives `fetch` against an in-memory KV: `visitorKey`'s IPv6
  /64 reduction in every written form, IPv4 keys unchanged from the old
  scheme, 24h TTL, and the missing-salt refusal.
- **`visitor-counter.test.js`** — `pingVisitorCounter` with the clock,
  storage, network and `window` injected: once per 24h, the cached total
  inside the window, a 500 `{"count":0}` ignored, network failure, storage
  unavailable, and no request at all inside Capacitor. The store privacy
  answers rely on that last one.

**`extract.js` is the thing to understand before adding tests.** There is no
module to import — `index.html` is one file with no build step and ends by
mounting React into `document`. So `extract()` pulls named declarations out
of the app's `<script>` block by name and evaluates them in isolation, and
`declSource()` returns a declaration's raw text so a test can wrap an
expression that lives *inside* a component and exercise the shipped code.
That second one is what makes the Sky View test real: the 05a3a16 bug was not
inside any pure function, it was two call sites disagreeing about whether the
manual heading correction had been applied, and a test that restates that
composition cannot see it. The extractor throws on a missing or ambiguous
name, so a rename fails loudly instead of silently testing nothing.

**Verify a new test by breaking the code it covers.** Every test here was
checked against a deliberate mutation. Two of them passed a first draft that
looked thorough and caught nothing — the Sky View test because it fed one
consistent heading to both sides, and the refraction-clamp test because its
sample points all happened to miss the pole (Bennett's formula reaches ~337°
of bogus correction near h = -4.36, not at the -4.4 singularity). A green
test is not evidence until you have seen it go red.

## Running the app locally

**In the Claude desktop app** (the owner's Windows machine) the preview
server is committed: `.claude/launch.json` defines `twilight-static`, which
serves the repo root with `python -m http.server 8137 --bind 127.0.0.1`.
Start it by name with the Browser pane's preview tools, not from a shell, so
the app can track and stop it. A static server is all the app needs, since
there is no build step, and binding to loopback keeps it off the local
network. Nothing there is counted as a visit: `pingVisitorCounter` returns
unless the hostname is `twilyte.info`.

**In a Linux sandbox** (where earlier sessions ran) nothing is preconfigured.
Working pattern: `python3 -m http.server 8137 --directory /path/to/repo`
(detached via `setsid ... &`, since plain backgrounding gets reaped), then
drive it with Playwright
(`/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). The sandbox's network
policy blocks `api.open-meteo.com` and the visitor-counter Worker directly —
use Playwright route interception to mock the forecast API response when you
need to test anything forecast-dependent (clear-and-dark score, week
planner, screenshots). `page.clock.install()` + `context.setGeolocation()`
are the reliable way to get a reproducible "tonight" state for screenshots.

## Status as of this writing

**Shipped & merged to `main`:** perf/CI/PWA polish (Tier 1/2), Clear & Dark
score v1/v1.1/Pro week planner, auto-Bortle-from-location (bundled
SimpleMaps city dataset, no live API), onboarding/copy fixes, Capacitor
native shell v1 (iOS+Android, geolocation, icons/splash), RevenueCat IAP
wiring (inert without a key), full visual restyle ("field instrument" design
system) across all three tabs.

**Shipped since (all merged to `main`):** brand-asset refresh (install
screenshots + og-image for the new look), page-background unification (all
three tabs now share one navy-to-blue-black wash), `/privacy.html` (public
privacy policy, linked from the footer, listed in `sitemap.xml`),
`docs/app-store-privacy-answers.md` (exact App Store Connect "App Privacy" /
Play Console "Data safety" / age-rating / export-compliance answers, ready
to copy in when the owner reaches those forms), Google Play store assets
(`store-assets/android/`), a from-scratch audit of the `native/android/`
Capacitor scaffolding (found sound), `twilight-times/` SEO city landing
pages (30 curated cities + hub index, see Architecture section above), and
a QA/polish pass that fixed a real header-overflow bug at 360-383px
viewport widths (see git history on `index.html` for details).

**Navigator v1–v1.6 (merged to `main` as #44–#54; the text below predates
that and is kept for its design detail):**
- **Navigator v1** (Sight Reduction Calculator + Aim Assist MVP), in the
  Stars tab. Free, covers stars/Sun/Moon sights, plus a compass-only "which
  way to turn" aim assist. Built per `docs/navigator-spec.md` — see that
  doc's top status note for exactly what shipped, what was deliberately
  left out (tilt/altitude guidance, full camera AR, sight persistence), and
  why. New math in `index.html`: `sunHcZn`, `dipCorr`, `refractionCorr`,
  `SUN_SD`/`moonSD`/`moonHP`/`moonParallaxCorr`, `sightToHo`, `intercept`,
  `solveFix`, `cutQuality`. `moonState()` now also returns `az` and `r`
  (additive — verified no existing caller broke). Verified numerically
  (not just visually): for a test sight with Hs set to exactly match the
  app's own computed Hc, the displayed intercept matched a hand-computed
  prediction of the correction alone, for all three body types — see git
  history for the verification scripts. The aim-assist's "unsupported
  browser" and "waiting for sensor" fallback states were tested directly;
  actual compass/orientation behavior on a real device was not (no sensors
  in this sandbox) — flagged as a known gap, same as the native-build
  limitations elsewhere in this doc.

- **Navigator v1.1 — Aim Assist upgrades.** Tilt guidance via a full
  orientation matrix (`orientationToAim`), landscape-aware flat-phone compass
  fallback (`screenUpHeading`), figure-8 calibration prompting, ±5° nudges and
  a persisted "Align to <body>" manual correction (`tw_aim_offset` in
  `prefStore`), plus the mobile-web essentials: Screen Wake Lock while aiming,
  `isSecureContext` check, and an in-app-browser hint on the unsupported path.
  The orientation math is verified three ways (hand-reasoned postures, an
  independently-built rotation matrix, and a roll-invariance sweep) — see
  `docs/navigator-spec.md`.
- **Navigator v1.2 — Sky View.** Full-screen `SkyDome` overlay: point the
  phone and the Sun, Moon, five planets and the 57 nav stars render where
  they really are, labelled, with horizon and cardinal marks. New math:
  `worldToScreenDir` + `skyProject` (verified to land the aim point within
  1e-12 px of screen centre across 1,600 random orientations × 4 screen
  angles). Drag-to-look fallback with no sensors — which is also what makes
  it testable in CI. Optional camera passthrough, off by default;
  `NSCameraUsageDescription` and Android `CAMERA` now declared.
- **Navigator v1.3 — Sky View polish.** Launcher promoted to the top of the
  Stars tab (was buried below the sight-reduction form). Tap any body to
  identify it — sets the Aim Assist target too. **Match to camera** FOV
  control (±3°, `tw_sky_fov`, default 63°): no web API reports a camera's
  field of view — verified directly, `getSettings`/`getCapabilities`/
  `getSupportedConstraints` have nothing FOV-related — so it must be matched
  by eye. With the heading offset, both registration axes are now
  user-correctable, which removes "needs a real device" from that gap.
- **Navigator v1.4 — real star catalogue.** `stars.bin` (11 KB, 1,575 stars
  to mag 5.0, 257 with proper names) generated by
  `scripts/generate-star-catalog.js` from the **HYG database**. Fetched on
  first Sky View open, exactly like `bortle-cities.bin`, so `index.html` and
  its 5-script CSP are untouched. **Licensing (owner decision):** HYG is
  CC BY-SA 4.0, so the derived `stars.bin` carries that licence too — see
  `stars.LICENSE.txt` beside it and the credit in the app footer. App code is
  unaffected; CC BY-SA permits commercial use, so Pro/IAP is fine. The
  generator reads `NAV_STARS` straight out of `index.html` and drops
  catalogue entries within 3′ of one, so nothing is drawn twice. Labels are
  curated (working set + named stars to mag 2.6); everything else is
  identifiable by tap. Regenerate: download the HYG CSV, then
  `node scripts/generate-star-catalog.js <csv>`.

- **Navigator v1.5 — Android heading fix (from a real-device report).** Aim
  Assist and Sky View never produced a heading on Android. Plain
  `deviceorientation` on Android Chrome is **relative** (`absolute: false`,
  arbitrary yaw origin); true north arrives on a **separate
  `deviceorientationabsolute` event**, which the code never listened for.
  Now listens to both, prefers absolute once seen, and *uses* a relative
  heading rather than discarding it — tilt is valid regardless, and the
  manual "Align" offset converts an arbitrary yaw origin into a correct
  bearing. **Testing lesson:** every synthetic test dispatched
  `{absolute:true}` on `deviceorientation`, the one combination Android never
  sends; the regression test now names all three platform contracts (iOS
  `webkitCompassHeading`, Android `deviceorientationabsolute`, spec
  `absolute:true`). Treat sensor code as unverified until a real device
  confirms it, no matter how green the synthetic tests are.
  **Confirmed working on a real Android device** — the first part of
  Navigator verified against actual hardware. Aim Assist also gained a
  permanent **"Sensor details"** panel (build number, event counts,
  events-carrying-angles, heading source, raw angles) which is what made the
  cause findable remotely; keep it. **Still unverified on hardware:** the
  turn/tilt direction signs, roll behaviour, landscape, and Sky View camera
  registration — the field-test list is at the end of the v1.5 section in
  `docs/navigator-spec.md`.

- **Navigator v1.6 — sight-reduction edge cases.** The guards
  `docs/navigator-spec.md` specified for Feature A were never implemented in
  v1. A sight of a body below the horizon produced a confident intercept
  (measured: Canopus at Hc −79° gave 5,981 nm) and was silently averaged into
  the fix. Now: below-horizon and near-zenith sights are named *and excluded*
  from the fix (panel says "Using 2 of 3 sights"), low sights are warned as
  weak, `sightToHo` clamps Bennett's refraction argument at −0.5°, and an
  intercept over 60 nm is flagged as a probable blunder. Worth remembering
  that a shipped feature can match its spec's *happy path* completely and
  still have skipped the spec's edge-case section.

- **Sky View constellation lines (2026-09-22).** Stick figures for all 88 IAU
  constellations, drawn faint and cool under the stars, with a **Lines**
  toggle (`tw_sky_lines` in `prefStore`, on by default). Data:
  `constellations.bin` (4.2 KB, 150 polylines, 893 vertices), generated by
  `scripts/generate-constellation-lines.js` from **d3-celestial**'s
  `constellations.lines.json` at a pinned commit, fetched on first Sky View
  open like `stars.bin`. **Licence: BSD 3-Clause** (Olaf Frohn) — permits
  commercial use, requires the notice to travel with the data, so
  `constellations.LICENSE.txt` sits beside it, is bundled into the native
  apps by `native/sync-web.js`, and is linked from the footer credit. Unlike
  HYG's CC BY-SA, nothing carries over to the app. Drawing goes through
  `constellationSegments` (pure, tested): straight segments are exact because
  a pinhole projection maps great circles to straight lines; a segment with
  an end behind the camera is dropped, not clipped; ends are pulled back 4 px
  so lines stop short of stars. About 3% of vertices are stars fainter than
  `stars.bin`'s magnitude-5 cut (Mensa, Horologium, Sextans, ...), so every
  vertex also gets a faint dot, hidden under the real star where one exists.
  **Constellation names (2026-09-23):** `constellation-names.json` (2.6 KB,
  89 labels: Serpens twice, Caput and Cauda), `[id, name, rank, ra, dec]`,
  generated by `scripts/generate-constellation-names.js` from d3-celestial's
  `constellations.json` at the same pinned commit — same licence file, which
  now names both outputs. Loaded by `loadConstellationNames` next to the
  lines, drawn under the same **Lines** toggle in small spaced capitals the
  lines' colour. Placement is `constellationLabelSpots` (pure, tested): above
  3° only, on screen, clear of the overlay's buttons (72 px) and caption
  (76 px), and at least 90 px from a name already placed, prominent (rank 1)
  first; a name near a side is pulled in whole rather than clipped. Tests
  check the names against the *lines*, not the file itself: same 88 ids, and
  every label within 10° of its own figure (7.9° max measured, Puppis).

**Store and install screenshots regenerated with the Twilyte name
(2026-09-23)** — iOS (iPhone + iPad), Android phone + feature graphic, and
the PWA's `screenshot-narrow.png` / `screenshot-wide.png`, which
`store-assets/generate.js` now also writes (they had no generator before).
The Console shots were retaken when the horizon view became the default
(same day), and the phone shots again when the tabs moved to the bottom
(iPad and the wide PWA shot are over 780 px, so unchanged).

**Owner decisions made (don't re-ask):**
- **iOS device family: Universal** (iPhone + iPad). iPad screenshots and
  layout QA are done; see the backlog entry below.
- **`/privacy.html` Contact stays the GitHub repo link** — deliberately no
  personal email published.
- **GitHub Pages deploys from `main`** — switched 2026-09-15; see Deploy.
- **The header count is labelled "visits"**, and counts one per browser per
  24 hours (2026-09-22).
- **The Worker keeps the salted IP hash for 24 hours**, matching the browser
  window, chosen so the privacy policy can describe it plainly (2026-09-22).
- **The visit counter is website-only**; the native apps never contact it
  (2026-09-22).

**Blocked on the repo owner, not on engineering:**
- RevenueCat public SDK key (`appl_…`) → drop into `RC_KEYS.ios` in
  `index.html` to activate the purchase flow. Owner has an Apple Developer
  account as of this writing but has not yet created the App Store Connect
  app record, the IAP product, or the RevenueCat project.
- **Old 1-year visitor hashes.** Hashes the Worker wrote before 2026-09-22
  keep their 1-year expiry until they lapse or are deleted from the
  `TWILIGHT-VISITORS` namespace (delete the hash keys, never `__total__`).
  Until then `/privacy.html`'s "kept 24 hours" isn't true of those entries.
  Deleting stored data is the owner's call.
- Actual Xcode build/signing/TestFlight upload — needs a Mac; nothing to do
  here until the owner has one available.

**Backlog, not started, no blockers:**
- Alerts (clear-and-dark-tonight push notifications) — needs a backend
  decision (Cloudflare Worker + Cron Triggers is the natural fit given the
  existing visitor-counter Worker).
- ~~Denser star catalog for Sky View~~ — **done** (owner chose HYG). See the
  Sky View v1.4 entry above.
- App Store screenshots: **done for both iPhone and iPad**
  (`store-assets/ios/`, 1260×2736 and 2064×2752, regenerate via
  `node store-assets/generate.js`). Owner chose **Universal** (iPhone +
  iPad), so `TARGETED_DEVICE_FAMILY` stays `"1,2"`. iPad layout was reviewed
  at 13" portrait/landscape and 11" portrait — no overflow, no iPad-specific
  CSS needed. Each set includes a Sky View shot.
- Android store assets: **done** (`store-assets/android/`, feature graphic +
  3 phone screenshots, regen via `node store-assets/generate-android.js`).
  Android scaffolding under `native/android/` was audited this pass
  (`AndroidManifest.xml` permissions, launcher icons, Gradle plugin wiring)
  and found sound — no changes needed. **Cannot validate a real Gradle/APK
  build from this sandbox**: no Android SDK installed, and `dl.google.com`
  (the SDK repository) is blocked by the environment's network policy, same
  as `api.open-meteo.com` — mirrors the "iOS needs a Mac" constraint. A real
  build/signing/Play Console upload needs a machine with the Android SDK.

## Conventions established this session (follow unless told otherwise)

- One PR per logical change; merge-commit (not squash — see Git workflow);
  always `git fetch` + reconcile before pushing.
- **Commit before mutation testing.** Reverting a mutation with
  `git checkout -- index.html` restores the last *commit*, so uncommitted
  work goes with it. This destroyed a whole feature once.
- **Verify a new test by breaking the code it covers** (see Math tests).
- Commit messages and PR bodies are the durable record of *why* — write them
  as if this file didn't exist, since PR history outlives any one session.
- Screenshots/mockups before big visual changes; ship real Playwright
  screenshots of the actual app in PR descriptions, not descriptions of intent.
- Don't guess at colors/values when matching an existing look — sample actual
  rendered pixels (Playwright screenshot + PIL) to confirm before and after.
