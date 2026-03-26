import AppKit
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
  fputs("\(message)\n", stderr)
  exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  fail("usage: capture-macos-window.swift <app-name> <output-path>")
}

let appName = arguments[1].trimmingCharacters(in: .whitespacesAndNewlines)
let outputPath = arguments[2].trimmingCharacters(in: .whitespacesAndNewlines)
guard !appName.isEmpty else {
  fail("app name cannot be empty")
}
guard !outputPath.isEmpty else {
  fail("output path cannot be empty")
}

Task {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(
      false,
      onScreenWindowsOnly: true
    )
    guard
      let window = content.windows.first(where: {
        $0.owningApplication?.applicationName == appName
      })
    else {
      fail("Could not find an on-screen window for \(appName).")
    }

    let filter = SCContentFilter(desktopIndependentWindow: window)
    let configuration = SCStreamConfiguration()
    configuration.width = max(1, Int(window.frame.width.rounded(.up)))
    configuration.height = max(1, Int(window.frame.height.rounded(.up)))
    configuration.showsCursor = false

    let image = try await SCScreenshotManager.captureImage(
      contentFilter: filter,
      configuration: configuration
    )

    let outputUrl = URL(fileURLWithPath: outputPath)
    try FileManager.default.createDirectory(
      at: outputUrl.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )

    guard
      let destination = CGImageDestinationCreateWithURL(
        outputUrl as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
      )
    else {
      fail("Failed to create PNG destination at \(outputPath).")
    }

    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
      fail("Failed to finalize PNG screenshot at \(outputPath).")
    }

    print(outputUrl.path)
    exit(0)
  } catch {
    let nsError = error as NSError
    if nsError.domain == "com.apple.ScreenCaptureKit.SCStreamErrorDomain" &&
      nsError.code == -3801
    {
      fail(
        "ScreenCaptureKit permission denied. Grant Screen Recording permission to the invoking terminal app, then retry."
      )
    }
    fail(error.localizedDescription)
  }
}

RunLoop.current.run()
