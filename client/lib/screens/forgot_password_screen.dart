import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../services/session_manager.dart';
import '../widgets/message_box.dart';
import 'reset_password_screen.dart';

/// Step 1 of "Forgot password": ask for a one-time code to be emailed.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.api, required this.session, this.email = ''});

  final ApiService api;
  final SessionManager session;
  final String email; // what was already typed on the login screen

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.email);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = _email.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final message = await widget.api.forgotPassword(email);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => ResetPasswordScreen(api: widget.api, session: widget.session, email: email, sentMessage: message),
      ));
    } on ApiException catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('FORGOT PASSWORD')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text('Reset your password', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('Enter the email of your account. We send a 6-digit code to it.'),
              const SizedBox(height: 16),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                onSubmitted: (_) => _busy ? null : _send(),
              ),
              if (_error != null) ...[const SizedBox(height: 12), MessageBox(_error!, isError: true)],
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _send, child: const Text('Send me a code')),
            ],
          ),
        ),
      );
}
