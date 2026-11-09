import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/api_service.dart';
import '../services/session_manager.dart';
import '../widgets/message_box.dart';

/// Step 2 of "Forgot password": the code from the email, and the new password.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({
    super.key,
    required this.api,
    required this.session,
    required this.email,
    required this.sentMessage,
  });

  final ApiService api;
  final SessionManager session;
  final String email;
  final String sentMessage;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _info = widget.sentMessage;
  }

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _reset() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final message = await widget.api.resetPassword(widget.email, _code.text.trim(), _password.text);
      widget.session.showNotice(message); // the login screen shows it
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
      return;
    } on ApiException catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _sendAgain() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      _info = await widget.api.forgotPassword(widget.email);
    } on ApiException catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('NEW PASSWORD')),
        body: SafeArea(
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text('Check your email', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(_info ?? ''),
                if (kDebugMode) ...[
                  const SizedBox(height: 8),
                  const MessageBox(
                    'Development build: this computer has no mail server, so the API prints the email.\n'
                    'Read the code with ./code.sh in the gate-workshop folder.',
                  ),
                ],
                const SizedBox(height: 16),
                TextFormField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  decoration: const InputDecoration(labelText: '6-digit code', border: OutlineInputBorder()),
                  validator: (v) => RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? null : 'Enter the 6 digits',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: const InputDecoration(
                    labelText: 'New password',
                    helperText: '12 to 128 characters. A long phrase is best.',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => (v ?? '').length < 12 || (v ?? '').length > 128
                      ? 'Use 12 to 128 characters'
                      : null,
                ),
                if (_error != null) ...[const SizedBox(height: 12), MessageBox(_error!, isError: true)],
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _reset, child: const Text('Change password')),
                const SizedBox(height: 8),
                TextButton(onPressed: _busy ? null : _sendAgain, child: const Text('Send a new code')),
              ],
            ),
          ),
        ),
      );
}
