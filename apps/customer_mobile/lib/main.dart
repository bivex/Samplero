import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:io';

import 'infrastructure/api/strapi_product_repository.dart';
import 'infrastructure/api/strapi_auth_repository.dart';
import 'infrastructure/api/strapi_license_repository.dart';
import 'infrastructure/native/ffi_crypto_adapter.dart';
import 'application/use_cases/get_products_use_case.dart';
import 'presentation/app.dart';
import 'domain/repositories/crypto_port.dart';

class MockCryptoAdapter implements CryptoPort {
  @override
  String generateDeviceFingerprint() => 'mock-fingerprint-no-native-lib';

  @override
  String generateCsr() => 'mock-csr';

  @override
  String signPayload(String payload) => 'mock-signature';
}

void main() {
  const String apiUrl = 'http://10.0.2.2:1337';
  final String nativeLibPath = Platform.isWindows
      ? 'samplero_crypto.dll'
      : Platform.isMacOS || Platform.isIOS
          ? 'samplero_crypto.dylib'
          : 'libsamplero_crypto.so';

  final httpClient = http.Client();

  final authRepository = StrapiAuthRepository(
    baseUrl: apiUrl,
    client: httpClient,
  );

  final productRepository = StrapiProductRepository(
    baseUrl: apiUrl,
    client: httpClient,
    authPort: authRepository,
  );

  final licenseRepository = StrapiLicenseRepository(
    baseUrl: apiUrl,
    client: httpClient,
    authPort: authRepository,
  );

  CryptoPort cryptoAdapter;
  try {
    cryptoAdapter = FfiCryptoAdapter(nativeLibPath);
  } catch (e) {
    debugPrint('Failed to load native crypto library: $e');
    cryptoAdapter = MockCryptoAdapter();
  }

  final getProductsUseCase = GetProductsUseCase(productRepository);

  runApp(CustomerApp(
    getProductsUseCase: getProductsUseCase,
    cryptoPort: cryptoAdapter,
    authPort: authRepository,
    licenseRepository: licenseRepository,
  ));
}
