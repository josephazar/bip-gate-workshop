import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:gate_client/services/api_service.dart';
import 'package:gate_client/services/session_manager.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> _session(String access, String refresh) => {
      'accessToken': access,
      'refreshToken': refresh,
      'expiresIn': 900,
      'user': {'id': 'u1', 'email': 'a@b.co', 'name': 'Ada', 'role': 'user', 'methods': ['password']},
    };

http.Response _json(int status, Object body) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('API errors keep the message the server sent', () {
    final e = ApiException.fromResponse(401, '{"error":"Wrong email or password."}');
    expect(e.status, 401);
    expect(e.message, 'Wrong email or password.');
  });

  test('an unreadable error body gets a generic message', () {
    expect(ApiException.fromResponse(502, '<html>Bad gateway</html>').message, contains('502'));
  });

  test('login stores the session; the refresh token goes to the store', () async {
    final store = MemoryTokenStore();
    final session = SessionManager(store: store);
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((_) async => _json(200, _session('a1', 'r1'))));
    await api.login('a@b.co', 'a long enough password');
    expect(session.status, SessionStatus.signedIn);
    expect(session.accessToken, 'a1');
    expect(await store.read(), 'r1');
  });

  test('an expired access token is refreshed once and the call is retried', () async {
    final session = SessionManager(store: MemoryTokenStore());
    var meCalls = 0, refreshCalls = 0;
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      if (req.url.path == '/auth/login') return _json(200, _session('old', 'r1'));
      if (req.url.path == '/auth/refresh') {
        refreshCalls++;
        return _json(200, _session('new', 'r2'));
      }
      meCalls++;
      return req.headers['authorization'] == 'Bearer new'
          ? _json(200, _session('', '')['user']!)
          : _json(401, {'error': 'Your sign-in is invalid or expired.'});
    }));
    await api.login('a@b.co', 'a long enough password');
    expect((await api.me()).name, 'Ada');
    expect(meCalls, 2);
    expect(refreshCalls, 1);
    expect(session.refreshToken, 'r2');
  });

  test('several calls that fail at once share one refresh', () async {
    final session = SessionManager(store: MemoryTokenStore());
    var refreshCalls = 0;
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      if (req.url.path == '/auth/login') return _json(200, _session('old', 'r1'));
      if (req.url.path == '/auth/refresh') {
        refreshCalls++;
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return _json(200, _session('new', 'r2'));
      }
      return req.headers['authorization'] == 'Bearer new'
          ? _json(200, _session('', '')['user']!)
          : _json(401, {'error': 'expired'});
    }));
    await api.login('a@b.co', 'a long enough password');
    await Future.wait([api.me(), api.me(), api.me()]);
    expect(refreshCalls, 1);
  });

  test('when the refresh is refused the person is signed out', () async {
    final session = SessionManager(store: MemoryTokenStore());
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      if (req.url.path == '/auth/login') return _json(200, _session('old', 'r1'));
      return _json(401, {'error': 'Please sign in again.'});
    }));
    await api.login('a@b.co', 'a long enough password');
    await expectLater(api.me(), throwsA(isA<ApiException>()));
    expect(session.status, SessionStatus.signedOut);
    expect(session.accessToken, isNull);
  });

  test('a 403 is passed on and does not sign anyone out', () async {
    final session = SessionManager(store: MemoryTokenStore());
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      if (req.url.path == '/auth/login') return _json(200, _session('a1', 'r1'));
      return _json(403, {'error': 'You are signed in, but you may not do this.'});
    }));
    await api.login('a@b.co', 'a long enough password');
    await expectLater(api.adminUsers(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
    expect(session.status, SessionStatus.signedIn);
  });

  test('the API error code is kept, so the app can react to it', () {
    final e = ApiException.fromResponse(409, '{"error":"Link it.","code":"email_has_password"}');
    expect(e.code, 'email_has_password');
    expect(ApiException.fromResponse(401, '{"error":"No."}').code, isNull);
  });

  test('forgot and reset call the right doors and return the server message', () async {
    final seen = <String>[];
    final api = ApiService(SessionManager(store: MemoryTokenStore()), baseUrl: 'http://x', client: MockClient((req) async {
      seen.add('${req.method} ${req.url.path} ${req.body}');
      return _json(200, {'message': 'ok ${req.url.path}'});
    }));
    expect(await api.forgotPassword('a@b.co'), 'ok /auth/forgot-password');
    expect(await api.resetPassword('a@b.co', '123456', 'a long enough password'), 'ok /auth/reset-password');
    expect(seen[0], contains('"email":"a@b.co"'));
    expect(seen[1], contains('"code":"123456"'));
  });

  test('linking Google sends the token with the access token and updates the user', () async {
    final session = SessionManager(store: MemoryTokenStore());
    String? auth, body;
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      if (req.url.path == '/auth/login') return _json(200, _session('a1', 'r1'));
      auth = req.headers['authorization'];
      body = req.body;
      return _json(200, {'id': 'u1', 'email': 'a@b.co', 'name': 'Ada', 'role': 'user', 'methods': ['password', 'google']});
    }));
    await api.login('a@b.co', 'a long enough password');
    expect(session.user!.hasGoogle, isFalse);
    await api.linkGoogle('google-id-token');
    expect(auth, 'Bearer a1');
    expect(body, contains('google-id-token'));
    expect(session.user!.hasGoogle, isTrue);
    expect(session.user!.methods, ['password', 'google']);
  });
}
