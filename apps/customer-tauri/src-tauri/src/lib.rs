use base64::{engine::general_purpose::STANDARD, Engine as _};
use rcgen::{
    CertificateParams, DnType, ExtendedKeyUsagePurpose, KeyPair, KeyUsagePurpose,
    RsaKeySize, SigningKey, PKCS_RSA_SHA256,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::Manager;

const DEVICE_KEY_FILE: &str = "device-identity.pem";
const DEVICE_CERT_FILE: &str = "device-certificate.pem";
const DEVICE_CA_FILE: &str = "device-ca.pem";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceCryptoStatus {
    device_fingerprint: String,
    algorithm: String,
    public_key_pem: String,
    public_key_fingerprint: String,
    csr_base64: String,
    storage_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpRequest {
    method: String,
    url: String,
    headers: BTreeMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpResponse {
    status: u16,
    status_text: String,
    headers: BTreeMap<String, String>,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationMaterialPayload {
    certificate_pem: String,
    ca_certificate_pem: Option<String>,
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn canonicalize_value(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_value).collect()),
        Value::Object(object) => {
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));

            let mut normalized = Map::new();
            for (key, nested) in entries {
                normalized.insert(key.clone(), canonicalize_value(nested));
            }

            Value::Object(normalized)
        }
        _ => value.clone(),
    }
}

fn app_data_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let mut dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    dir.push(file_name);
    Ok(dir)
}

fn identity_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_data_file_path(app, DEVICE_KEY_FILE)
}

fn certificate_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_data_file_path(app, DEVICE_CERT_FILE)
}

fn ca_certificate_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_data_file_path(app, DEVICE_CA_FILE)
}

fn load_or_create_key_pair(path: &PathBuf) -> Result<KeyPair, String> {
    if path.exists() {
        let pem = fs::read_to_string(path).map_err(|err| err.to_string())?;
        return KeyPair::from_pem_and_sign_algo(&pem, &PKCS_RSA_SHA256)
            .map_err(|err| err.to_string());
    }

    let key_pair = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048)
        .map_err(|err| err.to_string())?;
    fs::write(path, key_pair.serialize_pem()).map_err(|err| err.to_string())?;
    Ok(key_pair)
}

fn build_csr_base64(key_pair: &KeyPair, device_fingerprint: &str) -> Result<String, String> {
    let mut params = CertificateParams::new(Vec::<String>::new()).map_err(|err| err.to_string())?;
    let common_name = if device_fingerprint.trim().is_empty() {
        "samplero-tauri-device".to_string()
    } else {
        format!("samplero-tauri-{}", device_fingerprint.trim())
    };

    params.distinguished_name.push(DnType::CommonName, common_name);
    params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyEncipherment,
    ];
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];

    let csr = params.serialize_request(key_pair).map_err(|err| err.to_string())?;
    let pem = csr.pem().map_err(|err| err.to_string())?;
    Ok(STANDARD.encode(pem.as_bytes()))
}

fn sign_canonical_payload(key_pair: &KeyPair, payload: &Value) -> Result<String, String> {
    let normalized = canonicalize_value(payload);
    let serialized = serde_json::to_vec(&normalized).map_err(|err| err.to_string())?;
    let signature = key_pair.sign(&serialized).map_err(|err| err.to_string())?;
    Ok(STANDARD.encode(signature))
}

#[tauri::command]
fn ensure_device_crypto(
    app: tauri::AppHandle,
    device_fingerprint: String,
) -> Result<DeviceCryptoStatus, String> {
    let path = identity_path(&app)?;
    let key_pair = load_or_create_key_pair(&path)?;
    let public_key_pem = key_pair.public_key_pem();
    let public_key_fingerprint = to_hex(&Sha256::digest(public_key_pem.as_bytes()));
    let csr_base64 = build_csr_base64(&key_pair, &device_fingerprint)?;

    Ok(DeviceCryptoStatus {
        device_fingerprint,
        algorithm: "RSA-SHA256".to_string(),
        public_key_pem,
        public_key_fingerprint,
        csr_base64,
        storage_path: path.display().to_string(),
    })
}

#[tauri::command]
fn sign_payload(app: tauri::AppHandle, payload: Value) -> Result<String, String> {
    let path = identity_path(&app)?;
    let key_pair = load_or_create_key_pair(&path)?;
    sign_canonical_payload(&key_pair, &payload)
}

#[tauri::command]
fn store_activation_material(
    app: tauri::AppHandle,
    payload: ActivationMaterialPayload,
) -> Result<(), String> {
    let cert_path = certificate_path(&app)?;
    let ca_path = ca_certificate_path(&app)?;

    fs::write(cert_path, payload.certificate_pem).map_err(|err| err.to_string())?;

    match payload.ca_certificate_pem {
        Some(ca_pem) => fs::write(ca_path, ca_pem).map_err(|err| err.to_string())?,
        None if ca_path.exists() => fs::remove_file(ca_path).map_err(|err| err.to_string())?,
        None => {}
    }

    Ok(())
}

#[tauri::command]
fn clear_activation_material(app: tauri::AppHandle) -> Result<(), String> {
    for path in [certificate_path(&app)?, ca_certificate_path(&app)?] {
        if path.exists() {
            fs::remove_file(path).map_err(|err| err.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn send_native_http_request(
    app: tauri::AppHandle,
    request: NativeHttpRequest,
) -> Result<NativeHttpResponse, String> {
    let NativeHttpRequest {
        method,
        url,
        headers,
        body,
    } = request;
    let key_path = identity_path(&app)?;
    let cert_path = certificate_path(&app)?;
    let ca_path = ca_certificate_path(&app)?;
    let mut client_builder = reqwest::Client::builder();

    if key_path.exists() && cert_path.exists() {
        let key_pem = fs::read_to_string(&key_path).map_err(|err| err.to_string())?;
        let cert_pem = fs::read_to_string(&cert_path).map_err(|err| err.to_string())?;
        let identity_pem = format!("{cert_pem}\n{key_pem}");
        let identity = reqwest::Identity::from_pem(identity_pem.as_bytes())
            .map_err(|err| err.to_string())?;
        client_builder = client_builder.identity(identity);
    }

    if ca_path.exists() {
        let ca_pem = fs::read(&ca_path).map_err(|err| err.to_string())?;
        let ca_cert = reqwest::Certificate::from_pem(&ca_pem).map_err(|err| err.to_string())?;
        client_builder = client_builder.add_root_certificate(ca_cert);
    }

    let client = client_builder.build().map_err(|err| err.to_string())?;
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|err| err.to_string())?;
    let mut pending = client.request(method, &url);

    for (key, value) in headers {
        pending = pending.header(key, value);
    }

    if let Some(body) = body {
        pending = pending.body(body);
    }

    let response = pending.send().await.map_err(|err| err.to_string())?;
    let status = response.status();
    let mut headers = BTreeMap::new();

    for (key, value) in response.headers().iter() {
        if let Ok(value_text) = value.to_str() {
            headers.insert(key.to_string(), value_text.to_string());
        }
    }

    Ok(NativeHttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body: response.text().await.map_err(|err| err.to_string())?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ensure_device_crypto,
            sign_payload,
            store_activation_material,
            clear_activation_material,
            send_native_http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalize_value_sorts_nested_object_keys() {
        let payload = serde_json::json!({
            "z": 1,
            "nested": { "b": 2, "a": 1 },
            "arr": [{ "y": true, "x": false }],
        });

        assert_eq!(
            canonicalize_value(&payload),
            serde_json::json!({
                "arr": [{ "x": false, "y": true }],
                "nested": { "a": 1, "b": 2 },
                "z": 1,
            })
        );
    }

    #[test]
    fn build_csr_base64_returns_pem_wrapped_request() {
        let key_pair = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048).unwrap();
        let encoded = build_csr_base64(&key_pair, "tauri-smoke-device").unwrap();
        let decoded = String::from_utf8(STANDARD.decode(encoded).unwrap()).unwrap();

        assert!(decoded.contains("BEGIN CERTIFICATE REQUEST"));
        assert!(decoded.contains("END CERTIFICATE REQUEST"));
    }
}
