#include "flutter_window.h"

#include <optional>
#include <shellapi.h>
#include <strsafe.h>

#include "flutter/generated_plugin_registrant.h"
#include "resource.h"

namespace {

constexpr wchar_t kPrivateClawTrayTooltip[] = L"PrivateClaw";
constexpr UINT kPrivateClawTrayIconId = 1;
constexpr UINT kPrivateClawTrayMessage = WM_APP + 1;
constexpr UINT_PTR kPrivateClawTrayOpenCommand = 1001;
constexpr UINT_PTR kPrivateClawTrayHideCommand = 1002;
constexpr UINT_PTR kPrivateClawTrayQuitCommand = 1003;

}  // namespace

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  audio_recorder_ = std::make_unique<PrivateClawAudioRecorder>(
      flutter_controller_->engine()->messenger());
  SetChildContent(flutter_controller_->view()->GetNativeWindow());
  AddTrayIcon();

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  if (tray_menu_ != nullptr) {
    DestroyMenu(tray_menu_);
    tray_menu_ = nullptr;
  }
  if (audio_recorder_) {
    audio_recorder_ = nullptr;
  }
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_CLOSE:
      if (!allow_window_close_ && tray_icon_added_) {
        HideToTray();
        return 0;
      }
      break;

    case kPrivateClawTrayMessage: {
      const UINT tray_event = LOWORD(lparam);
      switch (tray_event) {
        case WM_CONTEXTMENU:
        case WM_RBUTTONUP:
          ShowTrayMenu();
          return 0;
        case WM_LBUTTONUP:
        case WM_LBUTTONDBLCLK:
          RestoreFromTray();
          return 0;
      }
      break;
    }

    case WM_COMMAND:
      switch (LOWORD(wparam)) {
        case kPrivateClawTrayOpenCommand:
          RestoreFromTray();
          return 0;
        case kPrivateClawTrayHideCommand:
          HideToTray();
          return 0;
        case kPrivateClawTrayQuitCommand:
          allow_window_close_ = true;
          PostMessage(hwnd, WM_CLOSE, 0, 0);
          return 0;
      }
      break;

    case WM_DESTROY:
      RemoveTrayIcon(hwnd);
      break;

    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}

void FlutterWindow::AddTrayIcon() {
  if (tray_icon_added_ || GetHandle() == nullptr) {
    return;
  }

  tray_menu_ = CreatePopupMenu();
  if (tray_menu_ != nullptr) {
    AppendMenuW(tray_menu_, MF_STRING, kPrivateClawTrayOpenCommand,
                L"Open PrivateClaw");
    AppendMenuW(tray_menu_, MF_STRING, kPrivateClawTrayHideCommand,
                L"Hide PrivateClaw");
    AppendMenuW(tray_menu_, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(tray_menu_, MF_STRING, kPrivateClawTrayQuitCommand,
                L"Quit PrivateClaw");
    SetMenuDefaultItem(tray_menu_, kPrivateClawTrayOpenCommand, FALSE);
  }

  NOTIFYICONDATAW icon_data = {};
  icon_data.cbSize = sizeof(icon_data);
  icon_data.hWnd = GetHandle();
  icon_data.uID = kPrivateClawTrayIconId;
  icon_data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  icon_data.uCallbackMessage = kPrivateClawTrayMessage;
  icon_data.hIcon = static_cast<HICON>(LoadImageW(
      GetModuleHandle(nullptr), MAKEINTRESOURCEW(IDI_APP_ICON), IMAGE_ICON,
      GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
      LR_DEFAULTCOLOR));
  if (icon_data.hIcon == nullptr) {
    icon_data.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
  }
  StringCchCopyW(icon_data.szTip, ARRAYSIZE(icon_data.szTip),
                 kPrivateClawTrayTooltip);
  tray_icon_added_ = Shell_NotifyIconW(NIM_ADD, &icon_data) == TRUE;
}

void FlutterWindow::RemoveTrayIcon(HWND window) {
  if (tray_icon_added_) {
    NOTIFYICONDATAW icon_data = {};
    icon_data.cbSize = sizeof(icon_data);
    icon_data.hWnd = window;
    icon_data.uID = kPrivateClawTrayIconId;
    Shell_NotifyIconW(NIM_DELETE, &icon_data);
    tray_icon_added_ = false;
  }
}

void FlutterWindow::HideToTray() {
  if (GetHandle() == nullptr) {
    return;
  }
  ShowWindow(GetHandle(), SW_HIDE);
}

void FlutterWindow::RestoreFromTray() {
  if (GetHandle() == nullptr) {
    return;
  }
  ShowWindow(GetHandle(), IsIconic(GetHandle()) ? SW_RESTORE : SW_SHOW);
  SetForegroundWindow(GetHandle());
  allow_window_close_ = false;
}

void FlutterWindow::ShowTrayMenu() {
  if (tray_menu_ == nullptr || GetHandle() == nullptr) {
    return;
  }

  POINT cursor_position;
  if (!GetCursorPos(&cursor_position)) {
    cursor_position.x = 0;
    cursor_position.y = 0;
  }

  SetForegroundWindow(GetHandle());
  TrackPopupMenu(tray_menu_, TPM_BOTTOMALIGN | TPM_LEFTALIGN | TPM_RIGHTBUTTON,
                 cursor_position.x, cursor_position.y, 0, GetHandle(),
                 nullptr);
  PostMessage(GetHandle(), WM_NULL, 0, 0);
}
