#include <stdint.h>
#include <string.h>
#include <string>

// Include JNI if we are on Android
#ifdef __ANDROID__
#include <jni.h>
#endif

// Export macros for FFI
#if defined(_WIN32)
#define EXPORT __declspec(dllexport)
#else
#define EXPORT __attribute__((visibility("default"))) __attribute__((used))
#endif

extern "C" {

// C-compatible FFI bindings for Dart
EXPORT const char* generate_device_fingerprint() {
    // In a real implementation, this would access hardware keystore (e.g. Secure Enclave / KeyStore)
    // and return the SHA-256 fingerprint of the public key.
    return "native-cpp-fingerprint-mock-12345";
}

EXPORT const char* generate_csr() {
    // Generates a PKCS#10 CSR using the private key
    return "-----BEGIN CERTIFICATE REQUEST-----\nMOCK_CSR_DATA\n-----END CERTIFICATE REQUEST-----";
}

EXPORT const char* sign_payload(const char* payload) {
    // Signs the validate/heartbeat payload using the private key
    return "mock_signature_base64_==";
}

} // extern "C"

#ifdef __ANDROID__
// JNI bindings for legacy Android Java/Kotlin layers (if requested instead of direct FFI)
extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_generateDeviceFingerprint(JNIEnv* env, jobject /* this */) {
    std::string fingerprint = generate_device_fingerprint();
    return env->NewStringUTF(fingerprint.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_generateCsr(JNIEnv* env, jobject /* this */) {
    std::string csr = generate_csr();
    return env->NewStringUTF(csr.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_signPayload(JNIEnv* env, jobject /* this */, jstring payload) {
    const char *payload_chars = env->GetStringUTFChars(payload, 0);
    std::string signature = sign_payload(payload_chars);
    env->ReleaseStringUTFChars(payload, payload_chars);
    return env->NewStringUTF(signature.c_str());
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    // Initialization logic for JNI
    return JNI_VERSION_1_6;
}
#endif
