import CoreImage
import Flutter
import FirebaseCore
import UIKit
import Vision

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let inviteQrDecoderChannelName = "gg.ai.privateclaw/invite_qr_decoder"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    configureFirebaseIfNeeded()
    GeneratedPluginRegistrant.register(with: self)
    registerInviteQrDecoder()
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

  private func registerInviteQrDecoder() {
    guard let controller = window?.rootViewController as? FlutterViewController else {
      NSLog("[privateclaw-app] Could not register invite QR decoder channel because the root FlutterViewController is missing.")
      return
    }

    let channel = FlutterMethodChannel(
      name: inviteQrDecoderChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "decodeImage" else {
        result(FlutterMethodNotImplemented)
        return
      }
      self?.decodeInviteQr(call: call, result: result)
    }
  }

  private func decodeInviteQr(call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard
      let arguments = call.arguments as? [String: Any],
      let path = arguments["path"] as? String,
      !path.isEmpty
    else {
      result(
        FlutterError(
          code: "bad_args",
          message: "Missing image path.",
          details: nil
        )
      )
      return
    }

    let imageURL = URL(fileURLWithPath: path)
    let ciImage =
      CIImage(contentsOf: imageURL) ??
      UIImage(contentsOfFile: path).flatMap { image in
        CIImage(image: image)
      }

    guard let ciImage else {
      result(
        FlutterError(
          code: "read_failed",
          message: "Couldn't read the selected image.",
          details: path
        )
      )
      return
    }

    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]

    do {
      let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
      try handler.perform([request])
    } catch {
      result(
        FlutterError(
          code: "decode_failed",
          message: error.localizedDescription,
          details: nil
        )
      )
      return
    }

    let payload = (request.results as? [VNBarcodeObservation])?
      .compactMap { observation in
        let value = observation.payloadStringValue?.trimmingCharacters(
          in: .whitespacesAndNewlines
        )
        return value?.isEmpty == false ? value : nil
      }
      .first

    result(payload)
  }
}
