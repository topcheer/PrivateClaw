import Flutter
import UIKit
import UserNotifications

public class PrivateClawLocalNotificationsPlugin: NSObject, FlutterPlugin {
  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "gg.ai.privateclaw/local_notifications",
      binaryMessenger: registrar.messenger()
    )
    let instance = PrivateClawLocalNotificationsPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "show":
      showNotification(call, result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func showNotification(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard
      let arguments = call.arguments as? [String: Any],
      let notificationId = arguments["id"] as? Int,
      let title = arguments["title"] as? String,
      let body = arguments["body"] as? String,
      !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      result(
        FlutterError(
          code: "invalid_args",
          message: "Notification id, title, and body are required.",
          details: nil
        )
      )
      return
    }

    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    if let payload = arguments["payload"] as? String, !payload.isEmpty {
      content.userInfo = ["payload": payload]
    }

    let request = UNNotificationRequest(
      identifier: "privateclaw.\(notificationId)",
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request) { error in
      if let error {
        result(
          FlutterError(
            code: "notification_failed",
            message: error.localizedDescription,
            details: nil
          )
        )
        return
      }
      result(nil)
    }
  }
}
