import 'dart:convert';

/// The readable middle part of a JWT. Anyone can decode it: it is NOT secret,
/// and decoding does not prove anything. Only the server can verify the signature.
class AccessTokenClaims {
  const AccessTokenClaims({
    required this.subject,
    required this.role,
    required this.issuer,
    required this.audience,
    required this.issuedAt,
    required this.expiresAt,
  });

  final String subject;
  final String role;
  final String issuer;
  final String audience;
  final DateTime issuedAt;
  final DateTime expiresAt;

  Duration remaining([DateTime? now]) => expiresAt.difference(now ?? DateTime.now());

  /// Returns null when the text is not a JWT.
  static AccessTokenClaims? decode(String jwt) {
    final parts = jwt.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(payload) as Map<String, dynamic>;
      final aud = json['aud'];
      return AccessTokenClaims(
        subject: json['sub'] as String,
        role: (json['role'] as String?) ?? '',
        issuer: (json['iss'] as String?) ?? '',
        audience: aud is List ? aud.join(', ') : (aud as String? ?? ''),
        issuedAt: DateTime.fromMillisecondsSinceEpoch((json['iat'] as num).toInt() * 1000),
        expiresAt: DateTime.fromMillisecondsSinceEpoch((json['exp'] as num).toInt() * 1000),
      );
    } catch (_) {
      return null;
    }
  }
}
