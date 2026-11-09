import 'package:flutter/foundation.dart';

/// Settings passed at build time:  flutter run --dart-define=API_URL=...  --dart-define=GOOGLE_WEB_CLIENT_ID=...
class Config {
  static const _apiUrl = String.fromEnvironment('API_URL');

  /// The Android emulator reaches the computer's localhost at 10.0.2.2.
  static String get apiUrl {
    if (_apiUrl.isNotEmpty) return _apiUrl;
    final onAndroid = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
    return onAndroid ? 'http://10.0.2.2:3220' : 'http://localhost:3220';
  }

  /// The WEB client ID from Google Cloud (a public identifier). The API accepts tokens made for it.
  static const googleWebClientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
  static bool get googleConfigured => googleWebClientId.isNotEmpty && !kIsWeb;
}
