import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../widgets/message_box.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.api});

  final ApiService api;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.register(_name.text.trim(), _email.text.trim(), _password.text);
      if (mounted) Navigator.of(context).pop(); // the signed-in app is underneath
      return;
    } on ApiException catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('CREATE AN ACCOUNT')),
        body: SafeArea(
          child: Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Enter your name' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                  validator: (v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch((v ?? '').trim())
                      ? null
                      : 'Enter a valid email address',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    helperText: '12 to 128 characters. A long phrase is best.',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => (v ?? '').length < 12 || (v ?? '').length > 128
                      ? 'Use 12 to 128 characters'
                      : null,
                ),
                if (_error != null) ...[const SizedBox(height: 12), MessageBox(_error!, isError: true)],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _register,
                  child: const Text('Create account'),
                ),
              ],
            ),
          ),
        ),
      );
}
