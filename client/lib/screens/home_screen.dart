import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/access_token_claims.dart';
import '../services/api_service.dart';
import '../services/google_service.dart';
import '../services/session_manager.dart';
import '../widgets/message_box.dart';

/// Shown when somebody is signed in. Lets you poke the API and watch the access token.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.session, required this.google});

  final ApiService api;
  final SessionManager session;
  final GoogleService google;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _tick;
  bool _busy = false;
  String _output = 'Try the buttons below.';
  bool _outputIsError = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {})); // the countdown
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _call(String title, Future<Object?> Function() action) async {
    setState(() => _busy = true);
    try {
      final result = await action();
      _output = '$title\n${const JsonEncoder.withIndent('  ').convert(result)}';
      _outputIsError = false;
    } on ApiException catch (e) {
      _output = '$title\nHTTP ${e.status}: ${e.message}';
      _outputIsError = true;
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _callMe() => _call('GET /me', () async {
        final u = await widget.api.me();
        return {'id': u.id, 'email': u.email, 'name': u.name, 'role': u.role, 'provider': u.provider};
      });

  Future<void> _callAdmin() => _call('GET /admin/users', widget.api.adminUsers);

  Future<void> _refreshNow() async {
    setState(() => _busy = true);
    final ok = await widget.api.refreshNow();
    _output = ok
        ? 'POST /auth/refresh\nNew access token and new refresh token. The old refresh token cannot be used again.'
        : 'POST /auth/refresh\nRefresh refused.';
    _outputIsError = !ok;
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _signOut() async {
    setState(() => _busy = true);
    await widget.google.signOut();
    await widget.api.logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.session.user;
    final token = widget.session.accessToken;
    final claims = token == null ? null : AccessTokenClaims.decode(token);
    return Scaffold(
      appBar: AppBar(title: const Text('THE GATE')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (user != null)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.verified_user),
                  title: Text('Welcome, ${user.name}'),
                  subtitle: Text('${user.email}\nrole: ${user.role}   ·   signed in with: ${user.provider}'),
                  isThreeLine: true,
                ),
              ),
            const SizedBox(height: 8),
            Text('Your access token, decoded', style: Theme.of(context).textTheme.titleMedium),
            const Text('Readable, not secret: anyone can decode it. Only the server can verify it.'),
            const SizedBox(height: 8),
            MessageBox(_claimsText(claims), mono: true),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(onPressed: _busy ? null : _callMe, child: const Text('Call GET /me')),
              FilledButton.tonal(
                onPressed: _busy ? null : _callAdmin,
                child: const Text('Call admin route (expect 403)'),
              ),
              OutlinedButton(onPressed: _busy ? null : _refreshNow, child: const Text('Refresh token now')),
            ]),
            const SizedBox(height: 16),
            MessageBox(_output, isError: _outputIsError, mono: true),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _busy ? null : _signOut,
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }

  String _claimsText(AccessTokenClaims? c) {
    if (c == null) return 'No access token.';
    final left = c.remaining();
    final countdown = left.isNegative
        ? 'expired: the next call refreshes it'
        : 'expires in ${left.inMinutes}m ${(left.inSeconds % 60).toString().padLeft(2, '0')}s';
    return 'sub  ${c.subject}\nrole ${c.role}\niss  ${c.issuer}\naud  ${c.audience}\nexp  $countdown';
  }
}
