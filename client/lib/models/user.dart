/// A person, as the API describes them. There is never a password in here.
class User {
  const User({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.methods,
  });

  final String id;
  final String email;
  final String name;
  final String role; // 'user' or 'admin'
  final List<String> methods; // the ways in: 'password', 'google', or both

  bool get hasGoogle => methods.contains('google');

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
        role: json['role'] as String,
        methods: ((json['methods'] as List?) ?? const ['password']).cast<String>(),
      );
}
