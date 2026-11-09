import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/auth_session.dart';
import '../models/user.dart';
import 'session_manager.dart';

/// A failed call, with the HTTP status (0 = the server could not be reached) and a message for people.
class ApiException implements Exception {
  const ApiException(this.status, this.message, [this.code]);
  final int status;
  final String message;
  final String? code; // a short name for the problem, when the API gives one

  /// The API answers errors as {"error": "...", "code": "..."}.
  factory ApiException.fromResponse(int status, String body) {
    try {
      final json = jsonDecode(body);
      if (json is Map && json['error'] is String) {
        return ApiException(status, json['error'] as String, json['code'] as String?);
      }
    } catch (_) {}
    return ApiException(status, 'Something went wrong (HTTP $status).');
  }

  @override
  String toString() => message;
}

/// Every call to the REST API. Retrofit's job on Android; here it is plain http.
class ApiService {
  ApiService(this.session, {http.Client? client, String? baseUrl})
      : _http = client ?? http.Client(),
        _base = baseUrl ?? Config.apiUrl;

  final SessionManager session;
  final http.Client _http;
  final String _base;
  Future<bool>? _refreshing;

  // ── Sign in, sign up ─────────────────────────────────────────────────────────
  Future<void> register(String name, String email, String password) =>
      _signIn('/auth/register', {'name': name, 'email': email, 'password': password});

  Future<void> login(String email, String password) =>
      _signIn('/auth/login', {'email': email, 'password': password});

  Future<void> loginWithGoogle(String idToken) => _signIn('/auth/google', {'idToken': idToken});

  // ── Forgot password: a one-time code by email, then a new password ─────────────
  /// Asks for a code. The answer is the same whether or not the email has an account.
  Future<String> forgotPassword(String email) => _message('/auth/forgot-password', {'email': email});

  Future<String> resetPassword(String email, String code, String password) =>
      _message('/auth/reset-password', {'email': email, 'code': code, 'password': password});

  Future<String> _message(String path, Map<String, dynamic> body) async {
    final json = await _send('POST', path, body: body) as Map<String, dynamic>;
    return json['message'] as String;
  }

  // ── Link Google to the account you are signed in to ────────────────────────────
  Future<void> linkGoogle(String idToken) async {
    final body = {'idToken': idToken};
    final json = await _authorized('POST', '/auth/google/link', body: body) as Map<String, dynamic>;
    session.updateUser(User.fromJson(json));
  }

  Future<void> _signIn(String path, Map<String, dynamic> body) async {
    final json = await _send('POST', path, body: body) as Map<String, dynamic>;
    await session.save(AuthSession.fromJson(json));
  }

  // ── Protected calls: if the access token has expired, refresh once and try again ──
  Future<User> me() async => User.fromJson(await _authorized('GET', '/me') as Map<String, dynamic>);

  Future<List<dynamic>> adminUsers() async => await _authorized('GET', '/admin/users') as List<dynamic>;

  Future<dynamic> _authorized(String method, String path, {Map<String, dynamic>? body}) async {
    try {
      return await _send(method, path, body: body, token: session.accessToken);
    } on ApiException catch (e) {
      if (e.status != 401) rethrow;
      if (!await _refresh()) rethrow; // the refresh failed: we are signed out now
      return _send(method, path, body: body, token: session.accessToken); // one retry
    }
  }

  // ── Refresh: several calls may need it at once, so they all share ONE request ──
  /// Returns true when we now hold a fresh pair of tokens.
  Future<bool> refreshNow() => _refresh();

  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final token = session.refreshToken;
    if (token == null) return false;
    try {
      final json = await _send('POST', '/auth/refresh', body: {'refreshToken': token}) as Map<String, dynamic>;
      await session.save(AuthSession.fromJson(json));
      return true;
    } on ApiException catch (e) {
      // 401: the session was revoked or has expired. Anything else (no network): keep the token.
      if (e.status == 401) await session.clear(notice: 'Your session ended. Please sign in again.');
      return false;
    }
  }

  /// On app start: trade the stored refresh token for a new session, if there is one.
  Future<void> restoreSession() async {
    final stored = await session.readStoredRefreshToken();
    if (stored == null) return session.markSignedOut();
    session.refreshToken = stored;
    if (!await _refresh() && session.status != SessionStatus.signedOut) session.markSignedOut();
  }

  Future<void> logout() async {
    final token = session.refreshToken;
    try {
      if (token != null) await _send('POST', '/auth/logout', body: {'refreshToken': token});
    } on ApiException {
      // Even if the server cannot be reached, this device forgets the session.
    }
    await session.clear();
  }

  // ── One place that talks HTTP ─────────────────────────────────────────────────
  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, String? token}) async {
    final uri = Uri.parse('$_base$path');
    final headers = {
      'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
    };
    http.Response response;
    try {
      final request = method == 'GET'
          ? _http.get(uri, headers: headers)
          : _http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
      response = await request.timeout(const Duration(seconds: 15));
    } on Exception {
      throw const ApiException(0, 'Cannot reach the server. Is the API running?');
    }
    if (response.statusCode >= 400) throw ApiException.fromResponse(response.statusCode, response.body);
    return response.body.isEmpty ? null : jsonDecode(response.body);
  }
}
