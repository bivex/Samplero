// Port (Interface) for native cryptography operations
abstract class CryptoPort {
  /// Generates an RSA keypair locally and returns the public key fingerprint
  String generateDeviceFingerprint();

  /// Generates a CSR (Certificate Signing Request) for activation
  String generateCsr();

  /// Signs a payload for validate/heartbeat requests
  String signPayload(String payload);
}
