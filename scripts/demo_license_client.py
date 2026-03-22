#!/usr/bin/env python3
import argparse
import base64
import json
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4


def canonical(value):
    if isinstance(value, dict):
        return {k: canonical(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def run(*args, input_bytes=None):
    result = subprocess.run(args, input=input_bytes, capture_output=True, check=True)
    return result.stdout


def sign_payload(payload, key_path):
    body = json.dumps(canonical(payload), separators=(",", ":")).encode()
    signature = run("openssl", "dgst", "-sha256", "-sign", str(key_path), input_bytes=body)
    return base64.b64encode(signature).decode()


def generate_key_and_csr(workdir, common_name):
    key_path = workdir / "client.key"
    csr_path = workdir / "client.csr"
    run("openssl", "genrsa", "-out", str(key_path), "2048")
    run("openssl", "req", "-new", "-key", str(key_path), "-out", str(csr_path), "-subj", f"/CN={common_name}")
    return key_path, csr_path


def make_context(insecure=False, cert_path=None, key_path=None):
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    if cert_path and key_path:
        ctx.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    return ctx


def request_json(url, method="GET", payload=None, headers=None, context=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=context) as response:
            text = response.read().decode()
            return response.status, response.headers, json.loads(text)
    except urllib.error.HTTPError as err:
        text = err.read().decode(errors="ignore")
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = {"raw": text or str(err)}
        return err.code, err.headers, body


TRUST_LEVELS = {
    0: "NONE",
    1: "API_KEY",
    2: "MTLS",
    3: "SIGNED",
    4: "MTLS_SIGNED",
}


def info(message):
    print(f"[demo] {message}")


def success(message):
    print(f"[demo][ok] {message}")


def warn(message):
    print(f"[demo][warn] {message}")


def trust_label(value):
    return TRUST_LEVELS.get(value, f"UNKNOWN({value})")


def body_message(body):
    if isinstance(body, dict):
        return body.get("error") or body.get("message") or json.dumps(body)
    return str(body)


def main():
    parser = argparse.ArgumentParser(description="Demo client for the Strapi license server")
    parser.add_argument("--base-url", default="https://localhost:8443")
    parser.add_argument("--api-prefix", default="/api/license")
    parser.add_argument("--license-key", default="seed-license-ultimate-active")
    parser.add_argument("--device-fingerprint", default=f"python-demo-{uuid4().hex[:8]}")
    parser.add_argument("--plugin-version", default="1.0.0-demo")
    parser.add_argument("--platform", default="mac")
    parser.add_argument("--workdir", default=".tmp/python-demo-client")
    parser.add_argument("--verify-server", action="store_true")
    parser.add_argument("--keep-activation", action="store_true")
    parser.add_argument("--direct-strapi", action="store_true", help="Call validate/heartbeat directly on Strapi without nginx mTLS path")
    parser.add_argument("--direct-base-url", default="http://localhost:1337/api/license-server/license")
    parser.add_argument("--skip-signature", action="store_true", help="Do not send request signatures")
    parser.add_argument("--tamper-validate", action="store_true", help="Sign one validate payload but send a modified one")
    args = parser.parse_args()

    if args.skip_signature and args.tamper_validate:
        parser.error("--tamper-validate requires a signature, so do not combine it with --skip-signature")

    workdir = Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    public_base = args.base_url.rstrip("/") + args.api_prefix
    validate_base = args.direct_base_url.rstrip("/") if args.direct_strapi else public_base
    validate_context = None if args.direct_strapi else "mtls"

    info(f"Using activation base URL: {public_base}")
    info(f"Using validate/heartbeat base URL: {validate_base}")
    info(f"License key: {args.license_key}")
    info(f"Device fingerprint: {args.device_fingerprint}")
    if args.direct_strapi:
        warn("Direct Strapi mode is enabled: validate/heartbeat will bypass nginx mTLS and rely on API-key + signature checks.")
    if args.skip_signature:
        warn("Signature headers are disabled for this run.")
    if args.tamper_validate:
        warn("Tampered validate mode is enabled: server rejection is the expected healthy outcome.")
    info("Generating a fresh private key + CSR for this demo client...")
    key_path, csr_path = generate_key_and_csr(workdir, "Python Demo License Client")
    csr_b64 = base64.b64encode(csr_path.read_bytes()).decode()

    insecure = not args.verify_server
    plain_tls = make_context(insecure=insecure)

    activate_payload = {
        "license_key": args.license_key,
        "device_fingerprint": args.device_fingerprint,
        "plugin_version": args.plugin_version,
        "platform": args.platform,
        "csr": csr_b64,
    }
    info("Step 1/4: requesting activation and client certificate...")
    status, _, activate = request_json(f"{public_base}/activate", method="POST", payload=activate_payload, context=plain_tls)
    if status != 200 or activate.get("status") != "approved":
        raise SystemExit(f"Activation failed: {activate}")
    success(
        "Activation approved. Server issued a client certificate and bound this device to the license."
    )

    cert_path = workdir / "client.crt"
    ca_path = workdir / "ca.crt"
    cert_path.write_text(activate["certificate"])
    ca_path.write_text(activate["ca_certificate"])
    info(f"Saved private key to: {key_path}")
    info(f"Saved client certificate to: {cert_path}")
    info(f"Saved CA certificate to: {ca_path}")
    info(f"Activation id: {activate['activation_id']}, certificate serial: {activate['serial']}")
    mtls = make_context(insecure=insecure, cert_path=cert_path, key_path=key_path)
    endpoint_context = None if args.direct_strapi else mtls

    signed_validate_payload = {
        "license_key": args.license_key,
        "device_fingerprint": args.device_fingerprint,
    }
    validate_payload = dict(signed_validate_payload)
    if args.tamper_validate:
        validate_payload["tampered"] = "1"

    info("Step 2/4: preparing the validate payload...")
    validate_headers = {}
    if args.skip_signature:
        info("Skipping validate signature header for this scenario.")
        validate_sig = None
    else:
        info("Signing the validate payload with the local private key...")
        validate_sig = sign_payload(signed_validate_payload, key_path)
        validate_headers["x-request-signature"] = validate_sig

    validate_query = urllib.parse.urlencode(validate_payload)
    info("Step 3/4: calling /validate...")
    status, headers, validate = request_json(
        f"{validate_base}/validate?{validate_query}",
        headers=validate_headers,
        context=endpoint_context,
    )
    validate_expected_success = not args.tamper_validate and not (args.direct_strapi and args.skip_signature)
    if validate_expected_success:
        if status != 200 or not validate.get("valid"):
            raise SystemExit(f"Validate failed: {validate}")
        success(
            "Validation passed. The server accepted the certificate and verified the request for this device."
        )
        info(
            f"Validation trust level: {trust_label(validate.get('trust_level'))} ({validate.get('trust_level')})"
        )
        if validate.get("trust_level") == 4:
            success("Best-case result: MTLS_SIGNED means both client cert and request signature were trusted.")
        elif validate.get("trust_level") == 2:
            success("mTLS-only result: the client certificate was enough, even without a request signature.")
        elif validate.get("trust_level") == 3:
            success("Signed API result: direct Strapi validation trusted the request signature without mTLS.")
    else:
        if status < 400:
            raise SystemExit(f"Validate unexpectedly succeeded: {validate}")
        success(f"Validation was rejected as expected: {body_message(validate)}")
        print()
        success("This is a good security result: the server refused the forged or unsigned validate request.")
        print(json.dumps({
            "activation": {"id": activate["activation_id"], "serial": activate["serial"], "status": activate["status"]},
            "validate": {"status": status, "body": validate, "expected": "request rejected"},
            "artifacts": {"key": str(key_path), "cert": str(cert_path), "ca": str(ca_path)},
        }, indent=2))
        if not args.keep_activation:
            info("Cleaning up demo activation...")
            _, _, deactivate = request_json(
                f"{public_base}/deactivate",
                method="POST",
                payload={"license_key": args.license_key, "device_fingerprint": args.device_fingerprint},
                context=plain_tls,
            )
            success("Demo activation removed.")
            print(json.dumps({"deactivate": deactivate}, indent=2))
        return

    heartbeat_payload = {
        "activation_id": str(activate["activation_id"]),
        "heartbeat_nonce": f"hb-{int(time.time())}",
    }
    info("Step 4/4: signing heartbeat payload and sending a live heartbeat...")
    heartbeat_headers = {}
    if args.skip_signature:
        info("Skipping heartbeat signature header for this scenario.")
    else:
        heartbeat_sig = sign_payload(heartbeat_payload, key_path)
        heartbeat_headers["x-payload-signature"] = heartbeat_sig

    status, _, heartbeat = request_json(
        f"{validate_base}/heartbeat",
        method="POST",
        payload=heartbeat_payload,
        headers=heartbeat_headers,
        context=endpoint_context,
    )
    heartbeat_expected_success = not (args.direct_strapi and args.skip_signature)
    if heartbeat_expected_success:
        if status != 200 or not heartbeat.get("valid"):
            raise SystemExit(f"Heartbeat failed: {heartbeat}")
        success("Heartbeat passed. The activation is still healthy and accepted by the server.")
        info(
            f"Heartbeat trust level: {trust_label(heartbeat.get('trust_level'))} ({heartbeat.get('trust_level')})"
        )
    else:
        if status < 400:
            raise SystemExit(f"Heartbeat unexpectedly succeeded: {heartbeat}")
        success(f"Heartbeat was rejected as expected: {body_message(heartbeat)}")
        print()
        success("This is a good security result: the server refused an unsigned direct heartbeat request.")
        print(json.dumps({
            "activation": {"id": activate["activation_id"], "serial": activate["serial"], "status": activate["status"]},
            "validate": {"valid": validate["valid"], "trust_level": validate.get("trust_level")},
            "heartbeat": {"status": status, "body": heartbeat, "expected": "request rejected"},
            "artifacts": {"key": str(key_path), "cert": str(cert_path), "ca": str(ca_path)},
        }, indent=2))
        if not args.keep_activation:
            info("Cleaning up demo activation...")
            _, _, deactivate = request_json(
                f"{public_base}/deactivate",
                method="POST",
                payload={"license_key": args.license_key, "device_fingerprint": args.device_fingerprint},
                context=plain_tls,
            )
            success("Demo activation removed.")
            print(json.dumps({"deactivate": deactivate}, indent=2))
        return

    print()
    success("Everything looks good: license activation, validation, and heartbeat all succeeded.")
    success("For a beginner: this means the server accepted your cert and your signed requests end-to-end.")

    print(json.dumps({
        "activation": {"id": activate["activation_id"], "serial": activate["serial"], "status": activate["status"]},
        "validate": {"valid": validate["valid"], "trust_level": validate.get("trust_level"), "response_signature": headers.get("x-response-signature")},
        "heartbeat": {"valid": heartbeat["valid"], "trust_level": heartbeat.get("trust_level")},
        "artifacts": {"key": str(key_path), "cert": str(cert_path), "ca": str(ca_path)},
    }, indent=2))

    if not args.keep_activation:
        info("Cleaning up demo activation...")
        _, _, deactivate = request_json(
            f"{public_base}/deactivate",
            method="POST",
            payload={"license_key": args.license_key, "device_fingerprint": args.device_fingerprint},
            context=plain_tls,
        )
        success("Demo activation removed.")
        print(json.dumps({"deactivate": deactivate}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as err:
        print(err.stderr.decode(errors="ignore") or str(err), file=sys.stderr)
        raise SystemExit(1) from err

