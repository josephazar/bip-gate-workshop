import 'package:flutter/material.dart';

import '../config.dart';
import '../services/api_service.dart';
import '../services/google_service.dart';
import '../services/session_manager.dart';
import '../widgets/message_box.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.session, required this.google});

  final ApiService api;
  final SessionManager session;
  final GoogleService google;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Runs one action, shows the error if it fails, and keeps the buttons disabled meanwhile.
  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      _error = e.message;
    } on GoogleProblem catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _signIn() => _run(() => widget.api.login(_email.text.trim(), _password.text));

  Future<void> _signInWithGoogle() => _run(() async {
        final idToken = await widget.google.idToken(); // Google's own window
        if (idToken != null) await widget.api.loginWithGoogle(idToken); // our server verifies it
      });

  @override
  Widget build(BuildContext context) {
    final notice = widget.session.notice;
    return Scaffold(
      appBar: AppBar(title: const Text('THE GATE')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text('Sign in', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            if (notice != null) ...[MessageBox(notice), const SizedBox(height: 12)],
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
              onSubmitted: (_) => _busy ? null : _signIn(),
            ),
            if (_error != null) ...[const SizedBox(height: 12), MessageBox(_error!, isError: true)],
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _signIn, child: const Text('Sign in')),
            const SizedBox(height: 12),
            const Row(children: [
              Expanded(child: Divider()),
              Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('or')),
              Expanded(child: Divider()),
            ]),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy || !Config.googleConfigured ? null : _signInWithGoogle,
              icon: const Icon(Icons.account_circle),
              label: const Text('Sign in with Google'),
            ),
            if (!Config.googleConfigured)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Google sign-in is not configured', textAlign: TextAlign.center),
              ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => RegisterScreen(api: widget.api),
                      )),
              child: const Text('Create an account'),
            ),
          ],
        ),
      ),
    );
  }
}
