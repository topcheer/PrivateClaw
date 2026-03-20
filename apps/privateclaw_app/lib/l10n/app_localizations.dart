import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_es.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_id.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_pt.dart';
import 'app_localizations_vi.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('de'),
    Locale('en'),
    Locale('es'),
    Locale('fr'),
    Locale('id'),
    Locale('ja'),
    Locale('ko'),
    Locale('pt'),
    Locale('pt', 'BR'),
    Locale('vi'),
    Locale('zh'),
    Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'PrivateClaw'**
  String get appTitle;

  /// No description provided for @disconnectTooltip.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get disconnectTooltip;

  /// No description provided for @entryTitle.
  ///
  /// In en, this message translates to:
  /// **'One-time private session'**
  String get entryTitle;

  /// No description provided for @inviteInputLabel.
  ///
  /// In en, this message translates to:
  /// **'Invite link or QR payload'**
  String get inviteInputLabel;

  /// No description provided for @inviteInputHint.
  ///
  /// In en, this message translates to:
  /// **'privateclaw://connect?payload=...'**
  String get inviteInputHint;

  /// No description provided for @scanQrButton.
  ///
  /// In en, this message translates to:
  /// **'Scan QR code'**
  String get scanQrButton;

  /// No description provided for @connectSessionButton.
  ///
  /// In en, this message translates to:
  /// **'Join session'**
  String get connectSessionButton;

  /// No description provided for @showSessionQrButton.
  ///
  /// In en, this message translates to:
  /// **'Show current QR'**
  String get showSessionQrButton;

  /// No description provided for @sessionLabel.
  ///
  /// In en, this message translates to:
  /// **'Session'**
  String get sessionLabel;

  /// No description provided for @expiresLabel.
  ///
  /// In en, this message translates to:
  /// **'Expires'**
  String get expiresLabel;

  /// No description provided for @initialStatus.
  ///
  /// In en, this message translates to:
  /// **'Scan a PrivateClaw QR code or paste an invite link to start a one-time session.'**
  String get initialStatus;

  /// No description provided for @enterValidInvite.
  ///
  /// In en, this message translates to:
  /// **'Paste or scan a valid PrivateClaw invite link.'**
  String get enterValidInvite;

  /// No description provided for @connectingRelay.
  ///
  /// In en, this message translates to:
  /// **'Connecting to the PrivateClaw relay…'**
  String get connectingRelay;

  /// No description provided for @connectFailed.
  ///
  /// In en, this message translates to:
  /// **'Connect failed: {error}'**
  String connectFailed(String error);

  /// No description provided for @encryptedChatPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'End-to-end encrypted chat will appear here after the session connects.'**
  String get encryptedChatPlaceholder;

  /// No description provided for @sendHintActive.
  ///
  /// In en, this message translates to:
  /// **'Send an encrypted message…'**
  String get sendHintActive;

  /// No description provided for @sendHintInactive.
  ///
  /// In en, this message translates to:
  /// **'Wait for the session to finish connecting…'**
  String get sendHintInactive;

  /// No description provided for @sendTooltip.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get sendTooltip;

  /// No description provided for @sendFailed.
  ///
  /// In en, this message translates to:
  /// **'Send failed: {error}'**
  String sendFailed(String error);

  /// No description provided for @sessionDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Session disconnected. Scan again to start a new PrivateClaw session.'**
  String get sessionDisconnected;

  /// No description provided for @scanSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Scan a PrivateClaw invite QR code'**
  String get scanSheetTitle;

  /// No description provided for @scanSheetHint.
  ///
  /// In en, this message translates to:
  /// **'If scanning is unavailable in the simulator, paste the invite link instead.'**
  String get scanSheetHint;

  /// No description provided for @scanSheetPickPhoto.
  ///
  /// In en, this message translates to:
  /// **'Scan from photo'**
  String get scanSheetPickPhoto;

  /// No description provided for @scanSheetPickPhotoLoading.
  ///
  /// In en, this message translates to:
  /// **'Reading photo…'**
  String get scanSheetPickPhotoLoading;

  /// No description provided for @scanSheetNoQrInPhoto.
  ///
  /// In en, this message translates to:
  /// **'No QR code was found in the selected photo.'**
  String get scanSheetNoQrInPhoto;

  /// No description provided for @scanSheetPhotoUnsupported.
  ///
  /// In en, this message translates to:
  /// **'This device cannot read QR codes from saved photos yet. Paste the invite link instead.'**
  String get scanSheetPhotoUnsupported;

  /// No description provided for @scanSheetPhotoFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t read the selected photo.'**
  String get scanSheetPhotoFailed;

  /// No description provided for @scannerPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Camera access is required for live QR scanning. You can also choose a photo instead.'**
  String get scannerPermissionDenied;

  /// No description provided for @scannerUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Live camera scanning is unavailable here. Choose a photo instead, or paste the invite link.'**
  String get scannerUnsupported;

  /// No description provided for @scannerUnavailable.
  ///
  /// In en, this message translates to:
  /// **'QR scanning is temporarily unavailable. Choose a photo instead, or paste the invite link.'**
  String get scannerUnavailable;

  /// No description provided for @scannerLoading.
  ///
  /// In en, this message translates to:
  /// **'Starting camera…'**
  String get scannerLoading;

  /// No description provided for @relayConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting to the relay…'**
  String get relayConnecting;

  /// No description provided for @relayHandshake.
  ///
  /// In en, this message translates to:
  /// **'Relay connected. Finishing the encrypted handshake…'**
  String get relayHandshake;

  /// No description provided for @relayConnectionError.
  ///
  /// In en, this message translates to:
  /// **'Connection error: {details}'**
  String relayConnectionError(String details);

  /// No description provided for @relaySessionClosed.
  ///
  /// In en, this message translates to:
  /// **'Session closed.'**
  String get relaySessionClosed;

  /// No description provided for @relaySessionClosedWithReason.
  ///
  /// In en, this message translates to:
  /// **'Session closed: {reason}'**
  String relaySessionClosedWithReason(String reason);

  /// No description provided for @relayError.
  ///
  /// In en, this message translates to:
  /// **'Relay error: {details}'**
  String relayError(String details);

  /// No description provided for @relayUnknownEvent.
  ///
  /// In en, this message translates to:
  /// **'Received an unknown relay event: {eventType}'**
  String relayUnknownEvent(String eventType);

  /// No description provided for @relayUnknownPayload.
  ///
  /// In en, this message translates to:
  /// **'Received an unknown encrypted message type: {payloadType}'**
  String relayUnknownPayload(String payloadType);

  /// No description provided for @nonDefaultRelayWarningTitle.
  ///
  /// In en, this message translates to:
  /// **'Custom relay server'**
  String get nonDefaultRelayWarningTitle;

  /// No description provided for @nonDefaultRelayWarningBody.
  ///
  /// In en, this message translates to:
  /// **'This invite points to {relayLabel} instead of the default PrivateClaw relay. Continue only if you trust this server.'**
  String nonDefaultRelayWarningBody(String relayLabel);

  /// No description provided for @relayWarningCancelButton.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get relayWarningCancelButton;

  /// No description provided for @relayWarningContinueButton.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get relayWarningContinueButton;

  /// No description provided for @sessionQrTitle.
  ///
  /// In en, this message translates to:
  /// **'Current session QR'**
  String get sessionQrTitle;

  /// No description provided for @sessionQrHint.
  ///
  /// In en, this message translates to:
  /// **'Share this QR in person before the session expires.'**
  String get sessionQrHint;

  /// No description provided for @copyInviteLinkButton.
  ///
  /// In en, this message translates to:
  /// **'Copy invite link'**
  String get copyInviteLinkButton;

  /// No description provided for @inviteLinkCopied.
  ///
  /// In en, this message translates to:
  /// **'Invite link copied.'**
  String get inviteLinkCopied;

  /// No description provided for @welcomeFallback.
  ///
  /// In en, this message translates to:
  /// **'PrivateClaw connected.'**
  String get welcomeFallback;

  /// No description provided for @sessionRenewedNotice.
  ///
  /// In en, this message translates to:
  /// **'Session renewed. New expiry: {expiresAt} ({remaining} left).'**
  String sessionRenewedNotice(String expiresAt, String remaining);

  /// No description provided for @sessionRenewPromptTitle.
  ///
  /// In en, this message translates to:
  /// **'Session expiring soon'**
  String get sessionRenewPromptTitle;

  /// No description provided for @sessionRenewPromptBody.
  ///
  /// In en, this message translates to:
  /// **'This session expires in {remaining}. Any member can renew it now.'**
  String sessionRenewPromptBody(String remaining);

  /// No description provided for @sessionRenewButton.
  ///
  /// In en, this message translates to:
  /// **'Renew session'**
  String get sessionRenewButton;

  /// No description provided for @sessionRenewButtonPending.
  ///
  /// In en, this message translates to:
  /// **'Renewing…'**
  String get sessionRenewButtonPending;

  /// No description provided for @groupChatSummary.
  ///
  /// In en, this message translates to:
  /// **'Group chat • {count} participants'**
  String groupChatSummary(int count);

  /// No description provided for @groupModeLabel.
  ///
  /// In en, this message translates to:
  /// **'Mode: group chat'**
  String get groupModeLabel;

  /// No description provided for @currentAppLabel.
  ///
  /// In en, this message translates to:
  /// **'This app: {label}'**
  String currentAppLabel(String label);

  /// No description provided for @preparingAudioAttachment.
  ///
  /// In en, this message translates to:
  /// **'Preparing audio…'**
  String get preparingAudioAttachment;

  /// No description provided for @preparingVideoAttachment.
  ///
  /// In en, this message translates to:
  /// **'Preparing video…'**
  String get preparingVideoAttachment;

  /// No description provided for @switchToVoiceInputTooltip.
  ///
  /// In en, this message translates to:
  /// **'Voice input'**
  String get switchToVoiceInputTooltip;

  /// No description provided for @switchToTextInputTooltip.
  ///
  /// In en, this message translates to:
  /// **'Keyboard input'**
  String get switchToTextInputTooltip;

  /// No description provided for @voiceRecordHoldToSend.
  ///
  /// In en, this message translates to:
  /// **'Hold to Talk'**
  String get voiceRecordHoldToSend;

  /// No description provided for @voiceRecordReleaseToSend.
  ///
  /// In en, this message translates to:
  /// **'Release to send'**
  String get voiceRecordReleaseToSend;

  /// No description provided for @voiceRecordSending.
  ///
  /// In en, this message translates to:
  /// **'Sending voice message…'**
  String get voiceRecordSending;

  /// No description provided for @voiceRecordUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Wait for the session to finish connecting…'**
  String get voiceRecordUnavailable;

  /// No description provided for @voiceRecordingPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Microphone access is required for voice messages.'**
  String get voiceRecordingPermissionDenied;

  /// No description provided for @voiceRecordingUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Voice recording is unavailable on this device.'**
  String get voiceRecordingUnsupported;

  /// No description provided for @voiceRecordingTooShort.
  ///
  /// In en, this message translates to:
  /// **'Hold a little longer before releasing your voice message.'**
  String get voiceRecordingTooShort;

  /// No description provided for @voiceRecordingTooLarge.
  ///
  /// In en, this message translates to:
  /// **'This voice message is too large to send inline.'**
  String get voiceRecordingTooLarge;

  /// No description provided for @voiceRecordingCancelled.
  ///
  /// In en, this message translates to:
  /// **'Voice recording cancelled.'**
  String get voiceRecordingCancelled;

  /// No description provided for @voiceRecordingFailed.
  ///
  /// In en, this message translates to:
  /// **'Voice recording failed: {error}'**
  String voiceRecordingFailed(String error);

  /// No description provided for @emojiPickerTooltip.
  ///
  /// In en, this message translates to:
  /// **'Emoji'**
  String get emojiPickerTooltip;

  /// No description provided for @emojiPickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Common emoji'**
  String get emojiPickerTitle;

  /// Tooltip for opening the fullscreen composer editor.
  ///
  /// In en, this message translates to:
  /// **'Expand editor'**
  String get composerExpandTooltip;

  /// Title shown on the fullscreen composer editor page.
  ///
  /// In en, this message translates to:
  /// **'Expanded composer'**
  String get composerFullscreenTitle;

  /// Label for the frequently used emoji group.
  ///
  /// In en, this message translates to:
  /// **'Frequent'**
  String get emojiPickerFrequentTab;

  /// Label for the default emoji group.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get emojiPickerDefaultTab;

  /// Tooltip and header label for the recent photo tray.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get photoTrayTooltip;

  /// Label for opening the camera from the photo tray.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get photoTrayCameraButton;

  /// Label for opening the system gallery picker from the photo tray.
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get photoTrayGalleryButton;

  /// Message shown when the recent photo tray has no visible photos.
  ///
  /// In en, this message translates to:
  /// **'No photos available.'**
  String get photoTrayNoImages;

  /// No description provided for @photoTrayAndroidRecentPhotosUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Recent photo browsing is turned off on Android in this build. Use Camera or Gallery instead.'**
  String get photoTrayAndroidRecentPhotosUnavailable;

  /// Status text shown when recent photo access was denied.
  ///
  /// In en, this message translates to:
  /// **'Photo access is required to browse recent images.'**
  String get photoLibraryPermissionDenied;

  /// Tooltip for opening the file picker.
  ///
  /// In en, this message translates to:
  /// **'Files'**
  String get filePickerTooltip;

  /// Hint shown while voice recording is active and can still be cancelled by sliding up.
  ///
  /// In en, this message translates to:
  /// **'Release to send · slide up to cancel'**
  String get voiceRecordingSlideUpToCancel;

  /// Hint shown while voice recording is cancel-armed.
  ///
  /// In en, this message translates to:
  /// **'Release to cancel'**
  String get voiceRecordingReleaseToCancel;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'id',
    'ja',
    'ko',
    'pt',
    'vi',
    'zh',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when language+script codes are specified.
  switch (locale.languageCode) {
    case 'zh':
      {
        switch (locale.scriptCode) {
          case 'Hant':
            return AppLocalizationsZhHant();
        }
        break;
      }
  }

  // Lookup logic when language+country codes are specified.
  switch (locale.languageCode) {
    case 'pt':
      {
        switch (locale.countryCode) {
          case 'BR':
            return AppLocalizationsPtBr();
        }
        break;
      }
  }

  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'es':
      return AppLocalizationsEs();
    case 'fr':
      return AppLocalizationsFr();
    case 'id':
      return AppLocalizationsId();
    case 'ja':
      return AppLocalizationsJa();
    case 'ko':
      return AppLocalizationsKo();
    case 'pt':
      return AppLocalizationsPt();
    case 'vi':
      return AppLocalizationsVi();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
