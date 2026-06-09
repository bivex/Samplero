import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../domain/entities/product.dart';
import '../../domain/repositories/product_repository.dart';

// Adapter (Infrastructure) implementing Domain Port
class StrapiProductRepository implements ProductRepository {
  final String baseUrl;
  final http.Client client;

  StrapiProductRepository({required this.baseUrl, required this.client});

  @override
  Future<List<Product>> getProducts({int limit = 20, int offset = 0}) async {
    final response = await client.get(
      Uri.parse('$baseUrl/api/license-server/products?pagination[limit]=$limit&pagination[start]=$offset'),
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch products: ${response.statusCode}');
    }

    final jsonBody = json.decode(response.body);
    final List<dynamic> data = jsonBody['data'] ?? [];

    return data.map((json) => _fromJson(json)).toList();
  }

  @override
  Future<Product?> getProductBySlug(String slug) async {
    final response = await client.get(
      Uri.parse('$baseUrl/api/license-server/products/$slug'),
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) throw Exception('API Error');

    final jsonBody = json.decode(response.body);
    return _fromJson(jsonBody['data']);
  }

  Product _fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['documentId'] ?? json['id'].toString(),
      name: json['name'],
      slug: json['slug'],
      description: json['description'] ?? '',
      price: Money(
        cents: json['price_cents'] ?? 0,
        currency: json['currency'] ?? 'USD',
      ),
      isActive: json['is_active'] ?? true,
    )..validate(); // Ensure invariants hold when crossing boundaries
  }
}
