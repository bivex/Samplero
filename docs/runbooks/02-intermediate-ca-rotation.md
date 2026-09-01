# 🔄 Intermediate CA Rotation Runbook

## Overview

Intermediate CAs must be rotated periodically (e.g. annually) or immediately in case of private key compromise. This procedure guarantees zero downtime for existing active plugin installations.

---

## Zero-Downtime Dual-Trust Rotation Procedure

1. **Phase 1: Generate New Intermediate CA Keypair**:
   ```bash
   # Generate new intermediate CSR
   openssl req -new -newkey rsa:4096 -nodes \
     -keyout certs/intermediate/new-intermediate.key \
     -out certs/intermediate/new-intermediate.csr \
     -subj "/CN=Samplero Licensing Intermediate CA v2/O=Samplero"
   ```

2. **Phase 2: Sign with Offline Root CA**:
   ```bash
   # Issue from offline Root CA
   openssl x509 -req -in certs/intermediate/new-intermediate.csr \
     -CA certs/root/ca.crt -CAkey certs/root/private/ca.key \
     -CAcreateserial -out certs/intermediate/new-intermediate.crt \
     -days 730 -sha256 -extfile scripts/pki/intermediate.ext
   ```

3. **Phase 3: Append New Intermediate to Nginx Trust Bundle**:
   - Concatenate `old-intermediate.crt` + `new-intermediate.crt` + `root-ca.crt` into `ca-chain.crt`.
   - Reload Nginx: `docker compose exec nginx nginx -s reload`.
   - Nginx now trusts both old and new client certificates simultaneously.

4. **Phase 4: Switch Active Signer to New Intermediate**:
   - Point `cert-signer` to `new-intermediate.key` and `new-intermediate.crt`.
   - Restart `cert-signer`: `docker compose restart cert-signer`.
   - Newly issued client certificates are now signed by Intermediate v2.

5. **Phase 5: Decommission Old Intermediate**:
   - After all clients have refreshed certificates (via yearly re-issuance), remove the old intermediate from the Nginx trust chain.
