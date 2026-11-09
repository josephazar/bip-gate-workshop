import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/auth_session.dart';
import '../models/user.dart';

/// Where the long-lived refresh token is kept between app launches.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> delete();
}

/// Android Keystore / iOS Keychain through flutter_secure_storage.
class SecureTokenStore implements TokenStore {
  const SecureTokenStore();
  static const _key = 'gate_refresh_token';
  static const _storage = FlutterSecureStorage();

  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  @override
  Future<void> delete() => _storage.delete(key: _key);
}

/// Keeps nothing after the app closes (used on the web and in tests).
class MemoryTokenStore implements TokenStore {
  String? _token;
  @override
  Future<String?> read() async => _token;
  @override
  Future<void> write(String token) async => _token = token;
  @override
  Future<void> delete() async => _token = null;
}

enum SessionStatus { loading, signedOut, signedIn }

/// Who is signed in, and the two tokens.
/// The access token lives in memory only; the refresh token is the one kept in secure storage.
class SessionManager extends ChangeNotifier {
  SessionManager({TokenStore? store})
      : _store = store ?? (kIsWeb ? MemoryTokenStore() : const SecureTokenStore());

  final TokenStore _store;

  SessionStatus status = SessionStatus.loading;
  String? accessToken;
  String? refreshToken;
  User? user;
  String? notice; // shown on the login screen, e.g. "Your session ended."

  Future<String?> readStoredRefreshToken() => _store.read();

  Future<void> save(AuthSession session) async {
    accessToken = session.accessToken;
    refreshToken = session.refreshToken;
    user = session.user;
    notice = null;
    status = SessionStatus.signedIn;
    await _store.write(session.refreshToken);
    notifyListeners();
  }

  /// The same person with a changed account (for example, Google was just linked).
  void updateUser(User updated) {
    user = updated;
    notifyListeners();
  }

  /// A message for the login screen, e.g. "Password changed."
  void showNotice(String text) {
    notice = text;
    notifyListeners();
  }

  Future<void> clear({String? notice}) async {
    accessToken = null;
    refreshToken = null;
    user = null;
    this.notice = notice;
    status = SessionStatus.signedOut;
    await _store.delete();
    notifyListeners();
  }

  /// No stored session: show the login screen (the stored token, if any, is kept).
  void markSignedOut() {
    status = SessionStatus.signedOut;
    notifyListeners();
  }
}
