# Twilight — project memory

Single-file PWA for stargazing / celestial navigation, live at **twilyte.info**
(GitHub Pages, repo `bergeronK/twilight`). This file is read automatically at
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
  the app ("Starting Twilight…" hang, no console error). **Always run the
  hash-recompute step before committing** (see Build workflow below).
- **Design tokens**: all color/type driven by `:root` CSS custom properties
  + a `C` object that mirrors them for JS. Two independent color systems:
  - `--bg`, `--surface`, `--accent`, etc. — warm near-black, used by panels,
    cards, buttons. Intentionally warm ("candle-lit instrument").
  - `PAGE_BG` (a JS constant, not a CSS var) — the page backdrop wash, a
    cool navy-to-blue-black radial gradient, deliberately independent of the
    warm tokens so panels stay warm while the page's negative space reads
    as night sky. Shared across all three tabs.
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
- **prefStore**: external store (`useSyncExternalStore` pattern) holding
  `h24`, `bortle`/`bortleMode` (auto|manual), `pro`. Persisted to
  `localStorage` under `tw_*` keys.
- **Service worker** (`sw.js`): network-first navigations, stale-while-revalidate
  assets. `CACHE` version string must be bumped on every asset-affecting change.
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
- **Visit counter** — the "N visits" total in the header. Two halves:
  - **Client, `pingVisitorCounter(show)` in `index.html`.** Pings the Worker
    at most once per `COUNTER_WINDOW_MS` (24h), tracked in `tw_counted_at`,
    and shows the cached `tw_count` in between. The window is enforced here
    because the Worker can only recognise a visitor by IP, and a phone's IP
    changes with its network. Three rules, each tested in
    `visitor-counter.test.js`: check `r.ok` before trusting the body (the
    Worker's errors are `{"count":0}` with status 500, and 0 passes a typeof
    check); write the window only on success; and **return immediately when
    `window.Capacitor` is present** — the counter is website-only.
  - **Worker, `worker/`** (`twilight-counter.ken-b39.workers.dev`),
    committed 2026-09-22 from the dashboard copy — before that it existed only
    in Cloudflare. Dedupes by a salted hash of `visitorKey(ip)` in KV with a
    **24h TTL** (1 year before 2026-09-22). `visitorKey` keeps IPv4 as is but
    reduces IPv6 to its /64, because OS privacy addresses rotate the second
    half (often daily) and made one visitor look new at every rotation. The salt is the `IP_SALT` Worker secret, never
    in the repo, because the repo is public and a salted IPv4 hash is only as
    private as its salt. **Merging does not deploy the Worker**; Pages serves
    only the static site. Deploy with `npx wrangler deploy` from `worker/`
    (needs `npx wrangler login` on the machine). First deployed from the repo
    2026-09-22 as version `0bba4ff8`; a GET from a previously counted IP
    returned `"new":false`, confirming the secret matches the old salt.
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
- **iOS heading axis.** CoreLocation defines heading as the bearing of the
  *top* of the device, which reverses as the phone tips past vertical — the
  old `alpha := 360 − heading` substitution was 180° wrong there, i.e. exactly
  when looking at the sky. The heading is compared against the top axis only
  while it is ≥ `NORTH_MIN_HORIZ` horizontal; otherwise the estimate is held,
  with the camera axis as a first guess if there is no estimate yet. **Which
  axis iOS actually reports when upright is an assumption, not verified on
  hardware.**
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

## Magnetic declination

Every azimuth the app computes is TRUE-referenced. Phone compasses are not,
and it differs by platform: iOS `webkitCompassHeading` is true north (the OS
applies declination itself), Android `deviceorientationabsolute` yaw is
MAGNETIC north and nothing corrects it. Uncorrected that is a fixed error of
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
Declination is added only when the heading is absolute *and* not iOS: a
relative heading has an arbitrary yaw origin with no north in it, so there is
nothing for declination to correct there.

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
  `viewQ` / `aimNow` / `aimAzC` / `view` / `basis` expressions.
- **`fusion.test.js`** — `fuseOrientation` against simulated devices with a
  known true pose: Android gyro+compass, compass-only, magnetometer jitter,
  iOS tipping past vertical, the representation switch at gamma = ±90.
- **`orient-lib.js`** — not a test; extracts the whole orientation pipeline
  in one piece for the three suites above.
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

## Testing without a real browser session

No local dev server is preconfigured. Working pattern: `python3 -m http.server
8137 --directory /path/to/repo` (detached via `setsid ... &`, since plain
backgrounding gets reaped), then drive it with Playwright
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
