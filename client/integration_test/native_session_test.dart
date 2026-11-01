import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:gate_client/session.dart';
import 'package:http/http.dart' as http;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native session reaches the local API and uses secure storage', (
    tester,
  ) async {
    expect(kIsWeb, isFalse);
    expect(Session.base, 'http://10.0.2.2:3220');
    final stamp = DateTime.now().microsecondsSinceEpoch;
    final email = 'qa-native-$stamp@example.test';
    final session = Session();
    final resumed = Session();
    try {
      await session.clear();
      await session.signIn('/auth/register', {
        'name': 'Native readiness fixture',
        'email': email,
        'password': 'local-readiness-only-$stamp',
      });
      expect(session.error, isNull);
      expect(session.user?['email'], email);
      expect(session.user?['role'], 'user');
      final first = await session.storage.read(key: 'gate_refresh');
      expect(first, isNotEmpty);
      expect((await session.request('/me'))['email'], email);
      await expectLater(
        session.request('/admin/users'),
        throwsA(predicate((e) => e.toString().contains('403:'))),
      );
      expect(await session.refresh(), isTrue);
      final rotated = await session.storage.read(key: 'gate_refresh');
      expect(rotated, isNot(first));
      // A new client reads Android secure storage and restores its session.
      await resumed.initialize();
      expect(resumed.user?['email'], email);
      final oldAccess = resumed.accessToken!;
      await resumed.logout();
      expect(await resumed.storage.read(key: 'gate_refresh'), isNull);
      final revoked = await http.get(
        Uri.parse('${Session.base}/me'),
        headers: {'authorization': 'Bearer $oldAccess'},
      );
      expect(revoked.statusCode, 401);
    } finally {
      await resumed.logout();
      await session.clear();
      resumed.dispose();
      session.dispose();
    }
  });
}
