import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/google_service.dart';
import 'services/session_manager.dart';

void main() => runApp(const GateApp());

class GateApp extends StatefulWidget {
  const GateApp({super.key});

  @override
  State<GateApp> createState() => _GateAppState();
}

class _GateAppState extends State<GateApp> {
  final session = SessionManager();
  late final api = ApiService(session);
  final google = GoogleService();

  @override
  void initState() {
    super.initState();
    api.restoreSession(); // is there a saved session? then the splash screen turns into the home screen
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'The Gate',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          fontFamily: 'NotoSans',
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff099bdd)),
          useMaterial3: true,
        ),
        // The AuthGate: which screen to show depends only on the session.
        home: ListenableBuilder(
          listenable: session,
          builder: (context, _) => switch (session.status) {
            SessionStatus.loading => const SplashScreen(),
            SessionStatus.signedOut => LoginScreen(api: api, session: session, google: google),
            SessionStatus.signedIn => HomeScreen(api: api, session: session, google: google),
          },
        ),
      );
}
