# Twilyte Pro — how the app pays for itself

**The model (owner, 2026-10-05):** Twilyte is free, and **Twilyte Pro** is
one purchase, paid once, that unlocks planning ahead. No ads, no
subscription, nothing about anyone sold. Clear-sky alerts stay free.
Everyone who had the app before Pro went on sale keeps Pro for free.

## Where things stand

| | Now | When Pro is on sale |
|---|---|---|
| iPhone 1.0 | Free, everything unlocked, nothing sold | 1.1: Pro for sale; 1.0's people keep it |
| Android | Not released | Sells Pro from its first release |
| Website | Week planner marked "PRO" and "free preview" | Unchanged until twilyte.info becomes the apps' website |

Already in the app and waiting for a key: RevenueCat's purchase and
restore (`rcPurchasePro`, `rcRestorePro`), the check at every launch
(`rcApply`), the Unlock and "Restore purchases" controls in Settings, and
the early-supporter rule below. The RevenueCat plugin is already in the
iPhone app (`native/package.json`, `CapApp-SPM/Package.swift`); while
`RC_KEYS` is empty it is never configured and never contacts anyone.

## What's free and what's Pro (proposed; the owner decides)

The rule: **everything a stargazer needs for tonight stays free; Pro is
planning ahead.** Nothing free in 1.0 should be taken away from anyone.

- **Free:** the painted sky and the verdict, twilight today, the Bortle
  class, what's worth a look, the Ephemeris for any date and place, Sky
  View with Find and time travel, the chart, Jupiter and Saturn, the space
  station, the almanac, alerts, everything for navigators.
- **Pro in 1.1:** the 7-night "Clear & Dark" week planner (the only thing
  `pro` gates today).
- **Candidates to add to Pro later**, roughly in order of what people would
  pay for: a Home Screen widget (tonight's verdict and the next twilight),
  a photographer's month (golden and blue hours, moonless nights and the
  Milky Way's core across a month), a longer planner (14 nights), saved
  places with their own week each. Each is new work; none is built.

**Price:** $4.99, one time (Apple's price points convert it for other
countries). Raise it for new buyers when Pro grows; never charge anyone who
already has it.

**Apple's App Store Small Business Program:** enrol before the first sale.
Apple then keeps 15% instead of 30% (under $1M a year).

## Early supporters (grandfathering)

On iOS the store tells the app which build a person **first downloaded**
(RevenueCat's `originalApplicationVersion`, that build's `CFBundleVersion`,
the Build field in Xcode). So:

- **Every build uploaded while the app sells nothing is numbered 1 to 99**
  (whole numbers).
- **The first build that sells Pro is Build 100 or higher**, and so is
  every one after it.
- `earlySupporter(info)` in `index.html` says yes for a whole number under
  `EARLY_BUILDS_BELOW` (100), and `rcApply` then gives Pro without a
  purchase. Settings says "Yours free, since you had Twilyte before Pro
  went on sale."
- **`monetization.test.js` holds the Xcode project to this**: Build under
  100 while `RC_KEYS.ios` is empty, 100 or more once it is set. Forgetting
  the jump to 100 would give every 1.1 buyer Pro for nothing; a free build
  numbered 100 would leave its people out.
- **Check the number in the upload.** Xcode's Organizer offers "Manage
  Version and Build Number" when uploading. For 1.1 the summary must read
  **1.1 (100)**; if Xcode has renumbered it, go back and untick that option.
- **TestFlight can't show the early-supporter path.** Apple's sandbox says
  "1.0" for every tester, which isn't a whole number, so testers (and App
  Review) see the Unlock button and can try a real sandbox purchase. The
  early path is covered by the tests with a stand-in store.
- **If the store doesn't know yet** (no receipt on the phone), the person
  sees Unlock; **Restore purchases** fetches it, says "Pro restored." and
  the note above appears.
- **Android always says null**, so it can't tell early people apart: launch
  Android with Pro on sale from its first release, and there is nobody to
  grandfather. If Android ships free first, decide a rule before 1.1 there.

## Turning it on (1.1)

1. **App Store Connect:** sign the Paid Apps agreement (Agreements, Tax
   and Banking; needed for any purchase) and enrol in the Small Business
   Program.
2. **The product:** In-App Purchases → **Non-Consumable**, product ID
   `tw_pro_lifetime`, reference name "Twilyte Pro", the price, a display
   name and description, and a review screenshot of Settings' Unlock.
3. **RevenueCat** (free tier): a project and an iOS app (bundle ID
   `info.twilyte.app`) with App Store Connect's In-App Purchase key; the
   product attached to an **entitlement named exactly `pro`** (the app
   reads `entitlements.active.pro`); the **current offering** with the
   product as its **Lifetime** package (`rcPurchasePro` buys that one).
4. **The app:** the public key (`appl_…`) into `RC_KEYS.ios` in
   `index.html` (public keys are safe to ship); Xcode **Version 1.1, Build
   100**; run the tests, then `npm install && npm run sync`.
5. **Try it on TestFlight** with a sandbox account: Settings shows Unlock,
   the purchase unlocks the planner, deleting and reinstalling then
   Restore brings it back.
6. **Privacy, in the same release:** App Store Connect's App Privacy gains
   Purchases (and its Identifiers) as in `app-store-privacy-answers.md`;
   `/privacy.html`'s "The current iOS and Android apps sell nothing"
   becomes what RevenueCat receives; the review notes in
   `app-store-listing.md` describe Pro and the early-supporter rule instead
   of "no in-app purchases". `ios-release.test.js` checks the privacy
   policy's sentence, so it changes with it.
7. **Words:** the website's "free preview" stays on the website; in the
   app, `proShown()` turns the "PRO" badge on by itself once a key is set.

What 1.1 changes on its own once the key is set: the Pro badge, Unlock and
Restore in Settings, and new people start without the planner
(`prefStore`'s `pro` starts off where the store sells it, so a first launch
offline doesn't hand it out).
