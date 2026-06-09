import '../../domain/entities/product.dart';
import '../../domain/repositories/product_repository.dart';

class GetProductsUseCase {
  final ProductRepository _productRepository;

  // Dependency Injection via constructor
  GetProductsUseCase(this._productRepository);

  Future<List<Product>> execute() async {
    // Application logic: we only return active products
    final products = await _productRepository.getProducts();
    return products.where((p) => p.isActive).toList();
  }
}
