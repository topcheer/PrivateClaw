import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';
import '../services/privateclaw_invite_image_decoder.dart';

class InviteScannerSheet extends StatefulWidget {
  const InviteScannerSheet({
    required this.onDetected,
    super.key,
    this.pickImagePath,
    this.analyzeImagePath,
    this.captureInviteFromCamera,
    this.useNativeIosCapture,
    this.autoStartNativeIosCapture,
    this.previewOverride,
  });

  final ValueChanged<String> onDetected;
  final Future<String?> Function()? pickImagePath;
  final Future<String?> Function(String path)? analyzeImagePath;
  final Future<String?> Function()? captureInviteFromCamera;
  final bool? useNativeIosCapture;
  final bool? autoStartNativeIosCapture;
  final Widget? previewOverride;

  @override
  State<InviteScannerSheet> createState() => _InviteScannerSheetState();
}

class _InviteScannerSheetState extends State<InviteScannerSheet> {
  final MobileScannerController _controller = MobileScannerController();
  bool _isCapturingCamera = false;
  bool _handled = false;
  bool _isAnalyzingImage = false;
  bool _scheduledNativeIosAutoStart = false;
  String? _imageFeedback;

  @override
  void initState() {
    super.initState();
    _scheduleNativeIosAutoStartIfNeeded();
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  Future<String?> _pickImagePath() async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      type: FileType.image,
    );
    if (result == null || result.files.isEmpty) {
      return null;
    }

    final String? path = result.files.single.path;
    if (path == null || path.isEmpty) {
      throw UnsupportedError('The selected image is not readable from a file.');
    }
    return path;
  }

  Future<String?> _analyzeImagePath(String path) async {
    if (_usesNativeIosCapture) {
      return PrivateClawInviteImageDecoder.decodeImage(path);
    }

    try {
      final BarcodeCapture? capture = await _controller.analyzeImage(path);
      return _firstRawValue(capture?.barcodes ?? const <Barcode>[]);
    } on MissingPluginException {
      return PrivateClawInviteImageDecoder.decodeImage(path);
    } on UnsupportedError {
      return PrivateClawInviteImageDecoder.decodeImage(path);
    }
  }

  bool get _usesNativeIosCapture =>
      widget.useNativeIosCapture ??
      (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS);

  bool get _shouldAutoStartNativeIosCapture =>
      widget.autoStartNativeIosCapture ?? _usesNativeIosCapture;

  void _scheduleNativeIosAutoStartIfNeeded() {
    if (!_usesNativeIosCapture ||
        !_shouldAutoStartNativeIosCapture ||
        _scheduledNativeIosAutoStart) {
      return;
    }
    _scheduledNativeIosAutoStart = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _handled) {
        return;
      }
      unawaited(_captureFromCamera());
    });
  }

  Future<void> _handleDetectedValue(String value) async {
    if (_handled) {
      return;
    }
    _handled = true;
    await _controller.stop();
    if (!mounted) {
      return;
    }
    widget.onDetected(value);
  }

  Future<void> _captureFromCamera() async {
    if (_handled || _isCapturingCamera) {
      return;
    }

    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final Future<String?> Function() captureInviteFromCamera =
        widget.captureInviteFromCamera ??
        PrivateClawInviteImageDecoder.captureInviteFromCamera;

    setState(() {
      _isCapturingCamera = true;
      _imageFeedback = null;
    });

    try {
      final String? value = await captureInviteFromCamera();
      if (!mounted || value == null || value.isEmpty) {
        return;
      }
      await _handleDetectedValue(value);
    } on PrivateClawInviteCameraCancelled {
      return;
    } on PrivateClawInviteCameraPermissionDenied {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scannerPermissionDenied;
      });
    } on UnsupportedError {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scannerUnsupported;
      });
    } on StateError {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scannerUnavailable;
      });
    } finally {
      if (!mounted) {
        return;
      }
      setState(() {
        _isCapturingCamera = false;
      });
    }
  }

  Future<void> _pickAndAnalyzeImage() async {
    if (_handled || _isAnalyzingImage) {
      return;
    }

    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final Future<String?> Function() pickImagePath =
        widget.pickImagePath ?? _pickImagePath;
    final Future<String?> Function(String path) analyzeImagePath =
        widget.analyzeImagePath ?? _analyzeImagePath;

    setState(() {
      _isAnalyzingImage = true;
      _imageFeedback = null;
    });

    try {
      final String? path = await pickImagePath();
      if (!mounted || path == null) {
        return;
      }

      final String? value = await analyzeImagePath(path);
      if (!mounted) {
        return;
      }
      if (value == null || value.isEmpty) {
        setState(() {
          _imageFeedback = l10n.scanSheetNoQrInPhoto;
        });
        return;
      }
      await _handleDetectedValue(value);
    } on MobileScannerBarcodeException {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scanSheetNoQrInPhoto;
      });
    } on UnsupportedError {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scanSheetPhotoUnsupported;
      });
    } on MobileScannerException {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scanSheetPhotoFailed;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _imageFeedback = l10n.scanSheetPhotoFailed;
      });
    } finally {
      if (!mounted) {
        return;
      }
      setState(() {
        _isAnalyzingImage = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context)!;

    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.qr_code_scanner),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l10n.scanSheetTitle,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: _usesNativeIosCapture
                      ? ColoredBox(
                          color: Colors.black,
                          child: Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  const Icon(
                                    Icons.qr_code_scanner,
                                    color: Colors.white,
                                    size: 48,
                                  ),
                                  const SizedBox(height: 16),
                                  Text(
                                    _isCapturingCamera
                                        ? l10n.scannerLoading
                                        : l10n.scanSheetTitle,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.white),
                                  ),
                                  const SizedBox(height: 24),
                                  FilledButton.icon(
                                    key: const ValueKey<String>(
                                      'scan-camera-button',
                                    ),
                                    onPressed: _isCapturingCamera
                                        ? null
                                        : _captureFromCamera,
                                    icon: _isCapturingCamera
                                        ? const SizedBox.square(
                                            dimension: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(Icons.camera_alt_outlined),
                                    label: Text(
                                      _isCapturingCamera
                                          ? l10n.scannerLoading
                                          : l10n.scanQrButton,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        )
                      : widget.previewOverride ??
                            MobileScanner(
                              controller: _controller,
                              errorBuilder:
                                  (
                                    BuildContext context,
                                    MobileScannerException error,
                                  ) {
                                    return _ScannerUnavailableView(
                                      error: error,
                                    );
                                  },
                              placeholderBuilder: (BuildContext context) {
                                return ColoredBox(
                                  color: Colors.black,
                                  child: Center(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: <Widget>[
                                        const CircularProgressIndicator(),
                                        const SizedBox(height: 16),
                                        Text(
                                          l10n.scannerLoading,
                                          style: const TextStyle(
                                            color: Colors.white,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                              onDetect: (BarcodeCapture capture) async {
                                final String? value = _firstRawValue(
                                  capture.barcodes,
                                );
                                if (value == null) {
                                  return;
                                }
                                await _handleDetectedValue(value);
                              },
                            ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  OutlinedButton.icon(
                    key: const ValueKey<String>('scan-photo-button'),
                    onPressed: _isAnalyzingImage ? null : _pickAndAnalyzeImage,
                    icon: _isAnalyzingImage
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.photo_library_outlined),
                    label: Text(
                      _isAnalyzingImage
                          ? l10n.scanSheetPickPhotoLoading
                          : l10n.scanSheetPickPhoto,
                    ),
                  ),
                  if (_imageFeedback case final String feedback)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        feedback,
                        key: const ValueKey<String>('scan-photo-feedback'),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String? _firstRawValue(Iterable<Barcode> barcodes) {
  for (final Barcode barcode in barcodes) {
    final String? rawValue = barcode.rawValue;
    if (rawValue != null && rawValue.isNotEmpty) {
      return rawValue;
    }
  }
  return null;
}

class _ScannerUnavailableView extends StatelessWidget {
  const _ScannerUnavailableView({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String message = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied => l10n.scannerPermissionDenied,
      MobileScannerErrorCode.unsupported => l10n.scannerUnsupported,
      _ => l10n.scannerUnavailable,
    };

    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.qr_code_scanner, color: Colors.white, size: 36),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white),
              ),
              if (error.errorDetails?.message case final String details)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    details,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
