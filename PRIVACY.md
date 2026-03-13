# PrivateClaw Privacy Policy

Last updated: 2026-03-13

PrivateClaw is a companion app for connecting to your own OpenClaw deployment through an end-to-end encrypted, session-based relay. This policy explains what information the PrivateClaw mobile app handles and how that information flows through the system.

## Scope

This policy covers:

- the PrivateClaw mobile app
- the published PrivateClaw relay and provider components when you deploy them yourself

If you connect the app to a relay, provider, or OpenClaw deployment operated by someone else, that operator is responsible for their own data handling practices.

## Information the app handles

PrivateClaw may handle the following categories of data:

- session invite data, such as the session ID, relay endpoint, expiry time, and session key embedded in the QR code or invite link
- messages and attachments that you choose to send or receive
- temporary local files created to preview or open received media and documents
- device and connection metadata needed to keep the encrypted session alive, such as connection timestamps, reconnect attempts, and encrypted envelope sizes

PrivateClaw does not require account registration and does not include advertising SDKs or analytics SDKs by default.

## How permissions are used

PrivateClaw requests only the access needed for core product features:

- Camera access is used to scan pairing QR codes.
- File and media access is used only when you explicitly choose attachments or open received media.
- Network access is used to establish the encrypted relay session and exchange encrypted messages with your selected relay/provider/OpenClaw deployment.

## Encryption and message flow

PrivateClaw is designed so that:

- the mobile app encrypts messages and attachments with the session key
- the relay primarily transports encrypted payloads and routing metadata
- the selected provider/OpenClaw deployment decrypts the content in order to process your request and generate a response

Because of this design, a relay operator may still be able to observe limited metadata such as session IDs, connection timing, and message sizes, even if they cannot read encrypted message contents.

## Sharing and third parties

PrivateClaw does not sell your personal data.

Depending on how you use the product, data may be shared with:

- the relay operator you connect to
- the provider/OpenClaw deployment that receives your messages and attachments
- Apple and Google as part of app distribution, crash reporting, or app review processes provided by their platforms

If you self-host the relay and provider, you control that infrastructure and its retention settings.

## Data retention

Retention depends on where the data exists:

- On-device message history and temporary attachment files remain on your device until the app clears them, the session is removed, or you uninstall/clear app data.
- Relay and provider retention depend on the deployment operator's configuration, logs, and session TTL settings.
- Attachments sent to an OpenClaw deployment may be staged locally on that deployment so the agent can process them.

## Your choices

You can:

- deny camera permission and use paste-invite mode instead of QR scanning
- choose whether to send messages or attachments
- clear app data or uninstall the app to remove local app storage
- self-host the relay/provider/OpenClaw stack if you want direct control over infrastructure and retention

## Contact

For questions about this project or this policy, open an issue at:

`https://github.com/topcheer/PrivateClaw/issues`

## Changes

If this policy changes materially, the updated version will be published in this repository.
