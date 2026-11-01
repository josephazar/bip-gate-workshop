import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class Session extends ChangeNotifier {
  static const base = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3220',
  );
  final http.Client client = http.Client();
  final FlutterSecureStorage storage = const FlutterSecureStorage();
  String? accessToken, _refreshToken;
  Map<String, dynamic>? user;
  Future<bool>? _refreshing;
  String? error;
  bool busy = false;

  Future<void> initialize() async {
    // Web deliberately has no persistent bearer token. Reload signs out.
    if (!kIsWeb) {
      _refreshToken = await storage.read(key: 'gate_refresh');
      if (_refreshToken != null) {
        await refresh();
      }
    }
  }

  Future<http.Response> _send(
    String path,
    Map<String, dynamic>? body, {
    String? token,
  }) {
    final headers = <String, String>{
      'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
    };
    final uri = Uri.parse('$base$path');
    return (body == null
            ? client.get(uri, headers: headers)
            : client.post(uri, headers: headers, body: jsonEncode(body)))
        .timeout(const Duration(seconds: 20));
  }

  Map<String, dynamic> _object(http.Response r) =>
      jsonDecode(r.body) as Map<String, dynamic>;
  Future<void> _accept(Map<String, dynamic> data) async {
    accessToken = data['accessToken'] as String;
    _refreshToken = data['refreshToken'] as String;
    user = data['user'] as Map<String, dynamic>;
    if (!kIsWeb) {
      await storage.write(key: 'gate_refresh', value: _refreshToken);
    }
    notifyListeners();
  }

  Future<void> signIn(String path, Map<String, dynamic> body) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      final r = await _send(path, body);
      final data = _object(r);
      if (r.statusCode >= 400) {
        throw Exception(data['error']);
      }
      await _accept(data);
    } catch (e) {
      error = e.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> refresh() {
    // Every concurrent 401 awaits the same rotation, preventing accidental reuse.
    return _refreshing ??= _rotate().whenComplete(() => _refreshing = null);
  }

  Future<bool> _rotate() async {
    if (_refreshToken == null) {
      return false;
    }
    try {
      final r = await _send('/auth/refresh', {'refreshToken': _refreshToken});
      if (r.statusCode != 200) {
        await clear();
        return false;
      }
      await _accept(_object(r));
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<dynamic> request(String path, {Map<String, dynamic>? body}) async {
    final original = accessToken;
    var r = await _send(path, body, token: original);
    if (r.statusCode == 401) {
      // A different request may already have completed the refresh.
      final renewed = accessToken != original || await refresh();
      if (renewed) {
        r = await _send(path, body, token: accessToken);
      }
    }
    final data = r.statusCode == 204 ? null : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      throw Exception('${r.statusCode}: ${data['error']}');
    }
    return data;
  }

  Future<void> clear() async {
    accessToken = null;
    _refreshToken = null;
    user = null;
    if (!kIsWeb) {
      await storage.delete(key: 'gate_refresh');
    }
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await _send('/auth/logout', {'refreshToken': _refreshToken});
    } finally {
      await clear();
    }
  }

  @override
  void dispose() {
    client.close();
    super.dispose();
  }
}
