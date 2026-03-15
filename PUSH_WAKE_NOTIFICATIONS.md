# PrivateClaw Push Wake / Local Notification Setup

This document is the standalone rollout guide for the PrivateClaw background wake and local-notification flow.

It covers the code that is already implemented in this repository:

- relay-side push token registration and wake delivery
- Redis-compatible persistence for HA / multi-instance relay deployments
- Flutter app session restore, background wake handling, local decrypt, and native local notifications

## What the current code expects

The relay reads FCM credentials from environment variables, and the mobile app expects Firebase settings from a combination of:

- native platform config files (`android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist`)
- Flutter `--dart-define` values for the cross-platform runtime options

If you clone this repository for your own deployment, add your own project-specific versions of those files locally and keep them out of Git together with any service-account credentials.

The current mobile identifiers in this repo are:

- Android package: `gg.ai.privateclaw`
- iOS bundle id: `gg.ai.privateclaw`
- iOS minimum deployment target: `15.0`

## Relay requirements

Background wake notifications require the relay to be able to call FCM.

Provide **one** of these credential options to the relay:

### Option A: full service-account JSON

- `PRIVATECLAW_FCM_SERVICE_ACCOUNT_JSON`

The JSON must include:

- `project_id`
- `client_email`
- `private_key`

### Option B: split service-account fields

- `PRIVATECLAW_FCM_PROJECT_ID`
- `PRIVATECLAW_FCM_CLIENT_EMAIL`
- `PRIVATECLAW_FCM_PRIVATE_KEY`

All three must be present together.

### Existing HA / Redis note

For multi-instance relay deployments, keep Redis configured so push registrations and session state survive replica handoff:

- `PRIVATECLAW_REDIS_URL`
- or `REDIS_URL` as the fallback alias already supported by the relay

## App build-time Firebase settings

The Flutter app expects these `--dart-define` values:

### Required

- `PRIVATECLAW_FIREBASE_PROJECT_ID`
- `PRIVATECLAW_FIREBASE_MESSAGING_SENDER_ID`
- `PRIVATECLAW_FIREBASE_ANDROID_APP_ID`
- `PRIVATECLAW_FIREBASE_IOS_APP_ID`

For API keys, use **either**:

- shared fallback: `PRIVATECLAW_FIREBASE_API_KEY`

or the platform-specific pair:

- `PRIVATECLAW_FIREBASE_ANDROID_API_KEY`
- `PRIVATECLAW_FIREBASE_IOS_API_KEY`

The app now prefers the platform-specific values when present and falls back to the shared `PRIVATECLAW_FIREBASE_API_KEY` only when a platform-specific key is not provided.

### Optional

- `PRIVATECLAW_FIREBASE_STORAGE_BUCKET`
- `PRIVATECLAW_FIREBASE_IOS_BUNDLE_ID`

`PRIVATECLAW_FIREBASE_IOS_BUNDLE_ID` defaults to `gg.ai.privateclaw`, so it only needs to be provided if you intentionally changed the iOS bundle id.

## Firebase project setup checklist

Create or reuse a Firebase project for PrivateClaw and complete all of the following:

1. Add an Android app with package name `gg.ai.privateclaw`.
2. Add an iOS app with bundle id `gg.ai.privateclaw`.
3. Record the Firebase values needed by the Flutter `--dart-define` inputs above.
4. Create or reuse a Firebase service account that can call FCM.
5. Export either the full service-account JSON or the split fields needed by the relay.

Important:

- some Firebase projects reuse one Web API key across mobile apps
- other projects issue different Android and iOS API keys
- if your Firebase project uses different Android and iOS API keys, prefer `PRIVATECLAW_FIREBASE_ANDROID_API_KEY` plus `PRIVATECLAW_FIREBASE_IOS_API_KEY`

## Apple / APNs checklist

For iOS background wake delivery, Firebase must also be connected to APNs for the same app id.

Complete all of the following in Apple Developer / Firebase Console:

1. Ensure the Apple App ID for `gg.ai.privateclaw` has **Push Notifications** enabled.
2. Create or reuse an APNs auth key (`.p8`) for your Apple Developer team.
3. Upload that APNs auth key to Firebase Cloud Messaging for the iOS app.
4. Refresh the provisioning profile / signing setup used for device builds.

Important:

- real push delivery must be tested on a **physical iPhone**
- the iOS simulator can build the app, but it is not the final proof for APNs background wake behavior

## Android checklist

For Android, the current code already requests `POST_NOTIFICATIONS`.

You still need to:

1. register the Android app in Firebase using package name `gg.ai.privateclaw`
2. build the app with the Firebase `--dart-define` values
3. install it on a physical Android device and allow notifications

## Example Flutter build command

Use the same `--dart-define` set for `flutter run`, `flutter build apk`, `flutter build appbundle`, or `flutter build ipa`.

Example:

```bash
flutter run \
  --dart-define=PRIVATECLAW_FIREBASE_PROJECT_ID=... \
  --dart-define=PRIVATECLAW_FIREBASE_MESSAGING_SENDER_ID=... \
  --dart-define=PRIVATECLAW_FIREBASE_ANDROID_API_KEY=... \
  --dart-define=PRIVATECLAW_FIREBASE_IOS_API_KEY=... \
  --dart-define=PRIVATECLAW_FIREBASE_ANDROID_APP_ID=... \
  --dart-define=PRIVATECLAW_FIREBASE_IOS_APP_ID=...
```

If your Firebase project happens to reuse one shared API key across platforms, you may pass:

```bash
  --dart-define=PRIVATECLAW_FIREBASE_API_KEY=...
```

If you also use storage and/or a non-default iOS bundle id, add:

```bash
  --dart-define=PRIVATECLAW_FIREBASE_STORAGE_BUCKET=... \
  --dart-define=PRIVATECLAW_FIREBASE_IOS_BUNDLE_ID=...
```

## Recommended rollout order

1. Finish Firebase project setup for Android and iOS.
2. Finish APNs key upload inside Firebase for iOS.
3. Configure the relay's FCM credentials in your secret store or local ignored relay env file.
4. Build fresh Android and iOS app binaries with the Firebase `--dart-define` values.
5. Test on physical devices with the app backgrounded:
   - send a PrivateClaw message from OpenClaw
   - verify the relay sends a wake
   - verify the app reconnects, decrypts locally, and shows a native notification

## What you need to do yourself

- create or finalize the Firebase project
- finalize APNs setup in Apple Developer + Firebase
- place the FCM service-account credentials into Railway secrets
- provide a real Android device and a real iPhone for the final push test

## What I still need from you if you want me to finish the rollout

I need **either** the actual values **or** confirmation that you already stored them in the relevant secret/config systems.

### Relay side

- `PRIVATECLAW_FCM_SERVICE_ACCOUNT_JSON`

or:

- `PRIVATECLAW_FCM_PROJECT_ID`
- `PRIVATECLAW_FCM_CLIENT_EMAIL`
- `PRIVATECLAW_FCM_PRIVATE_KEY`

### App side

- `PRIVATECLAW_FIREBASE_PROJECT_ID`
- `PRIVATECLAW_FIREBASE_MESSAGING_SENDER_ID`
- `PRIVATECLAW_FIREBASE_ANDROID_APP_ID`
- `PRIVATECLAW_FIREBASE_IOS_APP_ID`

and either:

- `PRIVATECLAW_FIREBASE_API_KEY`

or:

- `PRIVATECLAW_FIREBASE_ANDROID_API_KEY`
- `PRIVATECLAW_FIREBASE_IOS_API_KEY`

Optional if applicable:

- `PRIVATECLAW_FIREBASE_STORAGE_BUCKET`
- `PRIVATECLAW_FIREBASE_IOS_BUNDLE_ID`

### Confirmation items

- whether Android package / iOS bundle id are still both `gg.ai.privateclaw`
- whether Railway already has the relay-side FCM secret(s)
- whether Firebase already has the APNs auth key attached for the iOS app
- whether you want me to do local build/test commands after secrets are ready

## Current validation status

The implementation has already passed code-level validation:

- relay build/tests passed
- app tests passed
- Android debug build passed
- iOS simulator build passed
- repository-wide build/tests passed

What remains is environment wiring and physical-device push verification.
