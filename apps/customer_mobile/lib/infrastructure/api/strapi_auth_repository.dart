import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../domain/entities/user.dart';
import '../../domain/repositories/auth_port.dart';

class StrapiAuthRepository implements AuthPort {
  final String baseUrl;
  final http.Client client;
  
  String? _jwt;
  User? _currentUser;

  StrapiAuthRepository({required this.baseUrl, required this.client});

  @override
  Future<User> login(String identifier, String password) async {
    final response = await client.post(
      Uri.parse('$baseUrl/api/auth/local'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'identifier': identifier,
        'password': password,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Login failed: ${response.body}');
    }

    final data = json.decode(response.body);
    _jwt = data['jwt'];
    
    _currentUser = User(
      id: data['user']['id'].toString(),
      email: data['user']['email'],
      username: data['user']['username'],
    );
    
    return _currentUser!;
  }

  @override
  Future<User> register(String username, String email, String password) async {
    final response = await client.post(
      Uri.parse('$baseUrl/api/auth/local/register'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'username': username,
        'email': email,
        'password': password,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Registration failed: ${response.body}');
    }

    final data = json.decode(response.body);
    _jwt = data['jwt'];
    
    _currentUser = User(
      id: data['user']['id'].toString(),
      email: data['user']['email'],
      username: data['user']['username'],
    );
    
    return _currentUser!;
  }

  @override
  Future<void> logout() async {
    _jwt = null;
    _currentUser = null;
  }

  @override
  Future<User?> getCurrentUser() async {
    return _currentUser;
  }

  @override
  Future<String?> getToken() async {
    return _jwt;
  }
}
