# Samplero Customer Validator

Desktop Tauri app for manually testing the existing license-server endpoints.

## What it does

- enter a `license key`
- set `device fingerprint`, `plugin version`, and `platform`
- call:
  - `GET /api/license-server/license/status`
  - `POST /api/license-server/license/activate`
  - `GET /api/license-server/license/validate`
  - `POST /api/license-server/license/deactivate`
- inspect the raw JSON response in a desktop UI

## Local run

```bash
cd apps/customer-tauri
npm install
npm run tauri dev
```

## Notes

- default base URL points at local Strapi: `http://127.0.0.1:1337`
- `status` sends `x-request-nonce`
- `validate` sends `x-request-nonce` + `x-request-timestamp`
- if your server requires mTLS or a signed validate request, the app will surface that backend error as-is
