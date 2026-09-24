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

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
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

/// The app's web view controller: Capacitor's own, plus the plugin above,
/// registered before the page loads. Main.storyboard names this class.
class TwilyteBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TwilyteMotionPlugin())
    }
}
