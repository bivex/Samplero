import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:io';

import 'infrastructure/api/strapi_product_repository.dart';
import 'infrastructure/native/ffi_crypto_adapter.dart';
import 'application/use_cases/get_products_use_case.dart';
import 'presentation/app.dart';

void main() {
  // --- Composition Root ---
  // Configuration
  const String apiUrl = 'http://10.0.2.2:1337'; // Change to 10.0.2.2 for Android emulator
  final String nativeLibPath = Platform.isWindows
      ? 'crypto.dll'
      : Platform.isMacOS || Platform.isIOS
          ? 'crypto.dylib' // Or bundled framework
          : 'libcrypto.so'; // Android/Linux

  // Infrastructure Setup
  final httpClient = http.Client();
  final productRepository = StrapiProductRepository(
    baseUrl: apiUrl,
    client: httpClient,
  );
  
  // NOTE: In a real run, you'd ensure libcrypto.so is bundled via CMake/build.gradle
  final cryptoAdapter = FfiCryptoAdapter(nativeLibPath);

  // Application Use Cases Setup
  final getProductsUseCase = GetProductsUseCase(productRepository);

  // Presentation Setup
  runApp(CustomerApp(
    getProductsUseCase: getProductsUseCase,
    cryptoPort: cryptoAdapter,
  ));
}
