#!/usr/bin/env bash
set -euo pipefail

# App Store / Play Store screenshots of the real app.
#
#   ios | macos | all-apple   -> scripts/build-store-screenshots.py
#                                 (one build, launches the app per locale x
#                                  scenario, composes localized frames)
#   android                      -> emulator capture of the debug APK below
#   all                          -> apple + android
#
# Usage: scripts/capture-store-screenshots.sh [ios|macos|all-apple|android|all] [locale]
#        locale defaults to all 12 store locales for Apple targets.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/privateclaw_app"
ANDROID_PACKAGE="gg.ai.privateclaw"
ANDROID_EMULATOR_ID="${PRIVATECLAW_ANDROID_SCREENSHOT_EMULATOR:-Nexus_5X}"
TARGET="${1:-all}"
LOCALE="${2:-}"

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

capture_apple() {
  local platform="$1"
  require_command python3
  require_command flutter
  (
    cd "$APP_DIR"
    if [[ "$platform" == "ios" ]]; then
      flutter build ios --simulator
    elif [[ "$platform" == "macos" ]]; then
      flutter build macos --debug
    else
      flutter build ios --simulator
      flutter build macos --debug
    fi
  )
  local args=(--platform "$platform")
  if [[ -n "$LOCALE" ]]; then
    args+=(--locales "$LOCALE")
  fi
  python3 "$ROOT_DIR/scripts/build-store-screenshots.py" "${args[@]}"
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
  local locale="${LOCALE:-en-US}"
  local serial
  serial="$(boot_android_emulator)"
  local out_dir="$APP_DIR/android/fastlane/metadata/android/$locale/images/phoneScreenshots"
  mkdir -p "$out_dir"

  for entry in "${SCENARIOS[@]}"; do
    local scenario="${entry%%:*}"
    local name="${entry##*:}"
    log "Capturing Android $scenario"
    (
      cd "$APP_DIR"
      flutter build apk --debug \
        --dart-define=PRIVATECLAW_SCREENSHOT_SCENARIO="$scenario" \
        --dart-define=PRIVATECLAW_SCREENSHOT_LOCALE="$locale"
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
    ios | macos | all-apple)
      capture_apple "$TARGET"
      ;;
    android)
      capture_android
      ;;
    all)
      capture_apple all-apple
      capture_android
      ;;
    *)
      echo "Usage: scripts/capture-store-screenshots.sh [ios|macos|all-apple|android|all] [locale]" >&2
      exit 1
      ;;
  esac
}

main "$@"
