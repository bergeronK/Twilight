#!/usr/bin/env bash
# Installs the Android app's debug build in a running emulator and checks it
# the way a person first meets it: it starts and stays up, the page is drawn
# as the app (not the "Starting Twilyte" hang a stale CSP gives), the share
# and calendar plugins are there for the page, and the back button closes
# the first-run welcome before it leaves the app. Run by
# .github/workflows/android-build.yml inside the emulator step.
set -euo pipefail
APK=native/android/app/build/outputs/apk/debug/app-debug.apk
PKG=info.twilyte.app

running() { adb shell pidof "$PKG" | tr -d '\r' || true; }
resumed() { adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep -q "$PKG"; }

# However it ends, keep the log and what was on screen, and on a failure say
# why in the job's own output: a crash's stack, Capacitor's and the page's
# console lines.
finish() {
  code=$?
  adb logcat -d > android-logcat.txt 2>/dev/null || true
  [ -s android-launch.png ] || adb exec-out screencap -p > android-launch.png 2>/dev/null || true
  if [ "$code" -ne 0 ]; then
    echo "---- crash and app log lines ----"
    grep -E 'AndroidRuntime|FATAL|Capacitor|chromium|info\.twilyte' android-logcat.txt | tail -80 || true
  fi
}
trap finish EXIT

adb install -r -g "$APK"          # -g: location granted, so no system dialog over the page
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 20
pid=$(running)
test -n "$pid" || { echo "the app is not running"; exit 1; }
adb exec-out screencap -p > android-launch.png

# The web view's DevTools socket, forwarded for scripts/android-check.js.
sock=$(adb shell cat /proc/net/unix | tr -d '\r' | grep -o "webview_devtools_remote_$pid" | head -1)
test -n "$sock" || { echo "no DevTools socket for pid $pid"; exit 1; }
adb forward tcp:9222 "localabstract:$sock"
node scripts/android-check.js page
node scripts/android-check.js welcome

# Back closes the welcome, and the app stays in front.
adb shell input keyevent KEYCODE_BACK
sleep 2
node scripts/android-check.js welcome-closed
resumed || { echo "back left the app with the welcome open"; exit 1; }
adb exec-out screencap -p > android-after-back.png

# With nothing open, back leaves the app.
adb shell input keyevent KEYCODE_BACK
sleep 2
if resumed; then echo "back with nothing open didn't leave the app"; exit 1; fi

adb logcat -d > android-logcat.txt
grep -q 'Registering plugin instance: TwilyteShare' android-logcat.txt
grep -q 'Registering plugin instance: TwilyteCalendar' android-logcat.txt
if grep -E 'FATAL EXCEPTION|AndroidRuntime: Process: info\.twilyte' android-logcat.txt; then exit 1; fi
echo "android launch check passed"
