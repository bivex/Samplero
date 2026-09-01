# 🚨 Incident Response & Emergency Revocation Runbook

## 1. Compromised License Key Revocation

When a license key is leaked, pirated, or refunded:

```bash
# Revoke via Strapi Admin API
curl -X POST "https://api.yourdomain.com/api/license-server/licenses/REVOKE_TARGET_ID/revoke" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Payment charged back / piracy violation"
  }'
```

---

## 2. Emergency Device / Certificate Revocation

To revoke a specific hardware activation and blacklist the client certificate serial:

```bash
curl -X POST "https://api.yourdomain.com/api/license-server/me/licenses/LICENSE_ID/activations/ACTIVATION_ID/revoke" \
  -H "Authorization: Bearer CUSTOMER_OR_ADMIN_JWT"
```

The device is immediately marked as revoked in PostgreSQL. Subsequent calls to `/api/license/validate` or `/api/license/heartbeat` return `401 / 403 LICENSE_REVOKED`.
