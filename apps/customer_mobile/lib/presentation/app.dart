import 'package:flutter/material.dart';
import '../domain/entities/product.dart';
import '../application/use_cases/get_products_use_case.dart';
import '../domain/repositories/crypto_port.dart';

class CustomerApp extends StatelessWidget {
  final GetProductsUseCase getProductsUseCase;
  final CryptoPort cryptoPort;

  // Dependencies injected from the composition root (main.dart)
  const CustomerApp({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Samplero Customer Portal',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: ProductListScreen(
        getProductsUseCase: getProductsUseCase,
        cryptoPort: cryptoPort,
      ),
    );
  }
}

class ProductListScreen extends StatefulWidget {
  final GetProductsUseCase getProductsUseCase;
  final CryptoPort cryptoPort;

  const ProductListScreen({
    super.key,
    required this.getProductsUseCase,
    required this.cryptoPort,
  });

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  late Future<List<Product>> _productsFuture;
  String _fingerprint = '';

  @override
  void initState() {
    super.initState();
    _productsFuture = widget.getProductsUseCase.execute();
    
    // Demonstrate using the C++ Crypto Adapter
    try {
      _fingerprint = widget.cryptoPort.generateDeviceFingerprint();
    } catch (e) {
      _fingerprint = 'Native lib not loaded: $e';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Storefront'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: Text('Device: $_fingerprint', style: const TextStyle(fontSize: 10)),
        ),
      ),
      body: FutureBuilder<List<Product>>(
        future: _productsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final products = snapshot.data ?? [];
          if (products.isEmpty) {
            return const Center(child: Text('No active products found.'));
          }

          return ListView.builder(
            itemCount: products.length,
            itemBuilder: (context, index) {
              final product = products[index];
              return ListTile(
                title: Text(product.name),
                subtitle: Text(product.description),
                trailing: Text('\$${(product.price.cents / 100).toStringAsFixed(2)}'),
                onTap: () {
                  // Navigate to details or checkout (Phase 2)
                },
              );
            },
          );
        },
      ),
    );
  }
}
