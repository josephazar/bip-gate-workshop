import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gate_client/screens/login_screen.dart';
import 'package:gate_client/services/api_service.dart';
import 'package:gate_client/services/google_service.dart';
import 'package:gate_client/services/session_manager.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(int status, Object body) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('login -> forgot password -> code and new password -> back to login with a notice', (tester) async {
    final session = SessionManager(store: MemoryTokenStore())..markSignedOut();
    final calls = <String>[];
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      calls.add('${req.url.path} ${req.body}');
      if (req.url.path == '/auth/forgot-password') return _json(200, {'message': 'We sent a 6-digit code.'});
      if (req.body.contains('999999')) return _json(400, {'error': 'That code is wrong or has expired. Ask for a new one.'});
      return _json(200, {'message': 'Password changed. Sign in with your new password.'});
    }));

    await tester.pumpWidget(MaterialApp(
      home: ListenableBuilder(
        listenable: session,
        builder: (_, __) => LoginScreen(api: api, session: session, google: GoogleService()),
      ),
    ));

    await tester.enterText(find.byType(TextField).first, 'ada@example.test');
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.text('Reset your password'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'ada@example.test'), findsOneWidget); // the typed email is carried over

    await tester.tap(find.text('Send me a code'));
    await tester.pumpAndSettle();
    expect(find.text('Check your email'), findsOneWidget);

    // a wrong code shows the server's message and stays on the screen
    await tester.enterText(find.byType(TextFormField).at(0), '999999');
    await tester.enterText(find.byType(TextFormField).at(1), 'a long enough password');
    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();
    expect(find.textContaining('wrong or has expired'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), '123456');
    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsWidgets); // back on the login screen
    expect(find.text('Password changed. Sign in with your new password.'), findsOneWidget);
    expect(calls.last, contains('"code":"123456"'));
  });

  testWidgets('the reset form checks the code and the password before calling the server', (tester) async {
    final session = SessionManager(store: MemoryTokenStore())..markSignedOut();
    var calls = 0;
    final api = ApiService(session, baseUrl: 'http://x', client: MockClient((req) async {
      calls++;
      return _json(200, {'message': 'We sent a 6-digit code.'});
    }));
    await tester.pumpWidget(MaterialApp(
      home: ListenableBuilder(
        listenable: session,
        builder: (_, __) => LoginScreen(api: api, session: session, google: GoogleService()),
      ),
    ));
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'not an email');
    await tester.tap(find.text('Send me a code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(calls, 0);

    await tester.enterText(find.byType(TextField), 'ada@example.test');
    await tester.tap(find.text('Send me a code'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the 6 digits'), findsOneWidget);
    expect(find.text('Use 12 to 128 characters'), findsOneWidget);
    expect(calls, 1); // only the forgot-password call
  });
}
