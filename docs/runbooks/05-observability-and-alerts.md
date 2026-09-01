# 📊 Observability & Prometheus Alerting Runbook

## 1. Available Metrics Endpoints

- **Strapi License Server**: `GET http://127.0.0.1:1337/api/license-server/metrics`
- **Go Cert-Signer**: `GET http://127.0.0.1:8081/metrics`

---

## 2. Key Prometheus Alert Rules (`alerts.yml`)

```yaml
groups:
  - name: samplero_licensing_alerts
    rules:
      - alert: LicenseServerDown
        expr: probe_success{instance="https://api.yourdomain.com/api/license-server/healthz"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Samplero License Server is down"

      - alert: DatabaseReadinessFailed
        expr: http_response_status_code{path="/api/license-server/readyz"} != 200
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database or Redis readiness probe failing"

      - alert: HighRateLimitTrips
        expr: rate(rate_limit_exceeded_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Abnormal volume of rate limit blocks detected (Possible Brute Force / DOS)"
```
