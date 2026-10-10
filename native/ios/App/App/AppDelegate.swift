import UIKit
import Capacitor
import CoreMotion
import EventKit
import EventKitUI

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // The app runs in UIKit's scene life cycle (SceneDelegate.swift): the one
    // scene is Info.plist's "Default Configuration". Opened URLs and universal
    // links go to the scene delegate now, not to this class.
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}

// MARK: - Sky View orientation from CoreMotion

/// Sends Sky View the phone's orientation from CoreMotion's own sensor fusion
/// (gyroscope, accelerometer and compass, calibrated by iOS), referenced to
/// TRUE north, the way native sky apps get it. The website has only the
/// browser's angles plus a separate whole-degree compass heading, which is
/// magnetic and has to be fused by hand.
///
/// JS name `TwilyteMotion`: `start()`, `stop()`, and an `attitude` event of
///   r         CMAttitude.rotationMatrix, row-major (m11 m12 m13 m21 ... m33),
///             in the reference frame X = north, Z = up
///   g         gravity in the phone's frame (x right, y top, z out of the screen)
///   trueNorth whether that north is true (else magnetic: no location yet)
///   acc       magnetometer calibration: -1 uncalibrated, 0 low, 1 medium, 2 high
/// index.html's iosAttitudeToEnu turns r and g into the app's frame, using
/// gravity to settle which way round r goes rather than assuming it.
@objc(TwilyteMotionPlugin)
public class TwilyteMotionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TwilyteMotionPlugin"
    public let jsName = "TwilyteMotion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private let manager = CMMotionManager()

    @objc func start(_ call: CAPPluginCall) {
        guard manager.isDeviceMotionAvailable else {
            call.reject("Device motion is not available on this device")
            return
        }
        // True north needs the device's location (iOS uses it for the
        // declination); the app asks for location anyway. Without it, fall
        // back to magnetic north, which the web code then corrects itself.
        let trueNorth = CMMotionManager.availableAttitudeReferenceFrames().contains(.xTrueNorthZVertical)
        run(trueNorth: trueNorth)
        call.resolve(["trueNorth": trueNorth])
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stopDeviceMotionUpdates()
        call.resolve()
    }

    private func run(trueNorth: Bool) {
        manager.stopDeviceMotionUpdates()
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        // iOS's own figure-eight calibration prompt, when the compass needs it.
        manager.showsDeviceMovementDisplay = true
        let frame: CMAttitudeReferenceFrame = trueNorth ? .xTrueNorthZVertical : .xMagneticNorthZVertical
        manager.startDeviceMotionUpdates(using: frame, to: OperationQueue.main) { [weak self] motion, error in
            guard let self = self else { return }
            if let error = error as NSError?, trueNorth,
               error.domain == CMErrorDomain, error.code == Int(CMErrorTrueNorthNotAvailable.rawValue) {
                self.run(trueNorth: false)
                return
            }
            guard let m = motion else { return }
            let r = m.attitude.rotationMatrix
            let g = m.gravity
            self.notifyListeners("attitude", data: [
                "r": [r.m11, r.m12, r.m13, r.m21, r.m22, r.m23, r.m31, r.m32, r.m33],
                "g": [g.x, g.y, g.z],
                "trueNorth": trueNorth,
                "acc": Int(m.magneticField.accuracy.rawValue)
            ])
        }
    }
}

// MARK: - The share sheet

/// iOS's share sheet, for the Console's "Share tonight's sky". In the app the
/// web view's navigator.share did nothing (owner's iPhone, v153), and the
/// picture's download link has nowhere to save to, so the page hands the
/// picture and its words to this instead.
///
/// Also any other file the page makes that isn't for the calendar (the
/// Ephemeris's month as CSV): a download goes nowhere in the app either
/// (owner's iPhone, v161), and the sheet offers Save to Files and Numbers.
///
/// JS name `TwilyteShare`: `share({ text?, url?, image?, fileName?,
/// fileText? })`, `image` a PNG as base64 (no data: prefix), `fileText` the
/// file's text, saved as `fileName`. Resolves `{ completed }`, false when
/// the sheet is closed without sharing. "Save Image" in the sheet needs
/// NSPhotoLibraryAddUsageDescription in Info.plist.
@objc(TwilyteSharePlugin)
public class TwilyteSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TwilyteSharePlugin"
    public let jsName = "TwilyteShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    @objc func share(_ call: CAPPluginCall) {
        var items: [Any] = []
        if let b64 = call.getString("image"), let data = Data(base64Encoded: b64), let image = UIImage(data: data) {
            items.append(image)
        }
        if let text = call.getString("text"), !text.isEmpty {
            items.append(text)
        }
        if let s = call.getString("url"), let url = URL(string: s) {
            items.append(url)
        }
        // Written to the app's temporary folder under its own name, so Files
        // and Numbers get a real file called, say, twilight_2026-10.csv.
        if let name = call.getString("fileName"), let text = call.getString("fileText") {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent((name as NSString).lastPathComponent)
            do {
                try Data(text.utf8).write(to: url, options: .atomic)
                items.append(url)
            } catch {
                call.reject("Couldn't write \(name)")
                return
            }
        }
        if items.isEmpty {
            call.reject("Nothing to share")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.bridge?.viewController else {
                call.reject("No view to share from")
                return
            }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, completed, _, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            // On an iPad the sheet is a popover, which UIKit refuses to show
            // unless it is anchored somewhere: the middle of the screen.
            if let pop = sheet.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 0, height: 0)
                pop.permittedArrowDirections = []
            }
            vc.present(sheet, animated: true)
        }
    }
}

// MARK: - Calendar

/// Calendar events for the "Add to calendar" buttons (the Console's sunset
/// and sunrise, the sextant window) and the Ephemeris's month export. The
/// website downloads an .ics file for each; in the app a download goes
/// nowhere (owner's iPhone, v161: none of them did anything), so the page
/// reads its own .ics into events (`icsEvents` in index.html) and sends
/// them here.
///
/// - One event: iOS's own event editor, filled in, to check and Add. From
///   iOS 17 the editor runs outside the app and needs no permission (Apple's
///   TN3152: an app that only lets people create events shouldn't ask for
///   access); on iOS 15 and 16 it needs calendar access first.
/// - Several (a month's export): "Add 30 events to your calendar?", then
///   write-only access (the app can add events, never read them), then all
///   of them into the default calendar, and a note saying it's done.
///
/// JS name `TwilyteCalendar`: `add({ events: [{ title, start, end, notes?,
/// alarm? }] })`, start and end in ms since 1970, alarm in minutes before
/// the start. Resolves `{ added }`, how many were added (0 if cancelled or
/// refused). Info.plist: NSCalendarsWriteOnlyAccessUsageDescription (iOS
/// 17+) and NSCalendarsUsageDescription (iOS 15 and 16).
@objc(TwilyteCalendarPlugin)
public class TwilyteCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "TwilyteCalendarPlugin"
    public let jsName = "TwilyteCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise)
    ]
    private let store = EKEventStore()
    private var editing: CAPPluginCall?

    private struct Event {
        let title: String
        let start: Date
        let end: Date
        let notes: String?
        let alarm: Double?
    }

    private func number(_ v: JSValue?) -> Double? {
        if let n = v as? NSNumber { return n.doubleValue }
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        return nil
    }

    @objc func add(_ call: CAPPluginCall) {
        let events: [Event] = (call.getArray("events", JSObject.self) ?? []).compactMap { o in
            guard let s = number(o["start"]), let e = number(o["end"]), e >= s else { return nil }
            let notes = o["notes"] as? String
            return Event(title: (o["title"] as? String) ?? "Twilyte",
                         start: Date(timeIntervalSince1970: s / 1000),
                         end: Date(timeIntervalSince1970: e / 1000),
                         notes: notes?.isEmpty == false ? notes : nil,
                         alarm: number(o["alarm"]))
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else {
                call.reject("No view to show the calendar from")
                return
            }
            if events.isEmpty {
                self.tell(vc, "Nothing to add", "There are no events in the dates shown.")
                call.resolve(["added": 0])
            } else if events.count == 1 {
                self.edit(events[0], from: vc, call)
            } else {
                self.confirm(events, from: vc, call)
            }
        }
    }

    private func make(_ e: Event) -> EKEvent {
        let ev = EKEvent(eventStore: store)
        ev.title = e.title
        ev.startDate = e.start
        ev.endDate = e.end
        ev.notes = e.notes
        if let m = e.alarm { ev.addAlarm(EKAlarm(relativeOffset: -m * 60)) }
        return ev
    }

    // One event: the editor, so the calendar and the reminder can be changed
    // before it's added.
    private func edit(_ e: Event, from vc: UIViewController, _ call: CAPPluginCall) {
        let open = {
            let ed = EKEventEditViewController()
            ed.eventStore = self.store
            ed.event = self.make(e)
            ed.editViewDelegate = self
            self.editing = call
            self.top(vc).present(ed, animated: true)
        }
        if #available(iOS 17.0, *) {
            open()
        } else {
            store.requestAccess(to: .event) { ok, _ in
                DispatchQueue.main.async {
                    if ok { open() } else { self.denied(vc); call.resolve(["added": 0]) }
                }
            }
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController,
                                        didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        editing?.resolve(["added": action == .saved ? 1 : 0])
        editing = nil
    }

    // Several: ask first, since a month can be dozens of events.
    private func confirm(_ events: [Event], from vc: UIViewController, _ call: CAPPluginCall) {
        let ask = UIAlertController(title: "Add \(events.count) events to your calendar?",
                                    message: "They go into your default calendar.",
                                    preferredStyle: .alert)
        ask.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in call.resolve(["added": 0]) })
        ask.addAction(UIAlertAction(title: "Add", style: .default) { _ in
            self.access { ok in
                if ok { self.saveAll(events, from: vc, call) } else { self.denied(vc); call.resolve(["added": 0]) }
            }
        })
        top(vc).present(ask, animated: true)
    }

    private func access(_ done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            store.requestWriteOnlyAccessToEvents { ok, _ in DispatchQueue.main.async { done(ok) } }
        } else {
            store.requestAccess(to: .event) { ok, _ in DispatchQueue.main.async { done(ok) } }
        }
    }

    private func saveAll(_ events: [Event], from vc: UIViewController, _ call: CAPPluginCall) {
        guard let cal = store.defaultCalendarForNewEvents else {
            tell(vc, "No calendar to add to", "Choose a default calendar in Settings, under Calendar.")
            call.resolve(["added": 0])
            return
        }
        do {
            for e in events {
                let ev = make(e)
                ev.calendar = cal
                try store.save(ev, span: .thisEvent, commit: false)
            }
            try store.commit()
        } catch {
            store.reset()
            tell(vc, "Couldn't add them", error.localizedDescription)
            call.resolve(["added": 0])
            return
        }
        tell(vc, "Added \(events.count) events", "They're in your calendar.")
        call.resolve(["added": events.count])
    }

    private func denied(_ vc: UIViewController) {
        let a = UIAlertController(title: "Twilyte can't add to your calendar",
                                  message: "Allow it in Settings, under Twilyte, then Calendars.",
                                  preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Not Now", style: .cancel))
        a.addAction(UIAlertAction(title: "Open Settings", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        top(vc).present(a, animated: true)
    }

    private func tell(_ vc: UIViewController, _ title: String, _ message: String) {
        let a = UIAlertController(title: title, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default))
        top(vc).present(a, animated: true)
    }

    // Whatever is showing on top of the web view (UIKit won't present over a
    // controller that is already presenting something).
    private func top(_ vc: UIViewController) -> UIViewController {
        var t = vc
        while let p = t.presentedViewController, !p.isBeingDismissed { t = p }
        return t
    }
}

/// The app's web view controller: Capacitor's own, plus the plugins above,
/// registered before the page loads. Main.storyboard names this class.
class TwilyteBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TwilyteMotionPlugin())
        bridge?.registerPluginInstance(TwilyteSharePlugin())
        bridge?.registerPluginInstance(TwilyteCalendarPlugin())
    }
}
