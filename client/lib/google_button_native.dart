import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

Widget googleButton() => OutlinedButton.icon(
  onPressed: () async {
    try {
      await GoogleSignIn.instance.authenticate();
    } catch (e) {
      debugPrint('Google authentication cancelled or unavailable.');
    }
  },
  icon: const Icon(Icons.account_circle),
  label: const Text('Continue with Google'),
);
