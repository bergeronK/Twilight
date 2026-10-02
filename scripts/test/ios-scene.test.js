'use strict';
/*
 * The iPhone app runs in UIKit's scene life cycle (2026-10-02). Built with the
 * current Xcode, an app without it is stopped at launch: the owner's first
 * run on a device ended "Application failed to launch: UIScene life cycle is
 * required for apps built with this SDK". CI's simulator build compiled fine
 * all along, because it builds and never launches, so these checks pin the
 * pieces a launch needs: Capacitor 8.5 (the first with scene support), the
 * Info.plist manifest, a SceneDelegate in the App target, the AppDelegate
 * handing the scene to it, and the storyboard still loading the controller
 * that registers the CoreMotion plugin.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const NATIVE = path.join(__dirname, '..', '..', 'native');
const APP = path.join(NATIVE, 'ios', 'App', 'App');
const read = p => fs.readFileSync(p, 'utf8');
const plist = read(path.join(APP, 'Info.plist'));
const appDelegate = read(path.join(APP, 'AppDelegate.swift'));
const sceneFile = path.join(APP, 'SceneDelegate.swift');
const pbxproj = read(path.join(NATIVE, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'));

const atLeast = (v, min) => {
  const a = v.split('.').map(Number), b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

test('Capacitor is 8.5 or later, the same version in npm and in Swift Package Manager', () => {
  const lock = JSON.parse(read(path.join(NATIVE, 'package-lock.json')));
  const versions = ['core', 'ios', 'android', 'cli'].map(n => lock.packages[`node_modules/@capacitor/${n}`].version);
  for (const v of versions) assert.ok(atLeast(v, '8.5.0'), `Capacitor ${v} has no scene support (SceneDelegateProxy)`);
  const spm = read(path.join(NATIVE, 'ios', 'App', 'CapApp-SPM', 'Package.swift'))
    .match(/capacitor-swift-pm\.git", exact: "([\d.]+)"/)[1];
  assert.strictEqual(spm, versions[1], 'run npm run sync after changing Capacitor');
});

test('Info.plist declares one scene, run by SceneDelegate from the Main storyboard', () => {
  const manifest = plist.slice(plist.indexOf('<key>UIApplicationSceneManifest</key>'));
  assert.ok(plist.includes('<key>UIApplicationSceneManifest</key>'), 'no scene manifest: the app will not launch');
  assert.match(manifest, /<key>UIApplicationSupportsMultipleScenes<\/key>\s*<false\/>/);
  assert.match(manifest, /<key>UIWindowSceneSessionRoleApplication<\/key>\s*<array>\s*<dict>\s*<key>UISceneConfigurationName<\/key>\s*<string>Default Configuration<\/string>\s*<key>UISceneDelegateClassName<\/key>\s*<string>\$\(PRODUCT_MODULE_NAME\)\.SceneDelegate<\/string>\s*<key>UISceneStoryboardFile<\/key>\s*<string>Main<\/string>/);
});

test('the AppDelegate hands the scene to SceneDelegate, under the name Info.plist uses', () => {
  assert.match(appDelegate, /configurationForConnecting connectingSceneSession: UISceneSession,[\s\S]*?UISceneConfiguration\(name: "Default Configuration",\s*sessionRole: connectingSceneSession\.role\)[\s\S]*?config\.delegateClass = SceneDelegate\.self/);
  // URL opens arrive at the scene delegate under scenes; a copy left here would never run.
  assert.doesNotMatch(appDelegate, /open url: URL/);
  assert.doesNotMatch(appDelegate, /continue userActivity/);
});

test('SceneDelegate keeps the storyboard’s window and forwards to Capacitor', () => {
  const scene = read(sceneFile);
  assert.match(scene, /class SceneDelegate: UIResponder, UIWindowSceneDelegate \{\s*var window: UIWindow\?/);
  // A window made here would replace the storyboard's, and with it the
  // TwilyteBridgeViewController that registers the CoreMotion plugin.
  assert.doesNotMatch(scene, /UIWindow\(windowScene:|rootViewController\s*=/);
  for (const fn of ['willConnectTo session', 'openURLContexts URLContexts', 'continue userActivity']) {
    assert.ok(scene.includes(fn), fn);
  }
  assert.strictEqual((scene.match(/SceneDelegateProxy\.shared\.scene\(/g) || []).length, 3);
  const board = read(path.join(APP, 'Base.lproj', 'Main.storyboard'));
  assert.match(board, /initialViewController="BYZ-38-t0r"/);
  assert.match(board, /<viewController id="BYZ-38-t0r" customClass="TwilyteBridgeViewController" customModule="App"/);
});

test('SceneDelegate.swift is compiled into the App target', () => {
  const ref = pbxproj.match(/(\w{24}) \/\* SceneDelegate\.swift \*\/ = \{isa = PBXFileReference;[^}]*path = SceneDelegate\.swift;/);
  assert.ok(ref, 'no file reference');
  const build = pbxproj.match(new RegExp(`(\\w{24}) /\\* SceneDelegate\\.swift in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref[1]} `));
  assert.ok(build, 'no build file');
  const sources = pbxproj.match(/isa = PBXSourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/)[1];
  assert.ok(sources.includes(build[1]), 'not in the Sources phase');
  assert.ok(pbxproj.includes(`\t\t\t\t${ref[1]} /* SceneDelegate.swift */,\n`), 'not in the App group');
});
