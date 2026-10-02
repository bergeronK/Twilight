import UIKit
import Capacitor

/// The app's one window, in UIKit's scene life cycle. Apps built with the
/// current iOS SDK must use it: without it the app is stopped at launch
/// ("UIScene life cycle is required for apps built with this SDK").
///
/// UIKit builds the window itself from Main.storyboard (UISceneStoryboardFile
/// in Info.plist), whose controller is TwilyteBridgeViewController, so the
/// CoreMotion plugin is registered exactly as before. Opened URLs and
/// universal links now arrive here rather than in AppDelegate, and go to
/// Capacitor's SceneDelegateProxy, as Capacitor 8.5's own template does.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
