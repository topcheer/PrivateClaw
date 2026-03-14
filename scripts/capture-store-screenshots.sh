#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/privateclaw_app"
IOS_BUNDLE_ID="gg.ai.privateclaw"
ANDROID_PACKAGE="gg.ai.privateclaw"
IOS_PHONE_DEVICE_NAME="${PRIVATECLAW_IOS_PHONE_DEVICE:-iPhone 16 Pro Max}"
IOS_TABLET_DEVICE_NAME="${PRIVATECLAW_IOS_TABLET_DEVICE:-iPad Pro 13-inch (M5)}"
IOS_CAPTURE_IPAD="${PRIVATECLAW_IOS_CAPTURE_IPAD:-true}"
ANDROID_EMULATOR_ID="${PRIVATECLAW_ANDROID_SCREENSHOT_EMULATOR:-Nexus_5X}"
TARGET="${1:-all}"
LOCALE="${2:-en-US}"

SCENARIOS=(
  "welcome:01-welcome"
  "group_chat:02-group-chat"
  "rich_media:03-rich-media"
)

log() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

find_ios_udid() {
  python3 - "$1" <<'PY'
import json
import subprocess
import sys

device_name = sys.argv[1]
payload = json.loads(
    subprocess.check_output(
        ["xcrun", "simctl", "list", "devices", "available", "-j"],
        text=True,
    )
)

for runtime in payload.get("devices", {}).values():
    for device in runtime:
        if device.get("name") == device_name and device.get("isAvailable", True):
            print(device["udid"])
            raise SystemExit(0)

raise SystemExit(f"Unable to find iOS simulator named {device_name!r}.")
PY
}

boot_ios_simulator() {
  local udid="$1"
  xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b
  open -a Simulator --args -CurrentDeviceUDID "$udid" >/dev/null 2>&1 || true
}

override_ios_status_bar() {
  local udid="$1"
  xcrun simctl status_bar "$udid" override \
    --time 9:41 \
    --dataNetwork wifi \
    --wifiBars 3 \
    --cellularMode active \
    --cellularBars 4 \
    --batteryState charged \
    --batteryLevel 100
}

capture_ios_device() {
  local udid="$1"
  local suffix="$2"
  local out_dir="$3"
  local name="$4"

  xcrun simctl install "$udid" "$APP_DIR/build/ios/iphonesimulator/Runner.app"
  xcrun simctl terminate "$udid" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$udid" "$IOS_BUNDLE_ID" >/dev/null
  sleep 4
  xcrun simctl io "$udid" screenshot "$out_dir/${name}-${suffix}.png"
}

capture_ios() {
  require_command flutter
  require_command xcrun

  local phone_udid
  phone_udid="$(find_ios_udid "$IOS_PHONE_DEVICE_NAME")"
  local tablet_udid=""
  if [[ "$IOS_CAPTURE_IPAD" == "true" ]]; then
    tablet_udid="$(find_ios_udid "$IOS_TABLET_DEVICE_NAME")"
  fi
  local out_dir="$APP_DIR/ios/fastlane/screenshots/$LOCALE"
  mkdir -p "$out_dir"
  boot_ios_simulator "$phone_udid"
  override_ios_status_bar "$phone_udid"
  if [[ -n "$tablet_udid" ]]; then
    boot_ios_simulator "$tablet_udid"
    override_ios_status_bar "$tablet_udid"
  fi

  for entry in "${SCENARIOS[@]}"; do
    local scenario="${entry%%:*}"
    local name="${entry##*:}"
    log "Capturing iOS $scenario"
    (
      cd "$APP_DIR"
      flutter build ios --simulator \
        --dart-define=PRIVATECLAW_SCREENSHOT_SCENARIO="$scenario" \
        --dart-define=PRIVATECLAW_SCREENSHOT_LOCALE="$LOCALE"
    )
    capture_ios_device "$phone_udid" "iphone" "$out_dir" "$name"
    if [[ -n "$tablet_udid" ]]; then
      capture_ios_device "$tablet_udid" "ipad" "$out_dir" "$name"
    fi
  done

  xcrun simctl status_bar "$phone_udid" clear
  if [[ -n "$tablet_udid" ]]; then
    xcrun simctl status_bar "$tablet_udid" clear
  fi
}

find_android_emulator() {
  adb devices | awk '/emulator-/{print $1; exit}'
}

boot_android_emulator() {
  require_command flutter
  require_command adb

  local serial
  serial="$(find_android_emulator)"
  if [[ -z "$serial" ]]; then
    flutter emulators --launch "$ANDROID_EMULATOR_ID" >/dev/null
    for _ in $(seq 1 120); do
      serial="$(find_android_emulator)"
      if [[ -n "$serial" ]]; then
        break
      fi
      sleep 2
    done
  fi

  if [[ -z "$serial" ]]; then
    echo "Unable to start or find Android emulator $ANDROID_EMULATOR_ID." >&2
    exit 1
  fi

  adb -s "$serial" wait-for-device >/dev/null
  while [[ "$(adb -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" != "1" ]]; do
    sleep 2
  done
  adb -s "$serial" shell input keyevent 82 >/dev/null 2>&1 || true
  adb -s "$serial" shell settings put global sysui_demo_allowed 1 >/dev/null
  adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
  adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
  adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
  adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e mobile show -e datatype lte >/dev/null
  printf '%s' "$serial"
}

capture_android() {
  local serial
  serial="$(boot_android_emulator)"
  local out_dir="$APP_DIR/android/fastlane/metadata/android/$LOCALE/images/phoneScreenshots"
  mkdir -p "$out_dir"

  for entry in "${SCENARIOS[@]}"; do
    local scenario="${entry%%:*}"
    local name="${entry##*:}"
    log "Capturing Android $scenario"
    (
      cd "$APP_DIR"
      flutter build apk --debug \
        --dart-define=PRIVATECLAW_SCREENSHOT_SCENARIO="$scenario" \
        --dart-define=PRIVATECLAW_SCREENSHOT_LOCALE="$LOCALE"
    )
    adb -s "$serial" install -r "$APP_DIR/build/app/outputs/flutter-apk/app-debug.apk" >/dev/null
    adb -s "$serial" shell am force-stop "$ANDROID_PACKAGE" >/dev/null 2>&1 || true
    adb -s "$serial" shell monkey -p "$ANDROID_PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    sleep 4
    adb -s "$serial" exec-out screencap -p >"$out_dir/$name.png"
  done

  adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
}

main() {
  case "$TARGET" in
    ios)
      capture_ios
      ;;
    android)
      capture_android
      ;;
    all)
      capture_ios
      capture_android
      ;;
    *)
      echo "Usage: scripts/capture-store-screenshots.sh [ios|android|all] [locale]" >&2
      exit 1
      ;;
  esac
}

main "$@"
