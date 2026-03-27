import Cocoa
import FlutterMacOS

@main
class AppDelegate: FlutterAppDelegate {
  private var shouldCloseMainWindow = false
  private var statusItem: NSStatusItem?

  override func applicationDidFinishLaunching(_ notification: Notification) {
    super.applicationDidFinishLaunching(notification)
    ensureStatusItem()
    DispatchQueue.main.async { [weak self] in
      self?.ensureStatusItem()
    }
  }

  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return false
  }

  override func applicationShouldHandleReopen(
    _ sender: NSApplication,
    hasVisibleWindows flag: Bool
  ) -> Bool {
    if !flag {
      showMainWindow(nil)
    }
    return true
  }

  override func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    shouldCloseMainWindow = true
    return .terminateNow
  }

  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    return true
  }

  var shouldAllowMainWindowClose: Bool {
    shouldCloseMainWindow
  }

  func hideMainWindow() {
    mainFlutterWindow?.orderOut(nil)
  }

  @objc func showMainWindow(_ sender: Any?) {
    guard let window = mainFlutterWindow else {
      return
    }
    NSApp.unhide(nil)
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
  }

  @objc private func hideApplication(_ sender: Any?) {
    hideMainWindow()
  }

  @objc private func quitApplication(_ sender: Any?) {
    shouldCloseMainWindow = true
    NSApp.terminate(nil)
  }

  private var applicationName: String {
    guard
      let name = Bundle.main.object(forInfoDictionaryKey: kCFBundleNameKey as String) as? String,
      !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return "PrivateClaw"
    }
    return name
  }

  func ensureStatusItem() {
    let statusItem = self.statusItem ?? NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem.isVisible = true
    if let button = statusItem.button {
      button.imagePosition = .imageLeading
      button.imageScaling = .scaleProportionallyDown
      button.title = "PC"
      button.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
      button.image = makeStatusItemImage()
      button.toolTip = applicationName
    }

    let menu = NSMenu()
    let openItem = NSMenuItem(
      title: "Open \(applicationName)",
      action: #selector(showMainWindow(_:)),
      keyEquivalent: ""
    )
    openItem.target = self
    menu.addItem(openItem)

    let hideItem = NSMenuItem(
      title: "Hide \(applicationName)",
      action: #selector(hideApplication(_:)),
      keyEquivalent: ""
    )
    hideItem.target = self
    menu.addItem(hideItem)

    menu.addItem(.separator())

    let quitItem = NSMenuItem(
      title: "Quit \(applicationName)",
      action: #selector(quitApplication(_:)),
      keyEquivalent: "q"
    )
    quitItem.target = self
    menu.addItem(quitItem)

    statusItem.menu = menu
    self.statusItem = statusItem
  }

  private func makeStatusItemImage() -> NSImage? {
    guard #available(macOS 11.0, *) else {
      return nil
    }

    let configuration = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
    guard
      let image = NSImage(
        systemSymbolName: "bubble.left.and.bubble.right.fill",
        accessibilityDescription: applicationName
      )?.withSymbolConfiguration(configuration)
    else {
      return nil
    }
    image.isTemplate = true
    return image
  }
}
