# Navigator pack — scoping spec

**Status: v1 built and shipped** (both Feature A and the Feature B MVP,
live in the Stars tab). Owner decisions: **free** (not Pro-gated), **stars +
Sun + Moon** in scope, **Feature B (AR aim assist) included** as the
no-camera compass-arrow MVP — the full camera overlay remains out of scope
(needs real-device validation this sandbox can't do).

Implementation notes for future work on this:
- All math lives in `index.html` near `starHcZn`/`moonState`: `dipCorr`,
  `refractionCorr`, `SUN_SD`, `moonSD`, `moonHP`, `moonParallaxCorr`,
  `sightToHo`, `intercept`, `solveFix`, `cutQuality`, plus a new `sunHcZn`
  (the existing `sunAltitude` only returned altitude, not azimuth — needed
  for the Sun's intercept bearing).
- `moonState()` now also returns `az` and `r` (geocentric distance in Earth
  radii) — additive, no existing caller broke (all destructure `.alt`
  specifically).
- Verified numerically, not just visually: for a sight entered with
  Hs = Hc exactly (height=0, IE=0), the intercept should equal the
  corrections applied and nothing else. Confirmed this hand-computation
  matches the app's displayed Ho/intercept to within display rounding for
  all three body types (star: refraction only; Sun: refraction + SD;
  Moon: refraction + SD + parallax, the largest single correction, ~54' in
  the test case) — see git history for the exact verification script.
- Sight log (`sights` state) is in-memory only for v1 — not persisted to
  localStorage. A real observing session is short-lived enough that this
  is a reasonable v1 cut; add persistence later if it turns out people want
  to resume a fix across a reload.
- Aim assist ships **turn (compass heading) guidance only** — deliberately
  did not ship a tilt/altitude-matching calculation. The device `beta`
  (front-back tilt) convention depends on how the phone is held in actual
  use, which can't be verified without a real device, and shipping a
  plausibly-backwards tilt number would be worse than not having one. The
  target's altitude is shown as a plain number instead, for the user to
  check by eye. Revisit if real-device feedback says this is worth doing.

Turns the existing Star Finder tab from "here's where navigational stars are"
into a working celestial-navigation tool: take a real sextant sight, get a
fix. The scoping/rationale below is grounded in what `index.html` already
computed at the time this was written (checked directly against the source,
not assumed) — kept as the design record even though v1 is now built (see
the status note above for what changed since).

## What already exists to build on

- `NAV_STARS` (index.html:1445) — the 57 traditional navigational stars
  (RA/dec/magnitude), already in the app.
- `starHcZn()` (index.html:1468) — computes Hc (computed altitude) and Zn
  (true azimuth) for any star, given lat/lon/date. This is exactly half of
  sight reduction (the "where should it be" half); it's already correct and
  already used by Star Finder's star table and compass dial.
- `moonState()` (index.html:535) — computes a full geocentric lunar
  ephemeris including orbital distance `r` (in Earth radii, internal
  variable, currently not returned). That distance is exactly what's needed
  for the Moon's horizontal parallax correction (see below) — most of the
  hard work for supporting Moon sights is already done, it just isn't
  exposed yet.
- `sunAltitude()`, `planetAltAz()` — same pattern for Sun and planets.
- Star Finder's "recommended 3-star fix" logic (index.html:3777-3796) —
  already picks bright, well-spread stars for a strong position-line cut.
  The same spread-scoring approach is directly reusable for suggesting which
  stars to *shoot* before the user starts, not just which are up.
- The polar compass dial (index.html:3801-3821) — already renders az/alt on
  a 2D dial. A natural base to extend for aiming, see Feature B.

None of this is AR or sight-reduction yet — it's the read-only "what's up"
half. The gap is entirely on the *observation* side: turning a sextant
reading into a corrected position.

## Two features, deliberately split

They have very different risk profiles and should ship independently.

### Feature A — Sight Reduction Calculator (do this first)

Pure math, no device sensors, no camera, no new native permissions. Works
identically on web/PWA and native. This is the low-risk, high-differentiation
piece — nothing like it exists elsewhere in a free stargazing app, and it's
buildable and testable entirely in a browser (including this sandbox).

**User flow:**
1. User picks a body to shoot: a star from the existing up-now list, or Sun,
   or Moon.
2. User enters the sextant altitude (Hs, degrees/minutes), the sight time,
   height of eye (for dip — default a sane value, remember last-used), index
   error (default 0), and — for Sun/Moon — which limb was brought to the
   horizon (upper/lower).
3. App applies corrections to get Ho (observed altitude):
   - **Index error**: applied directly, sign per convention (on the arc
     subtracts, off the arc adds — surface this as a labeled toggle, not a
     sign the user has to remember).
   - **Dip** (horizon depression from height of eye): standard approximation
     `dip(') = 1.76 × √(height_m)` (equivalently `0.97 × √(height_ft)`).
     Only applies to a natural sea/lake horizon — offer an artificial-horizon
     mode (dip = 0) since a lot of hobbyist users won't have a sea horizon.
   - **Refraction**: Bennett's formula,
     `R(') = 1 / tan(h + 7.31/(h + 4.4))` with `h` = apparent altitude in
     degrees, valid down to the horizon without needing temperature/pressure
     input for a v1 (note as a known simplification — full Bennett has a
     temperature/pressure refinement term that can be added later).
   - **Semi-diameter** (Sun/Moon only): Sun ≈ 15.98' (a fixed constant is
     fine for v1 — it only varies ±0.3' across the year); Moon's SD varies
     with distance and should be computed from `moonState()`'s existing `r`
     rather than hardcoded, since that math is already in the codebase.
     Sign depends on upper/lower limb.
   - **Parallax in altitude** (Moon only, stars/planets negligible, Sun
     negligible at hobbyist precision): horizontal parallax
     `HP(') ≈ 3438 / r` (r in Earth radii from `moonState()`), reduced by
     `cos(apparent altitude)` — this is the single largest correction for
     Moon sights (up to ~1°) and is the reason Moon sights are meaningfully
     harder than star sights; call this out in the UI copy, not just bury it
     in the math.
4. App computes Hc/Zn for the body at the entered sight time using the
   *assumed position* (default: last known/current location — user can
   override, since a real DR position may differ from GPS).
5. **Intercept** (Marcq St. Hilaire method): `intercept = Ho − Hc` (positive
   = toward the body, negative = away), reported in nautical miles
   (1' of arc = 1 nm) along azimuth Zn.
6. Repeat for 2-3 sights (ideally spread ≥60° in azimuth, reusing the
   existing spread-scoring logic from the 3-star-fix recommender to warn the
   user if their chosen bodies give a weak cut).
7. **Fix**: with ≥2 intercepts/azimuths, solve for the position where all
   position lines are simultaneously satisfied. A flat-plane least-squares
   solve (treating each LOP as a line perpendicular to its azimuth at
   distance `intercept` from the assumed position) is the standard
   small-area approximation real navigators use when plotting by hand — no
   need for anything fancier at hobbyist ranges (tens of miles). Report the
   fix as lat/lon plus a "cut quality" readout (reusing the strong/fair/weak
   cut language already used for the 3-star recommender).

**Edge cases to design for up front:** sights very near the horizon (large,
fast-changing refraction — Bennett's formula gets unreliable below ~0°,
should warn/clamp); sights very near zenith (azimuth becomes poorly defined,
Zn calculation can be numerically unstable — same issue `starHcZn` would hit,
worth a guard); user enters an Hs that's impossible for the chosen body/time
(e.g., body is below the horizon per Hc) — surface this as a warning rather
than a silent bad answer; only 1 sight entered — show Hc/Zn/intercept but no
fix yet, not an error state.

**Effort:** medium. It's a genuinely new UI flow (multi-step sight entry +
correction breakdown + fix display) plus a moderate amount of new pure-math
functions, but no new platform capabilities, no native permissions, and it's
fully testable in this sandbox with Playwright (no sensors/camera involved).

### Feature B — AR Aim Assist (do this second, if at all for v1)

Helps a user physically point their phone/sextant at the recommended star.
Much higher complexity and risk than Feature A, and — unlike Feature A —
genuinely can't be validated in this sandbox at all (no device sensors, no
camera in headless Chromium); it needs a real phone.

**MVP cut (no camera):** extend the existing compass dial into a live
"turn this way" indicator — read device heading via `DeviceOrientationEvent`
(`webkitCompassHeading` on iOS Safari, `absolute` orientation event on
Android Chrome where available) and rotate the dial so the recommended
star's position is shown relative to where the phone is *currently* pointed,
with a simple arrow ("turn 40° left, tilt up 20°") rather than a full camera
overlay. This alone delivers most of the practical value (helping a
non-expert locate the right star) with a fraction of the engineering risk.

**Full version (camera passthrough):** live camera feed (`getUserMedia` on
web, or a native camera plugin) with star markers composited on top,
positioned using device heading + tilt to project each star's alt/az into
screen space. This is real AR and has real, well-known failure modes worth
being explicit about before committing to it:
- Magnetometer-based heading is frequently off by 10-30° near metal/indoors,
  and needs an explicit calibration UX (the "figure-8 wave" gesture most AR
  apps use) — without one, users will point at the wrong star and blame the
  app.
- iOS requires an explicit user gesture + `DeviceOrientationEvent
  .requestPermission()` prompt (Safari 13+); Android's absolute-orientation
  support varies by device/browser and sometimes silently falls back to
  relative-only heading, which is useless for this feature without a
  compass reference.
- Camera access needs new permission strings (`NSCameraUsageDescription` on
  iOS, `CAMERA` on Android) and, if using a native plugin instead of
  `getUserMedia`, actual native code — this is the kind of change that would
  need the same real-device validation that iOS/Android builds already do
  (this sandbox can't test it, same limitation noted elsewhere in
  `CLAUDE.md`).

**Recommendation:** ship the no-camera compass-arrow MVP, if Feature B is
pursued at all — it's a much smaller, testable-on-most-devices slice, and
the full camera overlay can be a distinct future release once there's
real-device feedback on whether the simple version is actually good enough.

## Suggested sequencing

1. Feature A (Sight Reduction Calculator) — buildable and fully testable
   now, no owner input needed to start beyond the open questions below.
2. Feature B MVP (compass arrow, no camera) — needs real-device testing
   before merging; can be scoped once Feature A ships.
3. Feature B full (camera AR overlay) — treat as a distinct, larger future
   effort; don't bundle into the same release as the MVP.

## Open questions for the owner — resolved

- **Gating**: free. No RevenueCat entitlement check for Navigator.
- **Scope for v1**: stars + Sun + Moon. Sun/Moon sights need the
  semi-diameter/parallax/limb-choice UI described above — building it now
  rather than deferring.
- **Feature B (AR aim assist)**: wanted for v1, as the no-camera
  compass-arrow MVP. The full camera-overlay version remains out of scope
  (real-device testing needed, this sandbox can't validate it at all).

## Explicitly out of scope for this spec

- Running fix (correcting for vessel/observer motion between sights) — real
  marine navigation, not needed for a stargazing-hobbyist tool.
- Plotting-sheet-style chart rendering of the LOPs — the numeric fix output
  is the deliverable, not a drawn chart.
- Any offline star catalog beyond the existing 57 `NAV_STARS` — sufficient
  for the sight-reduction use case as-is.
