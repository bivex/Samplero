import 'dart:ffi';
import 'package:ffi/ffi.dart';
import '../../domain/repositories/crypto_port.dart';

// Native function signatures
typedef GenerateDeviceFingerprintC = Pointer<Utf8> Function();
typedef GenerateDeviceFingerprintDart = Pointer<Utf8> Function();

typedef GenerateCsrC = Pointer<Utf8> Function();
typedef GenerateCsrDart = Pointer<Utf8> Function();

typedef SignPayloadC = Pointer<Utf8> Function(Pointer<Utf8> payload);
typedef SignPayloadDart = Pointer<Utf8> Function(Pointer<Utf8> payload);

// Adapter (Infrastructure) implementing Domain Port via C++ FFI
class FfiCryptoAdapter implements CryptoPort {
  late final DynamicLibrary _lib;

  late final GenerateDeviceFingerprintDart _generateDeviceFingerprint;
  late final GenerateCsrDart _generateCsr;
  late final SignPayloadDart _signPayload;

  FfiCryptoAdapter(String libPath) {
    // Load the C++ JNI/FFI library
    _lib = DynamicLibrary.open(libPath);

    _generateDeviceFingerprint = _lib
        .lookup<NativeFunction<GenerateDeviceFingerprintC>>('generate_device_fingerprint')
        .asFunction();

    _generateCsr = _lib
        .lookup<NativeFunction<GenerateCsrC>>('generate_csr')
        .asFunction();

    _signPayload = _lib
        .lookup<NativeFunction<SignPayloadC>>('sign_payload')
        .asFunction();
  }

  @override
  String generateDeviceFingerprint() {
    final ptr = _generateDeviceFingerprint();
    return ptr.toDartString(); // Memory management is simplified for this prototype
  }

  @override
  String generateCsr() {
    final ptr = _generateCsr();
    return ptr.toDartString();
  }

  @override
  String signPayload(String payload) {
    final payloadPtr = payload.toNativeUtf8();
    final resultPtr = _signPayload(payloadPtr);
    final result = resultPtr.toDartString();
    calloc.free(payloadPtr);
    return result;
  }
}
