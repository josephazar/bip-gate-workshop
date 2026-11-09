import 'user.dart';

/// What the API returns after register, login, google and refresh.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
  });

  final String accessToken; // a JWT, valid for minutes
  final String refreshToken; // random, valid for days, works once
  final int expiresIn; // seconds
  final User user;

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: (json['expiresIn'] as num).toInt(),
        user: User.fromJson(json['user'] as Map<String, dynamic>),
      );
}
