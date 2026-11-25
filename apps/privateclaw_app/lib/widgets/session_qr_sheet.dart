import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../l10n/app_localizations.dart';
import '../models/privateclaw_invite.dart';

class SessionQrSheet extends StatelessWidget {
  const SessionQrSheet({super.key, required this.invite});

  final PrivateClawInvite invite;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context)!;
    final String inviteUri = encodePrivateClawInviteUri(invite);
    final Locale locale = Localizations.localeOf(context);
    final String expiresAt = DateFormat.yMd(
      locale.toString(),
    ).add_jm().format(invite.expiresAt.toLocal());
    final double qrSize =
        (MediaQuery.sizeOf(context).shortestSide - 96)
            .clamp(220.0, 320.0)
            .toDouble();

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        20 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            l10n.sessionQrTitle,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            l10n.sessionQrHint,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          Center(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: QrImageView(
                  key: const ValueKey<String>('session-qr-code'),
                  data: inviteUri,
                  size: qrSize,
                  backgroundColor: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            '${l10n.sessionLabel}: ${invite.sessionId}',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (invite.groupMode)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                l10n.groupModeLabel,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${l10n.expiresLabel}: $expiresAt',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: inviteUri));
              if (!context.mounted) {
                return;
              }
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text(l10n.inviteLinkCopied)));
            },
            icon: const Icon(Icons.copy_all_outlined),
            label: Text(l10n.copyInviteLinkButton),
          ),
        ],
      ),
    );
  }
}
