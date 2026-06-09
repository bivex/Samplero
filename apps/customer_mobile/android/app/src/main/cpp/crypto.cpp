#include <stdint.h>
#include <string.h>
#include <string>

#ifdef __ANDROID__
#include <jni.h>
#include <sys/system_properties.h>
#include <android/log.h>
#define LOG_TAG "CryptoLib"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#else
#define LOGI(...)
#endif

// =====================================================================
// SHA-256 (FIPS 180-4)
// =====================================================================
namespace {

static const uint32_t SHA256_K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

#define ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))
#define CH(x, y, z) (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))
#define EP0(x) (ROTR(x, 2) ^ ROTR(x, 13) ^ ROTR(x, 22))
#define EP1(x) (ROTR(x, 6) ^ ROTR(x, 11) ^ ROTR(x, 25))
#define SIG0(x) (ROTR(x, 7) ^ ROTR(x, 18) ^ ((x) >> 3))
#define SIG1(x) (ROTR(x, 17) ^ ROTR(x, 19) ^ ((x) >> 10))

void sha256_transform(uint32_t state[8], const uint8_t block[64]) {
    uint32_t W[64];
    for (int i = 0; i < 16; i++) {
        W[i] = ((uint32_t)block[i*4] << 24) | ((uint32_t)block[i*4+1] << 16) |
                ((uint32_t)block[i*4+2] << 8) | (uint32_t)block[i*4+3];
    }
    for (int i = 16; i < 64; i++) {
        W[i] = SIG1(W[i-2]) + W[i-7] + SIG0(W[i-15]) + W[i-16];
    }

    uint32_t a = state[0], b = state[1], c = state[2], d = state[3];
    uint32_t e = state[4], f = state[5], g = state[6], h = state[7];

    for (int i = 0; i < 64; i++) {
        uint32_t t1 = h + EP1(e) + CH(e, f, g) + SHA256_K[i] + W[i];
        uint32_t t2 = EP0(a) + MAJ(a, b, c);
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }

    state[0] += a; state[1] += b; state[2] += c; state[3] += d;
    state[4] += e; state[5] += f; state[6] += g; state[7] += h;
}

void sha256(const uint8_t* data, size_t len, uint8_t hash[32]) {
    uint32_t state[8] = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };

    size_t i = 0;
    while (i + 64 <= len) {
        sha256_transform(state, data + i);
        i += 64;
    }

    uint8_t block[64];
    size_t remaining = len - i;
    memcpy(block, data + i, remaining);
    block[remaining] = 0x80;

    if (remaining >= 56) {
        memset(block + remaining + 1, 0, 63 - remaining);
        sha256_transform(state, block);
        memset(block, 0, 56);
    } else {
        memset(block + remaining + 1, 0, 55 - remaining);
    }

    uint64_t bits = (uint64_t)len * 8;
    for (int j = 0; j < 8; j++) {
        block[63 - j] = (uint8_t)(bits >> (j * 8));
    }
    sha256_transform(state, block);

    for (int j = 0; j < 8; j++) {
        hash[j*4]     = (uint8_t)(state[j] >> 24);
        hash[j*4 + 1] = (uint8_t)(state[j] >> 16);
        hash[j*4 + 2] = (uint8_t)(state[j] >> 8);
        hash[j*4 + 3] = (uint8_t)(state[j]);
    }
}

std::string sha256_hex(const std::string& input) {
    uint8_t hash[32];
    sha256(reinterpret_cast<const uint8_t*>(input.data()), input.size(), hash);

    static const char hex[] = "0123456789abcdef";
    std::string out;
    out.reserve(64);
    for (int i = 0; i < 32; i++) {
        out.push_back(hex[hash[i] >> 4]);
        out.push_back(hex[hash[i] & 0x0f]);
    }
    return out;
}

// =====================================================================
// HMAC-SHA256 (RFC 2104)
// =====================================================================
std::string hmac_sha256(const std::string& key, const std::string& msg) {
    uint8_t k_prime[64];
    memset(k_prime, 0, 64);

    if (key.size() <= 64) {
        memcpy(k_prime, key.data(), key.size());
    } else {
        sha256(reinterpret_cast<const uint8_t*>(key.data()), key.size(), k_prime);
    }

    uint8_t ipad[64], opad[64];
    for (int i = 0; i < 64; i++) {
        ipad[i] = k_prime[i] ^ 0x36;
        opad[i] = k_prime[i] ^ 0x5c;
    }

    // inner = SHA256(ipad || msg)
    std::string inner_input(reinterpret_cast<char*>(ipad), 64);
    inner_input += msg;
    uint8_t inner_hash[32];
    sha256(reinterpret_cast<const uint8_t*>(inner_input.data()), inner_input.size(), inner_hash);

    // outer = SHA256(opad || inner_hash)
    std::string outer_input(reinterpret_cast<char*>(opad), 64);
    outer_input.append(reinterpret_cast<char*>(inner_hash), 32);
    uint8_t hmac_hash[32];
    sha256(reinterpret_cast<const uint8_t*>(outer_input.data()), outer_input.size(), hmac_hash);

    static const char hex[] = "0123456789abcdef";
    std::string out;
    out.reserve(64);
    for (int i = 0; i < 32; i++) {
        out.push_back(hex[hmac_hash[i] >> 4]);
        out.push_back(hex[hmac_hash[i] & 0x0f]);
    }
    return out;
}

// =====================================================================
// Base64 (RFC 4648)
// =====================================================================
std::string base64_encode(const std::string& input) {
    static const char tbl[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    size_t i = 0;
    for (; i + 2 < input.size(); i += 3) {
        uint32_t n = ((uint8_t)input[i] << 16) | ((uint8_t)input[i+1] << 8) | (uint8_t)input[i+2];
        out.push_back(tbl[(n >> 18) & 0x3f]);
        out.push_back(tbl[(n >> 12) & 0x3f]);
        out.push_back(tbl[(n >> 6) & 0x3f]);
        out.push_back(tbl[n & 0x3f]);
    }
    if (i < input.size()) {
        uint32_t n = (uint8_t)input[i] << 16;
        if (i + 1 < input.size()) n |= (uint8_t)input[i+1] << 8;
        out.push_back(tbl[(n >> 18) & 0x3f]);
        out.push_back(tbl[(n >> 12) & 0x3f]);
        out.push_back((i + 1 < input.size()) ? tbl[(n >> 6) & 0x3f] : '=');
        out.push_back('=');
    }
    return out;
}

// =====================================================================
// Device Identity
// =====================================================================
std::string get_device_identity() {
    std::string id;
#ifdef __ANDROID__
    char value[PROP_VALUE_MAX];

    __system_property_get("ro.serialno", value);
    id += value; id += '|';

    __system_property_get("ro.product.model", value);
    id += value; id += '|';

    __system_property_get("ro.product.device", value);
    id += value; id += '|';

    __system_property_get("ro.hardware", value);
    id += value; id += '|';

    __system_property_get("ro.build.display.id", value);
    id += value;
#else
    id = "non-android-device";
#endif
    return id;
}

// =====================================================================
// Cached state (computed once)
// =====================================================================
static std::string g_fingerprint;
static std::string g_device_key;

static void ensure_init() {
    if (!g_fingerprint.empty()) return;

    std::string device_id = get_device_identity();
    g_fingerprint = sha256_hex(device_id);
    g_device_key = sha256_hex("samplero-key-salt:" + device_id);

    LOGI("Device fingerprint: %s", g_fingerprint.c_str());
}

} // anonymous namespace

// =====================================================================
// Exported FFI Functions
// =====================================================================
#if defined(_WIN32)
#define EXPORT __declspec(dllexport)
#else
#define EXPORT __attribute__((visibility("default"))) __attribute__((used))
#endif

extern "C" {

EXPORT const char* generate_device_fingerprint() {
    ensure_init();
    static std::string result;
    result = g_fingerprint;
    return result.c_str();
}

EXPORT const char* generate_csr() {
    ensure_init();
    static std::string result;

    // PKCS#10-like structure: base64(sha256(device_id) + device_info)
    // Production would use real RSA/EC keypair + X.509 DER encoding
    std::string raw;
    raw.append(reinterpret_cast<const char*>("\x30\x59\x30\x13"), 4); // SEQUENCE header hint
    raw += g_fingerprint;
    raw += "|CN=device-";
    raw += g_fingerprint.substr(0, 16);
    raw += "|O=Samplero|C=US";

    result = "-----BEGIN CERTIFICATE REQUEST-----\n";
    // Wrap base64 at 64 chars per line
    std::string b64 = base64_encode(raw);
    for (size_t i = 0; i < b64.size(); i += 64) {
        result += b64.substr(i, 64);
        result += '\n';
    }
    result += "-----END CERTIFICATE REQUEST-----";

    return result.c_str();
}

EXPORT const char* sign_payload(const char* payload) {
    ensure_init();
    static std::string result;

    // HMAC-SHA256(payload, device_key) as hex
    // Production would use RSA-SHA256 or ECDSA with hardware-backed key
    result = hmac_sha256(g_device_key, std::string(payload));
    return result.c_str();
}

} // extern "C"

// =====================================================================
// JNI Bindings (legacy Android Java/Kotlin layer)
// =====================================================================
#ifdef __ANDROID__
static JavaVM* g_jvm = nullptr;

extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_generateDeviceFingerprint(JNIEnv* env, jobject) {
    return env->NewStringUTF(generate_device_fingerprint());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_generateCsr(JNIEnv* env, jobject) {
    return env->NewStringUTF(generate_csr());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_samplero_customer_CryptoAdapter_signPayload(JNIEnv* env, jobject, jstring payload) {
    const char* chars = env->GetStringUTFChars(payload, 0);
    const char* sig = sign_payload(chars);
    env->ReleaseStringUTFChars(payload, chars);
    return env->NewStringUTF(sig);
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    g_jvm = vm;
    return JNI_VERSION_1_6;
}
#endif
