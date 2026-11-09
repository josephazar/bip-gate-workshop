import 'package:google_sign_in/google_sign_in.dart';

import '../config.dart';

class GoogleProblem implements Exception {
  const GoogleProblem(this.message);
  final String message;
  @override
  String toString() => message;
}

/// "Sign in with Google": opens Google's own window and returns an ID token.
/// The app never sees the Google password. The ID token is sent to OUR server, which verifies it.
class GoogleService {
  static Future<void>? _ready;

  static Future<void> _initialize() =>
      _ready ??= GoogleSignIn.instance.initialize(serverClientId: Config.googleWebClientId);

  /// The ID token, or null when the person closed the Google window.
  Future<String?> idToken() async {
    if (!Config.googleConfigured) throw const GoogleProblem('Google sign-in is not configured.');
    try {
      await _initialize();
      final account = await GoogleSignIn.instance.authenticate();
      final token = account.authentication.idToken;
      if (token == null) throw const GoogleProblem('Google did not return an ID token.');
      return token;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      throw GoogleProblem('Google sign-in failed (${e.code.name}).');
    }
  }

  Future<void> signOut() async {
    if (!Config.googleConfigured) return;
    try {
      await _initialize();
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Signing out of Google is best effort.
    }
  }
}
