import Flutter
import FirebaseCore
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    configureFirebaseIfNeeded()
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func configureFirebaseIfNeeded() {
    guard FirebaseApp.app() == nil else {
      return
    }
    guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
      NSLog("[privateclaw-app] GoogleService-Info.plist not bundled; Firebase push is disabled for this iOS build.")
      return
    }
    FirebaseApp.configure()
  }
}
