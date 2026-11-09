import 'package:flutter/material.dart';

/// Shown for a moment while the app looks for a saved session.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.shield_outlined, size: 64),
              SizedBox(height: 16),
              Text('THE GATE', style: TextStyle(fontSize: 22, letterSpacing: 4)),
              SizedBox(height: 24),
              CircularProgressIndicator(),
            ],
          ),
        ),
      );
}
