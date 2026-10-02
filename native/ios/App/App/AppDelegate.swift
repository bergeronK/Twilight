import UIKit
import Capacitor
import CoreMotion

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
/// JS name `TwilyteShare`: `share({ text?, url?, image? })`, `image` a PNG as
/// base64 (no data: prefix). Resolves `{ completed }`, false when the sheet
/// is closed without sharing. "Save Image" in the sheet needs
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

/// The app's web view controller: Capacitor's own, plus the plugins above,
/// registered before the page loads. Main.storyboard names this class.
class TwilyteBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TwilyteMotionPlugin())
        bridge?.registerPluginInstance(TwilyteSharePlugin())
    }
}
