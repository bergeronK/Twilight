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

## Build workflow (do this every time you edit `index.html`)

```
node scripts/verify-build.js        # will fail if hashes are stale
```

If it fails (or you touched any inline `<script>` content), recompute hashes.
There's no committed script for this — the working pattern used all session is:
read the 5 `<script>` blocks, SHA-256 each with `crypto.createHash('sha256')`,
base64-encode, and rewrite the `script-src` line in the CSP `<meta>` tag. A
throwaway Node script doing exactly that (find `<script>...</script>` regex,
hash, replace) is the fastest path — write one if it doesn't exist in your
scratchpad.

Also bump `CACHE` in `sw.js` (and mirror any new/changed asset filename into
its `ASSETS` array and into `native/sync-web.js`'s file list) whenever a
cached asset changes.

## Git workflow — a landmine to know about

This repo squash-merges every PR into `main`. That means **the dev branch's
own commit objects for already-merged work never match `main`'s squash
commit**, even though content is identical. Consequence: `git merge
origin/main` into the dev branch will show conflicts on files that were
touched by a just-merged PR, purely because git's merge-base is stale, not
because content actually differs.

**Fix, every time, before pushing new work**: `git fetch origin main && git
merge origin/main --no-edit`. If it conflicts, first verify with `git diff
origin/main <dev-branch-tip> -- <file>` that the dev branch is already a
strict superset of main (it almost always is, since PRs are additive) — then
resolve with `git checkout --ours <file>` and commit. Confirm afterward with
`git diff origin/main HEAD` that the resulting diff is *exactly* the new
work, nothing more/less.

## Deploy

**GitHub Pages currently deploys production (twilyte.info) from the dev
branch `claude/web-app-style-review-x4rrz4`, not from `main`.** This means
every push to that branch goes live immediately, before PR review or merge.
This has been flagged to the owner as worth switching (Settings → Pages →
Branch: `main`) so production is merge-gated instead of push-gated. Not yet
done as of this writing — confirm current state before assuming either way.

The Pages deploy job has intermittently failed on first attempt with a
generic "Deployment failed, try again later" (platform-side flake, not a
content problem) — re-running the full workflow (not just the failed job)
has fixed it every time.

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

**Open PR, not yet merged (check `gh pr list` / GitHub UI for current
state):** brand-asset refresh (install screenshots + og-image regenerated
for the new look) + the blue page-background unification/cooling. Small,
low-risk, mostly binary diffs.

**Blocked on the repo owner, not on engineering:**
- RevenueCat public SDK key (`appl_…`) → drop into `RC_KEYS.ios` in
  `index.html` to activate the purchase flow. Owner has an Apple Developer
  account as of this writing but has not yet created the App Store Connect
  app record, the IAP product, or the RevenueCat project.
- Pages deploy-source switch (see Deploy section above).
- Privacy Policy URL for App Store Connect (unconfirmed whether twilyte.info
  has one yet).
- Actual Xcode build/signing/TestFlight upload — needs a Mac; nothing to do
  here until the owner has one available.

**Backlog, not started, no blockers:**
- SEO location landing pages ("twilight times in [city]").
- Alerts (clear-and-dark-tonight push notifications) — needs a backend
  decision (Cloudflare Worker + Cron Triggers is the natural fit given the
  existing visitor-counter Worker).
- AR sky view / celestial-nav "Navigator" sight-reduction pack — bigger,
  scoped-but-unstarted differentiators from earlier market research.
- App Store screenshot regeneration at Apple's exact required device
  dimensions (differ from the PWA manifest sizes currently used).
- App Store Connect prep docs (App Privacy questionnaire answers, age
  rating, export compliance) — straightforward given the app's "no
  tracking, anonymous visit count only" data story, just not yet written.

## Conventions established this session (follow unless told otherwise)

- One PR per logical change; squash-merge; always `git fetch` + reconcile
  before pushing (see Git workflow above).
- Commit messages and PR bodies are the durable record of *why* — write them
  as if this file didn't exist, since PR history outlives any one session.
- Screenshots/mockups before big visual changes; ship real Playwright
  screenshots of the actual app in PR descriptions, not descriptions of intent.
- Don't guess at colors/values when matching an existing look — sample actual
  rendered pixels (Playwright screenshot + PIL) to confirm before and after.
