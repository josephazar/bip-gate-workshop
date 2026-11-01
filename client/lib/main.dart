import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'google_button.dart';
import 'session.dart';

void main() => runApp(const GateApp());

class GateApp extends StatefulWidget {
  const GateApp({super.key});
  @override
  State<GateApp> createState() => _GateAppState();
}

class _GateAppState extends State<GateApp> {
  final session = Session();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController();
  StreamSubscription<GoogleSignInAuthenticationEvent>? googleEvents;
  bool register = false, googleReady = false, linking = false;
  String output = 'Sign in to inspect your session and test the API.';
  static const googleId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
  @override
  void initState() {
    super.initState();
    session.addListener(changed);
    unawaited(session.initialize());
    if (googleId.isNotEmpty) {
      unawaited(setupGoogle());
    }
  }

  void changed() {
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> setupGoogle() async {
    try {
      await GoogleSignIn.instance.initialize(
        clientId: kIsWeb ? googleId : null,
        serverClientId: googleId,
      );
      googleEvents = GoogleSignIn.instance.authenticationEvents.listen(
        (event) async {
          if (event is GoogleSignInAuthenticationEventSignIn) {
            final token = event.user.authentication.idToken;
            if (token == null) {
              setState(() => output = 'Google did not return an ID token.');
              return;
            }
            if (linking) {
              await showResult(
                () => session.request(
                  '/auth/google/link',
                  body: {'idToken': token},
                ),
              );
            } else {
              await session.signIn('/auth/google', {'idToken': token});
            }
            linking = false;
          }
        },
        onError: (Object e) {
          if (mounted) {
            setState(() => output = 'Google Sign-In unavailable: $e');
          }
        },
      );
      if (mounted) {
        setState(() => googleReady = true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => output = 'Google configuration required: $e');
      }
    }
  }

  Future<void> showResult(Future<dynamic> Function() operation) async {
    try {
      final result = await operation();
      if (mounted) {
        setState(
          () => output = const JsonEncoder.withIndent('  ').convert(result),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => output = e.toString());
      }
    }
  }

  @override
  void dispose() {
    googleEvents?.cancel();
    session.removeListener(changed);
    session.dispose();
    email.dispose();
    password.dispose();
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'The Gate | BIP 2026',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(fontFamily: 'NotoSans',
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff099bdd)),
      useMaterial3: true,
    ),
    home: Scaffold(
      appBar: AppBar(title: const Text('THE GATE  /  BIP 2026')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: ListView(
            padding: const EdgeInsets.all(28),
            children: [
              Text(
                'Who may enter?',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 8),
              Text(
                kIsWeb
                    ? 'Web demo: tokens stay in memory. Reload signs out.'
                    : 'Mobile demo: refresh token in platform secure storage; access token in memory.',
              ),
              const SizedBox(height: 24),
              if (session.user == null) ...[
                if (register)
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Name'),
                  ),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password (12 to 128 characters)',
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: session.busy
                      ? null
                      : () => session.signIn(
                          register ? '/auth/register' : '/auth/login',
                          {
                            'email': email.text,
                            'password': password.text,
                            'name': name.text,
                          },
                        ),
                  child: Text(register ? 'Create account' : 'Sign in'),
                ),
                TextButton(
                  onPressed: () => setState(() => register = !register),
                  child: Text(
                    register
                        ? 'Already registered? Sign in'
                        : 'Create a workshop account',
                  ),
                ),
                if (googleReady) googleButton(),
                if (!googleReady)
                  const Text(
                    'Google Sign-In becomes available when a Google web client ID is configured.',
                  ),
              ] else ...[
                Text(
                  '${session.user!['name']}  |  ${session.user!['role']}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(session.user!['email'] as String),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton(
                      onPressed: () => showResult(() => session.request('/me')),
                      child: const Text('GET /me'),
                    ),
                    OutlinedButton(
                      onPressed: () =>
                          showResult(() => session.request('/admin/users')),
                      child: const Text('Test admin API'),
                    ),
                    OutlinedButton(
                      onPressed: () => showResult(
                        () async => {'refreshed': await session.refresh()},
                      ),
                      child: const Text('Rotate refresh token'),
                    ),
                    OutlinedButton(
                      onPressed: () => showResult(() async {
                        await session.logout();
                        return {'signedOut': true};
                      }),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
                if (googleReady) ...[
                  const SizedBox(height: 16),
                  CheckboxListTile(
                    value: linking,
                    onChanged: (v) => setState(() => linking = v ?? false),
                    title: const Text(
                      'Link the next Google sign-in to this account',
                    ),
                  ),
                  googleButton(),
                ],
              ],
              if (session.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(
                    session.error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 24),
              const Text(
                'API result',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xff11263a),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: SelectableText(
                  output,
                  style: const TextStyle(
                    color: Colors.white,
                    fontFamily: 'NotoSansMono',
                  ),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'A hidden button is a user-interface choice. The server must decide access on every request.',
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
