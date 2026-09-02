import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../domain/entities/license.dart';
import '../../domain/repositories/license_repository.dart';
import '../../domain/repositories/auth_port.dart';

class StrapiLicenseRepository implements LicenseRepository {
  final String baseUrl;
  final http.Client client;
  final AuthPort _authPort;

  StrapiLicenseRepository({
    required this.baseUrl,
    required this.client,
    required AuthPort authPort,
  }) : _authPort = authPort;

  @override
  Future<List<License>> getMyLicenses() async {
    final token = await _authPort.getToken();
    if (token == null) throw Exception('Not authenticated');

    final response = await client.get(
      Uri.parse('$baseUrl/api/license-server/me/licenses'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load licenses: ${response.body}');
    }

    final decoded = json.decode(response.body);
    final List<dynamic> data = decoded is List<dynamic>
        ? decoded
        : (decoded is Map<String, dynamic> && decoded['licenses'] is List<dynamic>)
            ? decoded['licenses'] as List<dynamic>
            : [];
    return data.map((json) => License.fromJson(json as Map<String, dynamic>)).toList();
  }
}
