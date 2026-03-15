import CoreImage
import AVFoundation
import Flutter
import FirebaseCore
import UIKit
import UserNotifications
import Vision

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let inviteQrDecoderChannelName = "gg.ai.privateclaw/invite_qr_decoder"
  private let localNotificationsChannelName = "gg.ai.privateclaw/local_notifications"
  private let pathProviderGetDirectoryPathChannelName =
    "dev.flutter.pigeon.path_provider_foundation.PathProviderApi.getDirectoryPath"
  private let pathProviderGetContainerPathChannelName =
    "dev.flutter.pigeon.path_provider_foundation.PathProviderApi.getContainerPath"
  private var pendingInviteCameraResult: FlutterResult?
  private weak var inviteScannerController: PrivateClawInviteScannerViewController?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    configureFirebaseIfNeeded()
    GeneratedPluginRegistrant.register(with: self)
    registerInviteQrDecoder()
    registerLocalNotificationsFallback()
    registerPathProviderFallback()
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
      guard let self else {
        result(
          FlutterError(
            code: "unavailable",
            message: "The app delegate is unavailable.",
            details: nil
          )
        )
        return
      }

      switch call.method {
      case "decodeImage":
        self.decodeInviteQr(call: call, result: result)
      case "captureInviteFromCamera":
        self.captureInviteFromCamera(result: result)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func registerPathProviderFallback() {
    guard let controller = window?.rootViewController as? FlutterViewController else {
      NSLog("[privateclaw-app] Could not register iOS path provider fallback because the root FlutterViewController is missing.")
      return
    }

    let getDirectoryPathChannel = FlutterBasicMessageChannel(
      name: pathProviderGetDirectoryPathChannelName,
      binaryMessenger: controller.binaryMessenger,
      codec: PrivateClawPathProviderPigeonCodec.shared
    )
    getDirectoryPathChannel.setMessageHandler { [weak self] message, reply in
      guard let self else {
        reply(privateClawWrapPigeonError(code: "unavailable", message: "The app delegate is unavailable.", details: nil))
        return
      }
      guard
        let args = message as? [Any?],
        let directoryType = args.first as? PrivateClawPathProviderDirectoryType
      else {
        reply(
          privateClawWrapPigeonError(
            code: "bad_args",
            message: "Missing or invalid directory type.",
            details: nil
          )
        )
        return
      }

      reply(privateClawWrapPigeonResult(self.pathProviderDirectoryPath(for: directoryType)))
    }

    let getContainerPathChannel = FlutterBasicMessageChannel(
      name: pathProviderGetContainerPathChannelName,
      binaryMessenger: controller.binaryMessenger,
      codec: PrivateClawPathProviderPigeonCodec.shared
    )
    getContainerPathChannel.setMessageHandler { [weak self] message, reply in
      guard let self else {
        reply(privateClawWrapPigeonError(code: "unavailable", message: "The app delegate is unavailable.", details: nil))
        return
      }
      guard
        let args = message as? [Any?],
        let appGroupIdentifier = args.first as? String
      else {
        reply(
          privateClawWrapPigeonError(
            code: "bad_args",
            message: "Missing app group identifier.",
            details: nil
          )
        )
        return
      }

      reply(privateClawWrapPigeonResult(self.pathProviderContainerPath(appGroupIdentifier: appGroupIdentifier)))
    }
  }

  private func registerLocalNotificationsFallback() {
    guard let controller = window?.rootViewController as? FlutterViewController else {
      NSLog("[privateclaw-app] Could not register local notifications fallback because the root FlutterViewController is missing.")
      return
    }

    let channel = FlutterMethodChannel(
      name: localNotificationsChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "show":
        self.showLocalNotification(call: call, result: result)
      default:
        result(FlutterMethodNotImplemented)
      }
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

    do {
      result(try decodeInvitePayload(from: ciImage))
    } catch {
      result(
        FlutterError(
          code: "decode_failed",
          message: error.localizedDescription,
          details: nil
        )
      )
    }
  }

  private func captureInviteFromCamera(result: @escaping FlutterResult) {
    guard pendingInviteCameraResult == nil else {
      result(
        FlutterError(
          code: "busy",
          message: "A camera capture is already in progress.",
          details: nil
        )
      )
      return
    }

    let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    switch authorizationStatus {
    case .authorized:
      presentInviteLiveScanner(result: result)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        DispatchQueue.main.async {
          guard let self else {
            result(
              FlutterError(
                code: "unavailable",
                message: "The app delegate is unavailable.",
                details: nil
              )
            )
            return
          }
          if granted {
            self.presentInviteLiveScanner(result: result)
          } else {
            result(
              FlutterError(
                code: "permission_denied",
                message: "Camera permission is required to scan QR codes.",
                details: nil
              )
            )
          }
        }
      }
    case .denied, .restricted:
      result(
        FlutterError(
          code: "permission_denied",
          message: "Camera permission is required to scan QR codes.",
          details: nil
        )
      )
    @unknown default:
      result(
        FlutterError(
          code: "camera_unavailable",
          message: "The camera is unavailable on this device.",
          details: nil
        )
      )
    }
  }

  private func presentInviteLiveScanner(result: @escaping FlutterResult) {
    guard AVCaptureDevice.default(for: .video) != nil else {
      result(
        FlutterError(
          code: "camera_unavailable",
          message: "The camera is unavailable on this device.",
          details: nil
        )
      )
      return
    }
    guard let controller = window?.rootViewController else {
      result(
        FlutterError(
          code: "unavailable",
          message: "Could not access the root view controller.",
          details: nil
        )
      )
      return
    }

    pendingInviteCameraResult = result
    let scannerController = PrivateClawInviteScannerViewController()
    scannerController.modalPresentationStyle = .fullScreen
    scannerController.onDetected = { [weak self] value in
      self?.finishInviteCameraRequest(value: value)
    }
    scannerController.onCancel = { [weak self] in
      self?.finishInviteCameraRequest(
        error: FlutterError(
          code: "cancelled",
          message: "The camera capture was cancelled.",
          details: nil
        )
      )
    }
    scannerController.onFailure = { [weak self] code, message in
      self?.finishInviteCameraRequest(
        error: FlutterError(code: code, message: message, details: nil)
      )
    }
    inviteScannerController = scannerController
    topPresentedViewController(from: controller).present(
      scannerController,
      animated: true
    )
  }

  private func finishInviteCameraRequest(
    value: String? = nil,
    error: FlutterError? = nil
  ) {
    guard let result = pendingInviteCameraResult else {
      return
    }
    pendingInviteCameraResult = nil
    inviteScannerController = nil
    if let error {
      result(error)
      return
    }
    result(value)
  }

  private func topPresentedViewController(from controller: UIViewController) -> UIViewController {
    var topController = controller
    while let presentedViewController = topController.presentedViewController {
      topController = presentedViewController
    }
    return topController
  }

  private func decodeInvitePayload(from ciImage: CIImage) throws -> String? {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]

    let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
    try handler.perform([request])

    return (request.results as? [VNBarcodeObservation])?
      .compactMap { observation in
        let value = observation.payloadStringValue?.trimmingCharacters(
          in: .whitespacesAndNewlines
        )
        return value?.isEmpty == false ? value : nil
      }
      .first
  }

  private func showLocalNotification(call: FlutterMethodCall, result: @escaping FlutterResult) {
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

  private func pathProviderDirectoryPath(for type: PrivateClawPathProviderDirectoryType) -> String? {
    let searchPathDirectory: FileManager.SearchPathDirectory
    switch type {
    case .applicationCache:
      searchPathDirectory = .cachesDirectory
    case .applicationDocuments:
      searchPathDirectory = .documentDirectory
    case .applicationSupport:
      searchPathDirectory = .applicationSupportDirectory
    case .downloads:
      searchPathDirectory = .downloadsDirectory
    case .library:
      searchPathDirectory = .libraryDirectory
    case .temp:
      searchPathDirectory = .cachesDirectory
    }

    return NSSearchPathForDirectoriesInDomains(
      searchPathDirectory,
      .userDomainMask,
      true
    ).first
  }

  private func pathProviderContainerPath(appGroupIdentifier: String) -> String? {
    FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    )?.path
  }
}

private enum PrivateClawPathProviderDirectoryType: Int {
  case applicationDocuments = 0
  case applicationSupport = 1
  case downloads = 2
  case library = 3
  case temp = 4
  case applicationCache = 5
}

private final class PrivateClawPathProviderCodecReader: FlutterStandardReader {
  override func readValue(ofType type: UInt8) -> Any? {
    switch type {
    case 129:
      guard let rawValue = readValue() as? Int else {
        return nil
      }
      return PrivateClawPathProviderDirectoryType(rawValue: rawValue)
    default:
      return super.readValue(ofType: type)
    }
  }
}

private final class PrivateClawPathProviderCodecWriter: FlutterStandardWriter {
  override func writeValue(_ value: Any) {
    if let value = value as? PrivateClawPathProviderDirectoryType {
      super.writeByte(129)
      super.writeValue(value.rawValue)
      return
    }
    super.writeValue(value)
  }
}

private final class PrivateClawPathProviderCodecReaderWriter: FlutterStandardReaderWriter {
  override func reader(with data: Data) -> FlutterStandardReader {
    PrivateClawPathProviderCodecReader(data: data)
  }

  override func writer(with data: NSMutableData) -> FlutterStandardWriter {
    PrivateClawPathProviderCodecWriter(data: data)
  }
}

private final class PrivateClawPathProviderPigeonCodec: FlutterStandardMessageCodec, @unchecked Sendable {
  static let shared = PrivateClawPathProviderPigeonCodec(
    readerWriter: PrivateClawPathProviderCodecReaderWriter()
  )
}

private func privateClawWrapPigeonResult(_ result: Any?) -> [Any?] {
  [result]
}

private func privateClawWrapPigeonError(code: String, message: String?, details: Any?) -> [Any?] {
  [code, message, details]
}

private final class PrivateClawInviteScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  var onDetected: ((String) -> Void)?
  var onCancel: (() -> Void)?
  var onFailure: ((String, String) -> Void)?

  private let captureSession = AVCaptureSession()
  private let sessionQueue = DispatchQueue(
    label: "gg.ai.privateclaw.invite_scanner_session"
  )
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var completionTriggered = false
  private var configurationError: (code: String, message: String)?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureChrome()
    configureCaptureSession()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if let configurationError {
      complete {
        self.onFailure?(configurationError.code, configurationError.message)
      }
      return
    }
    sessionQueue.async {
      if !self.captureSession.isRunning {
        self.captureSession.startRunning()
      }
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    stopCaptureSession()
  }

  private func configureChrome() {
    let cancelButton = UIButton(type: .system)
    cancelButton.translatesAutoresizingMaskIntoConstraints = false
    cancelButton.configuration = .tinted()
    cancelButton.configuration?.title = "Close"
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

    let titleLabel = UILabel()
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = "Scan QR code"
    titleLabel.textColor = .white
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center

    let subtitleLabel = UILabel()
    subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
    subtitleLabel.text = "Point the camera at a PrivateClaw invite QR code."
    subtitleLabel.textColor = .white
    subtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
    subtitleLabel.textAlignment = .center
    subtitleLabel.numberOfLines = 0

    let overlayView = UIView()
    overlayView.translatesAutoresizingMaskIntoConstraints = false
    overlayView.backgroundColor = UIColor.black.withAlphaComponent(0.2)
    overlayView.layer.borderColor = UIColor.white.withAlphaComponent(0.75).cgColor
    overlayView.layer.borderWidth = 2
    overlayView.layer.cornerRadius = 24

    view.addSubview(cancelButton)
    view.addSubview(titleLabel)
    view.addSubview(subtitleLabel)
    view.addSubview(overlayView)

    NSLayoutConstraint.activate([
      cancelButton.leadingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.leadingAnchor,
        constant: 16
      ),
      cancelButton.topAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.topAnchor,
        constant: 16
      ),

      titleLabel.leadingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.leadingAnchor,
        constant: 24
      ),
      titleLabel.trailingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.trailingAnchor,
        constant: -24
      ),
      titleLabel.topAnchor.constraint(
        equalTo: cancelButton.bottomAnchor,
        constant: 20
      ),

      subtitleLabel.leadingAnchor.constraint(
        equalTo: titleLabel.leadingAnchor
      ),
      subtitleLabel.trailingAnchor.constraint(
        equalTo: titleLabel.trailingAnchor
      ),
      subtitleLabel.topAnchor.constraint(
        equalTo: titleLabel.bottomAnchor,
        constant: 8
      ),

      overlayView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      overlayView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      overlayView.widthAnchor.constraint(
        equalTo: view.widthAnchor,
        multiplier: 0.72
      ),
      overlayView.heightAnchor.constraint(equalTo: overlayView.widthAnchor),
    ])
  }

  private func configureCaptureSession() {
    guard let camera = AVCaptureDevice.default(for: .video) else {
      configurationError = (
        code: "camera_unavailable",
        message: "The camera is unavailable on this device."
      )
      return
    }

    do {
      let input = try AVCaptureDeviceInput(device: camera)
      guard captureSession.canAddInput(input) else {
        configurationError = (
          code: "camera_unavailable",
          message: "The camera input could not be configured."
        )
        return
      }
      captureSession.addInput(input)

      let metadataOutput = AVCaptureMetadataOutput()
      guard captureSession.canAddOutput(metadataOutput) else {
        configurationError = (
          code: "camera_unavailable",
          message: "The camera output could not be configured."
        )
        return
      }
      captureSession.addOutput(metadataOutput)
      metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
      let supportedTypes = metadataOutput.availableMetadataObjectTypes
      guard supportedTypes.contains(.qr) else {
        configurationError = (
          code: "camera_unavailable",
          message: "QR scanning is unavailable on this device."
        )
        return
      }
      metadataOutput.metadataObjectTypes = [.qr]

      let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
      previewLayer.videoGravity = .resizeAspectFill
      previewLayer.frame = view.bounds
      view.layer.insertSublayer(previewLayer, at: 0)
      self.previewLayer = previewLayer
    } catch {
      configurationError = (
        code: "camera_unavailable",
        message: error.localizedDescription
      )
    }
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    for case let metadataObject as AVMetadataMachineReadableCodeObject in metadataObjects {
      let value = metadataObject.stringValue?.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      guard let value, !value.isEmpty else {
        continue
      }
      complete {
        self.onDetected?(value)
      }
      return
    }
  }

  @objc private func cancelTapped() {
    complete {
      self.onCancel?()
    }
  }

  private func complete(_ handler: @escaping () -> Void) {
    guard !completionTriggered else {
      return
    }
    completionTriggered = true
    stopCaptureSession()
    dismiss(animated: true, completion: handler)
  }

  private func stopCaptureSession() {
    sessionQueue.async {
      if self.captureSession.isRunning {
        self.captureSession.stopRunning()
      }
    }
  }
}
