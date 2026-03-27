import 'package:flutter/material.dart';

class FullscreenComposerPage extends StatefulWidget {
  const FullscreenComposerPage({
    required this.initialText,
    required this.title,
    required this.hintText,
    super.key,
  });

  final String initialText;
  final String title;
  final String hintText;

  @override
  State<FullscreenComposerPage> createState() => _FullscreenComposerPageState();
}

class _FullscreenComposerPageState extends State<FullscreenComposerPage> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialText,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<bool> _handleWillPop() async {
    Navigator.of(context).pop(_controller.text);
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final Color composerControlColor = Theme.of(
      context,
    ).colorScheme.surfaceContainerHighest;
    return WillPopScope(
      onWillPop: _handleWillPop,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          actions: <Widget>[
            IconButton(
              onPressed: () {
                Navigator.of(context).pop(_controller.text);
              },
              icon: const Icon(Icons.check),
            ),
          ],
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: DecoratedBox(
              key: const ValueKey<String>('fullscreen-composer-shell'),
              decoration: BoxDecoration(
                color: composerControlColor,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                child: TextField(
                  key: const ValueKey<String>(
                    'fullscreen-composer-input-field',
                  ),
                  controller: _controller,
                  autofocus: true,
                  keyboardType: TextInputType.multiline,
                  textInputAction: TextInputAction.newline,
                  textAlignVertical: TextAlignVertical.top,
                  expands: true,
                  minLines: null,
                  maxLines: null,
                  decoration: InputDecoration(
                    hintText: widget.hintText,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    isCollapsed: true,
                    alignLabelWithHint: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
