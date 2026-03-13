import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';

class InviteScannerSheet extends StatefulWidget {
  const InviteScannerSheet({required this.onDetected, super.key});

  final ValueChanged<String> onDetected;

  @override
  State<InviteScannerSheet> createState() => _InviteScannerSheetState();
}

class _InviteScannerSheetState extends State<InviteScannerSheet> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
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
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: MobileScanner(
                  controller: _controller,
                  errorBuilder:
                      (BuildContext context, MobileScannerException error) {
                        return _ScannerUnavailableView(error: error);
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
                              style: const TextStyle(color: Colors.white),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                  onDetect: (BarcodeCapture capture) {
                    if (_handled) {
                      return;
                    }
                    String? value;
                    for (final Barcode barcode in capture.barcodes) {
                      final String? rawValue = barcode.rawValue;
                      if (rawValue != null && rawValue.isNotEmpty) {
                        value = rawValue;
                        break;
                      }
                    }
                    if (value == null) {
                      return;
                    }
                    _handled = true;
                    widget.onDetected(value);
                  },
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                l10n.scanSheetHint,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
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
