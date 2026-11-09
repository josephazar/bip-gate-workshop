import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:gate_client/models/access_token_claims.dart';

String _jwt(Map<String, Object?> payload) {
  String part(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part(payload)}.signature';
}

void main() {
  test('decodes the readable claims of an access token', () {
    final claims = AccessTokenClaims.decode(_jwt({
      'sub': 'user-1',
      'role': 'admin',
      'iss': 'bip-gate',
      'aud': 'bip-gate-api',
      'iat': 1700000000,
      'exp': 1700000900,
    }))!;
    expect(claims.subject, 'user-1');
    expect(claims.role, 'admin');
    expect(claims.audience, 'bip-gate-api');
    expect(claims.expiresAt.difference(claims.issuedAt), const Duration(minutes: 15));
    expect(claims.remaining(claims.expiresAt.subtract(const Duration(seconds: 30))), const Duration(seconds: 30));
  });

  test('an audience list is joined', () {
    final claims = AccessTokenClaims.decode(_jwt({'sub': 'u', 'aud': ['a', 'b'], 'iat': 1, 'exp': 2}))!;
    expect(claims.audience, 'a, b');
  });

  test('text that is not a JWT gives null, not a crash', () {
    expect(AccessTokenClaims.decode('nope'), isNull);
    expect(AccessTokenClaims.decode('a.b.c'), isNull);
    expect(AccessTokenClaims.decode(_jwt({'role': 'user'})), isNull); // no sub / exp
  });
}
