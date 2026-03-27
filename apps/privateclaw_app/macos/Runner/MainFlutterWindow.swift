import Cocoa
import AVFoundation
import FlutterMacOS
import UserNotifications
import audio_session
import file_picker
import file_selector_macos
import just_audio
import mobile_scanner
import path_provider_foundation
import photo_manager
import url_launcher_macos
import video_player_avfoundation

private func registerPrivateClawDesktopPlugins(
  registry: FlutterPluginRegistry
) {
  AudioSessionPlugin.register(
    with: registry.registrar(forPlugin: "AudioSessionPlugin")
  )
  FilePickerPlugin.register(
    with: registry.registrar(forPlugin: "FilePickerPlugin")
  )
  FileSelectorPlugin.register(
    with: registry.registrar(forPlugin: "FileSelectorPlugin")
  )
  JustAudioPlugin.register(
    with: registry.registrar(forPlugin: "JustAudioPlugin")
  )
  MobileScannerPlugin.register(
    with: registry.registrar(forPlugin: "MobileScannerPlugin")
  )
  PathProviderPlugin.register(
    with: registry.registrar(forPlugin: "PathProviderPlugin")
  )
  PhotoManagerPlugin.register(
    with: registry.registrar(forPlugin: "PhotoManagerPlugin")
  )
  UrlLauncherPlugin.register(
    with: registry.registrar(forPlugin: "UrlLauncherPlugin")
  )
  FVPVideoPlayerPlugin.register(
    with: registry.registrar(forPlugin: "FVPVideoPlayerPlugin")
  )
}

private final class PrivateClawLocalNotificationsBridge: NSObject,
  UNUserNotificationCenterDelegate
{
  private let channel: FlutterMethodChannel
  private weak var window: NSWindow?

  init(binaryMessenger: FlutterBinaryMessenger, window: NSWindow) {
    self.channel = FlutterMethodChannel(
      name: "gg.ai.privateclaw/local_notifications",
      binaryMessenger: binaryMessenger
    )
    self.window = window
    super.init()
    if #available(macOS 10.14, *) {
      UNUserNotificationCenter.current().delegate = self
    }
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(
          FlutterError(
            code: "unavailable",
            message: "The local notifications bridge is unavailable.",
            details: nil
          )
        )
        return
      }
      switch call.method {
      case "requestPermission":
        self.requestPermission(result: result)
      case "show":
        self.showNotification(call: call, result: result)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func requestPermission(result: @escaping FlutterResult) {
    guard #available(macOS 10.14, *) else {
      result(false)
      return
    }
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound]
    ) { granted, error in
      DispatchQueue.main.async {
        if let error {
          result(
            FlutterError(
              code: "permission_failed",
              message: error.localizedDescription,
              details: nil
            )
          )
          return
        }
        result(granted)
      }
    }
  }

  private func showNotification(
    call: FlutterMethodCall,
    result: @escaping FlutterResult
  ) {
    guard #available(macOS 10.14, *) else {
      result(
        FlutterError(
          code: "unsupported",
          message: "Local notifications require macOS 10.14 or newer.",
          details: nil
        )
      )
      return
    }
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
      DispatchQueue.main.async {
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

  @available(macOS 10.14, *)
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    DispatchQueue.main.async {
      if response.notification.request.identifier.hasPrefix("privateclaw.") {
        NSApplication.shared.unhide(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        self.window?.makeKeyAndOrderFront(nil)
        self.window?.orderFrontRegardless()
      }
      completionHandler()
    }
  }
}

private final class PrivateClawAudioRecorderBridge: NSObject {
  private let channel: FlutterMethodChannel
  private let minimumVoiceRecordingDuration: TimeInterval = 0.3
  private var audioRecorder: AVAudioRecorder?
  private var audioRecorderUrl: URL?
  private var audioRecorderStartedAt: Date?

  init(binaryMessenger: FlutterBinaryMessenger) {
    self.channel = FlutterMethodChannel(
      name: "gg.ai.privateclaw/audio_recorder",
      binaryMessenger: binaryMessenger
    )
    super.init()
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(
          FlutterError(
            code: "unavailable",
            message: "The audio recorder bridge is unavailable.",
            details: nil
          )
        )
        return
      }
      switch call.method {
      case "startRecording":
        self.startRecording(result: result)
      case "stopRecording":
        self.stopRecording(discard: false, result: result)
      case "cancelRecording":
        self.stopRecording(discard: true, result: result)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func startRecording(result: @escaping FlutterResult) {
    guard audioRecorder == nil else {
      result(
        FlutterError(
          code: "busy",
          message: "A voice recording is already in progress.",
          details: nil
        )
      )
      return
    }

    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      beginRecording(result: result)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
        DispatchQueue.main.async {
          guard let self else {
            result(
              FlutterError(
                code: "unavailable",
                message: "The audio recorder bridge is unavailable.",
                details: nil
              )
            )
            return
          }
          if granted {
            self.beginRecording(result: result)
            return
          }
          result(
            FlutterError(
              code: "permission_denied",
              message: "Microphone permission is required to record voice messages.",
              details: nil
            )
          )
        }
      }
    case .denied, .restricted:
      result(
        FlutterError(
          code: "permission_denied",
          message: "Microphone permission is required to record voice messages.",
          details: nil
        )
      )
    @unknown default:
      result(
        FlutterError(
          code: "recorder_unavailable",
          message: "Microphone access is unavailable on this device.",
          details: nil
        )
      )
    }
  }

  private func beginRecording(result: @escaping FlutterResult) {
    let recordingsDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("privateclaw-recordings", isDirectory: true)
    let outputUrl = recordingsDirectory
      .appendingPathComponent("voice-note-\(timestampForRecording()).m4a")

    do {
      try FileManager.default.createDirectory(
        at: recordingsDirectory,
        withIntermediateDirectories: true,
        attributes: nil
      )
      let recorder = try AVAudioRecorder(
        url: outputUrl,
        settings: [
          AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
          AVSampleRateKey: 44_100,
          AVNumberOfChannelsKey: 1,
          AVEncoderBitRateKey: 64_000,
          AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]
      )
      guard recorder.prepareToRecord(), recorder.record() else {
        throw NSError(
          domain: "gg.ai.privateclaw.audio_recorder",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "Unable to start the voice recorder."]
        )
      }

      audioRecorder = recorder
      audioRecorderUrl = outputUrl
      audioRecorderStartedAt = Date()
      result(nil)
    } catch {
      cleanupRecordingFile(url: outputUrl)
      audioRecorder = nil
      audioRecorderUrl = nil
      audioRecorderStartedAt = nil
      result(
        FlutterError(
          code: "recorder_unavailable",
          message: error.localizedDescription,
          details: nil
        )
      )
    }
  }

  private func stopRecording(
    discard: Bool,
    result: @escaping FlutterResult
  ) {
    guard let recorder = audioRecorder else {
      if discard {
        result(nil)
      } else {
        result(
          FlutterError(
            code: "not_recording",
            message: "No voice recording is active.",
            details: nil
          )
        )
      }
      return
    }

    let outputUrl = audioRecorderUrl
    let startedAt = audioRecorderStartedAt
    audioRecorder = nil
    audioRecorderUrl = nil
    audioRecorderStartedAt = nil

    recorder.stop()

    guard let outputUrl else {
      if discard {
        result(nil)
      } else {
        result(
          FlutterError(
            code: "recording_failed",
            message: "Voice recording output is unavailable.",
            details: nil
          )
        )
      }
      return
    }

    let duration = startedAt.map { Date().timeIntervalSince($0) } ?? 0
    let sizeBytes = recordingFileSize(at: outputUrl)
    if discard {
      cleanupRecordingFile(url: outputUrl)
      result(nil)
      return
    }
    if duration < minimumVoiceRecordingDuration || sizeBytes <= 0 {
      cleanupRecordingFile(url: outputUrl)
      result(
        FlutterError(
          code: "recording_too_short",
          message: "Hold to record a little longer before releasing.",
          details: nil
        )
      )
      return
    }

    result([
      "path": outputUrl.path,
      "mimeType": "audio/mp4"
    ])
  }

  private func cleanupRecordingFile(url: URL?) {
    guard let url else {
      return
    }
    try? FileManager.default.removeItem(at: url)
  }

  private func recordingFileSize(at url: URL) -> Int64 {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attributes?[.size] as? NSNumber)?.int64Value ?? 0
  }

  private func timestampForRecording() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date()).replacingOccurrences(of: ":", with: "-")
  }
}

class MainFlutterWindow: NSWindow, NSWindowDelegate {
  private var audioRecorderBridge: PrivateClawAudioRecorderBridge?
  private var localNotificationsBridge: PrivateClawLocalNotificationsBridge?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    // Desktop push is intentionally mobile-only today. Skipping the Firebase
    // macOS plugins avoids their unused startup keychain work and the
    // resulting non-fatal OSStatus warning at launch.
    registerPrivateClawDesktopPlugins(registry: flutterViewController)
    audioRecorderBridge = PrivateClawAudioRecorderBridge(
      binaryMessenger: flutterViewController.engine.binaryMessenger
    )
    localNotificationsBridge = PrivateClawLocalNotificationsBridge(
      binaryMessenger: flutterViewController.engine.binaryMessenger,
      window: self
    )

    super.awakeFromNib()
    delegate = self
    (NSApp.delegate as? AppDelegate)?.ensureStatusItem()
  }

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    guard let appDelegate = NSApp.delegate as? AppDelegate else {
      return true
    }
    if appDelegate.shouldAllowMainWindowClose {
      return true
    }
    appDelegate.hideMainWindow()
    return false
  }
}
