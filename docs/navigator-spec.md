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
- Aim assist v1 shipped **turn guidance only**. Tilt, calibration and manual
  correction were added in v1.1 — see below.

## Aim assist v1.1 — tilt, calibration, manual correction

The v1 note here used to say tilt was unshippable without a real device,
because reading `beta` as "tilt" is only right when the phone is upright and
unrolled. That framing was the problem, not the feature: composing the whole
orientation matrix instead of reading one Euler angle removes the ambiguity,
and the result is verifiable on a desk.

- `orientationToAim(alpha, beta, gamma)` returns where the **rear camera** is
  aimed, as `{az, alt, stable}`. The W3C angles are an intrinsic Z-X'-Y''
  rotation from ENU to the device frame; the camera looks along device `-z`,
  so the aim is minus the third column of `Rz(a)·Rx(b)·Ry(g)`.
- Verified in three independent ways rather than by inspection: against
  hand-reasoned postures (flat screen-up aims at the ground, upright facing
  north aims north at the horizon, alpha +90 swings the aim west); against a
  numerically-built rotation matrix, so a slip in the closed form can't hide;
  and by a **roll-invariance sweep** — rotating about the camera axis across
  four postures and 73 roll angles moves the aim by <1e-13°, which is the
  property that makes the matrix worth having over reading `beta`.
- `stable` is false when the aim is within ~8.6° of vertical, where azimuth is
  atan2 of two near-zero numbers and swings wildly. There the UI drops to
  bearing-only and says to raise the phone, rather than showing a number that
  spins.
- `screenUpHeading(alpha, beta, gamma, screenAngle)` is the flat-phone
  fallback. Sensor angles are always reported against the device's *natural*
  orientation, so a phone turned into landscape reports a device-top 90° from
  the top the user sees — hence the `screenAngle` term, tracked from
  `screen.orientation.angle`. The aim vector needs no such correction (the
  camera is bolted to the body), which is why only the fallback takes it.
  Verified against hand cases and confirmed to reduce exactly to the old
  `(360 - alpha)` rule at `screenAngle = 0`.
- **Calibration**, because the magnetometer is the entire error budget — the
  astronomy underneath is exact, and phone compasses are routinely 10-20° off
  near metal or in a magnetic case. Three mitigations, all reachable from the
  aiming screen rather than buried in settings: a figure-8 prompt (shown
  automatically when iOS's `webkitCompassAccuracy` reports the heading
  unusable, or when a browser fires `compassneedscalibration`, or on demand);
  ±5° nudges; and **Align to <body>** — point at the body by eye, tap once,
  and the residual error is cancelled for every body. That last one is
  Stellarium's "screen calibration" trick and is the reliable escape hatch
  when figure-8 waving isn't enough.
- The manual offset persists via `prefStore` (`tw_aim_offset`), normalised to
  (-180, 180] so repeated nudges can't wind past a full turn.
- **Mobile-web specifics** handled alongside: a Screen Wake Lock held while a
  target is selected and re-acquired on `visibilitychange` (the lock is
  dropped whenever the page hides, so without that the screen sleeps
  mid-session); an explicit `isSecureContext` check, since sensors silently
  fail on plain HTTP; and an "open in Safari or Chrome" hint on the
  unsupported path, which in practice means the in-app browsers inside social
  apps, where sensors are withheld. Permission is still requested from the
  body-tap itself (a real user gesture, as iOS requires) with a heads-up line
  so the prompt isn't a surprise.
- Still not shipped: the camera passthrough overlay. That one genuinely does
  need a real device — see Feature B below.

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

**Edge cases — shipped in v1.6, not in v1.** These were specified below and
then not implemented, which left a real hole: a sight of a body that was
below the horizon still produced a confident intercept and was averaged into
the fix. A single bad line moved the answer somewhere plausible-looking with
nothing on screen to say so. Now:

- **Body below the horizon** (`Hc < -0.5°`) — named outright ("Canopus was
  80° below the horizon at that time, so it could not have been sighted;
  check the date, time and time zone"), because a wrong date or a 12-hour
  slip is the most common blunder and is invisible in the output otherwise.
- **Near the zenith** (`Hc > 88°`) — azimuth is poorly defined, so the sight
  cannot give a usable position line.
- **Both are excluded from the fix**, not merely flagged, and the fix panel
  says "Using 2 of 3 sights" when it drops any. Flagging alone would still
  have let a garbage line steer the result.
- **Low sights** (`Ho < 5°`) — warned as weak; refraction is large and
  uncertain there. `sightToHo` also clamps the altitude fed to Bennett's
  formula at `-0.5°`, since its tangent argument goes to zero below the
  horizon and the correction runs away.
- **Implausible intercept** (`|intercept| > 60 nm`) — flagged as a probable
  blunder. Wrong body, wrong hour and transposed digits all surface this way
  far more often than a genuinely poor position does.

Original specification:

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

**Shipped in v1.2 — Sky View.** Point the phone, see the bodies where they
actually are, labelled. Full-screen canvas overlay (`SkyDome`), driven by the
same sensor plumbing as Aim Assist.

- `worldToScreenDir()` is the transpose of `orientationToAim`'s matrix
  (world → device rather than device → world), then rotated by the screen
  angle because the canvas lives in screen space while sensors report in the
  device's natural frame. `skyProject()` is a plain pinhole projection at a
  63° vertical FOV, close to a phone's rear camera.
- Verified numerically before any pixels were looked at: the body the phone
  is aimed at lands within 1e-12 px of the screen centre across 1,600 random
  orientations × 4 screen angles; a body exactly FOV/2 above the aim lands
  exactly on the top edge; right is right and up is up; bodies behind the
  phone are culled rather than wrapped; and rotating the screen rotates the
  picture by exactly 90° while preserving each body's distance from centre.
- **Drag-to-look** whenever sensors aren't driving it. This is not only a
  desktop/denied-permission fallback — it's what makes the whole view
  testable in CI, since the manual path synthesises the same Euler angles a
  phone aimed that way would report and renders through one code path.
- Bodies below the horizon are drawn at 22% alpha rather than hidden, so
  sweeping down past the skyline stays continuous without implying you could
  go and look at something the Earth is in front of.
- **Camera passthrough shipped, but opt-in and secondary.** At night a phone
  camera sees essentially nothing, so the rendered sky is the product; the
  camera is for daylight Sun/Moon work and lining up against a landmark.
  Permission denial and absent `mediaDevices` both degrade to the rendered
  sky with a note. `NSCameraUsageDescription` and Android `CAMERA` are
  declared (both `required="false"`), so the native shells can honour it.
- **Known limitation:** the catalog is still the 57 `NAV_STARS`, so the view
  is sparser than a real planetarium app. Those 57 are all brighter than
  mag 3 and are exactly the app's subject matter, so this is a reasonable cut
  — but it is the obvious thing to revisit if Sky View becomes a headline
  feature. A denser catalog is a payload decision, not a math one; the
  projection already handles arbitrary body lists.
- Sky View sits at z-index 300, above the tab bar (100) and its menu (200):
  it's immersive and owns the screen until Back is tapped.

## v1.5 — the Android heading bug (real-device report, **confirmed fixed**)

**Status: verified working on a real Android device.** This is the first part
of Navigator confirmed against actual hardware rather than synthetic events.
Still unverified on a device: the turn/tilt direction signs and roll
behaviour (see the field-test list at the end of this section).


Aim Assist and Sky View never produced a heading on Android. Reported from an
actual device; the sandbox could not have caught it, because the fix depends
on an event this environment never fires.

**Cause.** There are three different platform contracts and the code only
implemented two:

| Platform | Where a true-north heading comes from |
|---|---|
| iOS Safari | `deviceorientation` carrying `webkitCompassHeading` (already true north) |
| **Android Chrome** | **a separate `deviceorientationabsolute` event** — plain `deviceorientation` is *relative*, its alpha taken from the game rotation vector with an arbitrary yaw origin |
| Others | `deviceorientation` with `absolute === true` |

The handler listened only to `deviceorientation` and required `e.absolute`,
which on Android is `false`. So alpha was never accepted, `orient` stayed
null, and the UI sat on "Waiting for compass data…" / "No compass here".

**Fix.** Listen to `deviceorientationabsolute` as well, and accept a relative
alpha rather than discarding it. Absolute wins once seen — both streams fire
on Android and the relative one would otherwise fight it.

**Relative headings are now usable, not rejected.** Tilt from a relative
event is fully valid, and the existing manual offset turns an arbitrary yaw
origin into a correct bearing the moment the user aligns on a known body. The
UI says so explicitly instead of being silently wrong: *"This phone isn't
reporting a true-north heading… point at X by eye and tap Align — that sets
north and it sticks."*

**Lesson for future sensor work:** synthetic-event tests are only as good as
the event shapes they synthesise. Every test here dispatched
`{absolute: true}` on `deviceorientation`, which is the one combination
Android never sends. The regression test now covers all three platform
contracts by name.

### Still to confirm on a real device

The heading now works; these are the remaining things no synthetic test can
settle, in priority order. Each is a sign convention that is either right or
exactly backwards — there is no partial failure mode.

1. **Turn direction.** Face ~90° away from the target. "Turn 90° right" must
   mean the user's right.
2. **Tilt direction.** Aim well below a high body. It must say "tilt **up**".
   This is the one the v1 spec called unverifiable.
3. **Roll.** Aim at a star, then rotate the phone about the sighting axis.
   The star must not move. Verified to 1e-13° in maths (`orientationToAim`
   roll sweep), never in a hand.
4. **Landscape.** Turning the phone sideways while aiming must not make the
   view jump — this exercises `screenUpHeading`'s screen-angle term.
5. **Sky View registration.** Point at the Moon with the camera on; the drawn
   Moon should sit on the real one after **Align** and **Match to camera**.

### Sensor diagnostics

"Sensor details" in Aim Assist is a permanent feature, not debug scaffolding.
It reports build number, secure context, event support, relative/absolute
event counts, how many carried angles, the heading source and the last raw
angles. It is what turned "doesn't work on Android" into a specific,
fixable cause, and it distinguishes the three failure modes (no events /
events without angles / working) that otherwise look identical to a user.

## Sky View v1.3 — tap to identify, FOV calibration, placement

- **Tap anything to identify it.** Pointing a phone at the sky is the
  question "what is that?", and until now the only way to name something was
  to have already chosen it in Aim Assist. A tap hit-tests every body within
  44px and picks the brightest of any near-tie, so a faint star can't steal
  the tap from the planet beside it. Dragging is excluded by an 8px movement
  threshold, and mouse-leave / touch-cancel abandon the gesture rather than
  registering as a tap. The pick sets the Aim Assist target too, so closing
  the overlay leaves you pointed at whatever you tapped.
- **Match to camera** (±3°, persisted) — see the FOV note above for why this
  has to be manual.
- **Sky View v1.4 — real star catalogue.** The sparse-sky limitation is gone.
  `stars.bin` carries 1,575 stars to magnitude 5.0 (257 with proper names) in
  11 KB, fetched on first Sky View open like `bortle-cities.bin` so
  `index.html` and its CSP stay untouched. Generated by
  `scripts/generate-star-catalog.js`, which reads `NAV_STARS` out of
  `index.html` and drops catalogue entries within 3′ of one so nothing draws
  twice. Rendering changed to suit a real catalogue: magnitude now drives
  both radius and opacity (a flat floor made 1,500 stars look like identical
  dots), the per-frame sort was replaced by sorting once in the `skyBodies`
  memo, and labels are curated — working set plus named stars to mag 2.6,
  with everything else identifiable by tap. **Licensing:** HYG is CC BY-SA
  4.0, so `stars.bin` inherits it (`stars.LICENSE.txt`, plus a footer
  credit). The app's own source is unaffected, and CC BY-SA permits
  commercial use, so it doesn't conflict with Pro/IAP.
- **The launcher moved to the top of the Stars tab.** It was previously only
  in the Aim Assist section at the very bottom, below the star table and the
  whole sight-reduction form. Now it's a tappable card directly under the
  header, above the fold on a 390×844 phone.

**Still open — full AR registration.** Raised again after v1.1.
The projection itself turned out to be verifiable on a desk (see v1.2 above),
so the camera shipped. What is still genuinely unvalidated is *registration*:
whether the rendered sky lines up with the camera image to within a few
degrees on a real device. Two unknowns drive that, and neither can be
measured here:

- **Camera FOV — resolved in v1.3, but not the way this doc first claimed.**
  An earlier revision said the fix was "read the actual FOV from the
  `MediaStreamTrack` settings". That is not possible: **no web API exposes a
  camera's field of view.** Verified directly against Chromium —
  `getSettings()`, `getCapabilities()` and
  `getSupportedConstraints()` contain nothing FOV-, focal-length- or
  intrinsics-related (settings expose only deviceId/exposure/focus/group;
  capabilities add aspectRatio/width/height/frameRate/facingMode/resizeMode).
  Since the value cannot be read, the only correct fix is to let the user
  match it by eye once: Sky View shows a **Match to camera** control (±3°)
  whenever the camera is on, persisted as `tw_sky_fov`, defaulting to
  `SKY_FOV_DEFAULT` = 63°. That turns registration from something needing a
  developer with a device into something any user can correct in five
  seconds — and, with the existing heading offset, both registration axes are
  now user-correctable.
- **Magnetometer error**, which the Aim Assist calibration already addresses
  and which the manual offset already corrects. Registration makes that error
  visible in a way the numeric readout doesn't, so real-device use may show
  the figure-8 prompt needs to be more insistent.

Also still outstanding: camera access is a disclosable category in
`docs/app-store-privacy-answers.md` even though nothing is recorded or
transmitted — that file needs updating before submission.

## Explicitly out of scope for this spec

- Running fix (correcting for vessel/observer motion between sights) — real
  marine navigation, not needed for a stargazing-hobbyist tool.
- Plotting-sheet-style chart rendering of the LOPs — the numeric fix output
  is the deliverable, not a drawn chart.
- Any offline star catalog beyond the existing 57 `NAV_STARS` — sufficient
  for the sight-reduction use case as-is.
