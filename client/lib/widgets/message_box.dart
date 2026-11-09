import 'package:flutter/material.dart';

/// A small coloured box for an error or a result.
class MessageBox extends StatelessWidget {
  const MessageBox(this.text, {super.key, this.isError = false, this.mono = false});

  final String text;
  final bool isError;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isError ? scheme.errorContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        text,
        style: TextStyle(
          color: isError ? scheme.onErrorContainer : scheme.onSurface,
          fontFamily: mono ? 'NotoSansMono' : null,
          fontSize: mono ? 12 : 14,
        ),
      ),
    );
  }
}
