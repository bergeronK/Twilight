# App Store Connect & Play Console — privacy questionnaire answers

Reference sheet for filling out the "App Privacy" (Apple) and "Data safety"
(Google) forms when submitting Twilight. These are grounded in exactly what
`index.html` and `native/` do as of this writing (July 2026) — re-check
against the code if data flows change before you submit. Store forms get
reworded over time; match by meaning, not by exact wording below.

The underlying facts driving every answer here: no accounts, no ads, no
analytics SDK, no cookies. The only data that leaves the device is (a)
coordinates sent to Open-Meteo for weather/place-search, and (b) — native
app only — an anonymous RevenueCat install ID + purchase receipt for IAP
verification. See `/privacy.html` for the human-readable version of this
same information.

## Apple App Store Connect — "App Privacy"

Path: App Store Connect → your app → App Privacy → Get Started / Edit.

**"Do you collect data from this app?"** → **Yes** (location, at minimum).

Declare these two data types:

### 1. Location
- **Collected:** Yes
- **Type:** Precise Location *(declare Precise, not Coarse — the app
  requests location with `enableHighAccuracy: false`, which is a hint, not
  a guarantee; Apple wants the more conservative answer since iOS may still
  supply precise coordinates even with reduced-accuracy user settings)*
- **Linked to the user's identity:** No — there's no account or profile to
  link it to
- **Used for tracking:** No
- **Purpose:** App Functionality

### 2. Purchases (native iOS app only — remove if submitting before IAP is live)
- **Collected:** Yes
- **Linked to the user's identity:** No *(RevenueCat's app_user_id is an
  anonymous, app-generated identifier — not your name, email, or Apple ID)*
- **Used for tracking:** No
- **Purpose:** App Functionality

Optional but defensible to also declare **Identifiers → Device ID or User
ID** (the same anonymous RevenueCat ID) as Collected / Not Linked / Not
Used for Tracking / App Functionality — some reviewers expect purchase
verification IDs listed under both Purchases and Identifiers. Either
approach is consistent with what the code actually does.

### 3. Camera — *not* a data-collection declaration

Sky View can show the live rear-camera feed behind the star overlay
(`getUserMedia`, off by default). Nothing is recorded, stored, or
transmitted — the frames are painted to the screen and discarded.

Apple's App Privacy questionnaire asks what data you **collect**, so this is
**not** declared there: under **User Content → Photos or Videos**, answer
**No**. A live preview that is never persisted or sent anywhere is not
collection. Declaring it anyway would be inaccurate in the other direction
and invites questions you'd then have to un-answer.

What camera use *does* require:
- **`NSCameraUsageDescription` in `Info.plist`** — already added. Apple
  rejects builds that can reach a camera prompt without one, and reviewers
  read the string. Current text: *"Twilight can show the live camera behind
  Sky View so you can line up stars against what you actually see. The camera
  is off by default, nothing is recorded, and no image ever leaves your
  device."*
- **A reviewer note** (App Store Connect → App Review Information → Notes)
  saying where the camera is used and that it's optional, e.g.: *"Camera is
  optional and off by default. Stars tab → Open Sky View → Camera. It shows a
  live viewfinder behind the star overlay; no photo or video is captured,
  stored, or transmitted."* Without this, a reviewer who never taps that
  button may not find the feature and may ask why the permission exists.

**Every other category** (Contact Info, Health & Fitness, Financial Info,
Sensitive Info, Contacts, User Content, Browsing History, Search History,
Usage Data, Diagnostics, Other Data) → **not collected**.

**"Do you or your third-party partners use data for tracking as defined by
Apple?"** → **No.**

## Google Play Console — "Data safety"

Path: Play Console → your app → App content → Data safety.

**"Does your app collect or share any of the required user data types?"**
→ **Yes.**

### Location
- **Collected:** Yes (Approximate or Precise location — same reasoning as
  Apple above, declare Precise to be safe)
- **Shared with third parties:** Yes — Open-Meteo (weather/place-search),
  disclosed as a third-party service, not sold
- **Purpose:** App functionality
- **Is this data required or optional:** required for the location-based
  features, but the app has a manual entry fallback — reasonable to mark
  optional if the form allows nuance, required if it's binary
- **Processed ephemerally:** No (cached briefly on-device, not on a server
  you control)

### Purchase history (native Android app only)
- **Collected:** Yes
- **Shared with third parties:** Yes — RevenueCat (purchase verification)
- **Purpose:** App functionality
- **Data is encrypted in transit:** Yes (HTTPS)
- **Users can request deletion:** Not applicable — no account exists to
  delete; RevenueCat's own data-deletion process applies if a user asks

### Camera — *not* a data-collection declaration

Same reasoning as Apple above: Sky View's optional viewfinder never records
or transmits a frame, so under **Photos and videos → Photos / Videos**,
answer **No**. Play's Data safety form is about collection and sharing, not
about which permissions the manifest declares.

The manifest declares `android.permission.CAMERA` with
`<uses-feature android:name="android.hardware.camera" android:required="false" />`,
which keeps the app installable on devices without a rear camera. Play may
surface a **permissions declaration** prompt for CAMERA — the answer is that
it powers an optional live viewfinder behind the star overlay, off by
default, with nothing captured or stored.

**Everything else** → not collected.

**"Is all of the user data collected by your app encrypted in transit?"**
→ **Yes** (both Open-Meteo and RevenueCat are HTTPS-only; the CSP in
`index.html` doesn't permit anything else).

**"Do you provide a way for users to request data deletion?"** → there's no
account or server-side profile to delete. For location/preferences, the
answer is "clear app storage / uninstall." For the RevenueCat identifier,
point users to RevenueCat's deletion process if asked.

## Age rating (both stores)

Twilight is a reference/utility app: no user-generated content, no chat, no
violence, gambling, or mature themes. Apple's questionnaire and Google's
equivalent should both land on the lowest tier (Apple: 4+; Google: Everyone)
with every content-descriptor question answered "No."

## Export compliance (Apple)

**"Does your app use encryption?"** → the app only uses standard HTTPS/TLS
(no custom cryptography implemented in `index.html` or `native/`), which
qualifies for Apple's standard exemption. Answer **Yes, uses only exempt
standard encryption** (or the equivalent "uses HTTPS but no proprietary
encryption" option in whichever wording that build of App Store Connect
shows) — this typically avoids needing a formal export-compliance
document/CCATS filing.

## Before you submit — re-verify

- If `RC_KEYS` is still empty (IAP inert) at submission time, drop the
  Purchases / Identifiers declarations above and revisit once a key is set.
- If a future feature adds a new third-party call (e.g. push notifications
  for Alerts), it needs its own row here and in `/privacy.html` before that
  version ships — check `connect-src` in the CSP meta tag in `index.html`,
  which is the definitive list of every host the app is allowed to talk to.
- Add the camera reviewer note (text above) to App Review Information. It
  costs nothing and heads off the most likely "why does this need a camera?"
  round-trip.
- Check `/privacy.html` mentions the camera. The store questionnaires and the
  public policy should not disagree with each other, and the policy is the
  one a user actually reads.
