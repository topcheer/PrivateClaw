import 'package:flutter/material.dart';

import '../models/privateclaw_slash_command.dart';

class SlashCommandsSheet extends StatefulWidget {
  const SlashCommandsSheet({required this.commands, super.key});

  final List<PrivateClawSlashCommand> commands;

  @override
  State<SlashCommandsSheet> createState() => _SlashCommandsSheetState();
}

class _SlashCommandsSheetState extends State<SlashCommandsSheet> {
  final TextEditingController _searchController = TextEditingController();

  List<PrivateClawSlashCommand> get _filteredCommands {
    final String query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      return widget.commands;
    }
    return widget.commands
        .where((PrivateClawSlashCommand command) {
          final String haystack = '${command.slash} ${command.description}'
              .toLowerCase();
          return haystack.contains(query);
        })
        .toList(growable: false);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final List<PrivateClawSlashCommand> commands = _filteredCommands;
    final double keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final double screenHeight = MediaQuery.sizeOf(context).height;
    final double sheetHeight = screenHeight > 700 ? 520 : screenHeight * 0.72;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: keyboardInset),
      child: SizedBox(
        height: sheetHeight,
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: TextField(
                key: const ValueKey<String>('slash-command-search'),
                controller: _searchController,
                autofocus: true,
                onChanged: (_) {
                  setState(() {});
                },
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: MaterialLocalizations.of(context).searchFieldLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            Expanded(
              child: commands.isEmpty
                  ? const Center(child: Icon(Icons.search_off))
                  : ListView.separated(
                      padding: const EdgeInsets.only(bottom: 16),
                      itemCount: commands.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (BuildContext context, int index) {
                        final PrivateClawSlashCommand item = commands[index];
                        return ListTile(
                          leading: const Icon(Icons.terminal),
                          title: Text(item.slash),
                          subtitle: Text(item.description),
                          trailing: item.acceptsArgs
                              ? const Icon(Icons.edit_outlined)
                              : null,
                          onTap: () {
                            Navigator.of(context).pop(item);
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
