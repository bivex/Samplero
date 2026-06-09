import '../entities/product.dart';

// Port (Interface) defined in the Domain layer
abstract class ProductRepository {
  Future<List<Product>> getProducts({int limit = 20, int offset = 0});
  Future<Product?> getProductBySlug(String slug);
}
