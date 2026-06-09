import '../entities/user.dart';

// Port (Interface) for Authentication
abstract class AuthPort {
  Future<User> login(String identifier, String password);
  Future<User> register(String username, String email, String password);
  Future<void> logout();
  Future<User?> getCurrentUser();
  Future<String?> getToken();
}
