# 📋 Changelog

All notable changes to the Samplero platform will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-22

### Added
- **Production Observability**: `/healthz` (liveness), `/readyz` (readiness), and `/metrics` (Prometheus) endpoints across Strapi and Go `cert-signer`.
- **Structured Logging**: Standardized `log/slog` JSON logging with trace context in `cert-signer`.
- **Graceful Shutdown**: Signal handling (`SIGTERM`/`SIGINT`) with connection draining for all daemon services.
- **Zero-Trust Hardening**:
  - Mutual TLS (mTLS) client certificate verification at edge reverse proxy.
  - Asymmetric proof-of-possession request signatures (`x-request-signature`, `x-payload-signature`).
  - Server response signing middleware (`x-response-signature`).
  - Anti-replay nonces (`x-request-nonce`) with Redis TTL enforcement.
- **Production Containerization**: Multi-stage hardened Dockerfiles (`Dockerfile.prod`) and `docker-compose.prod.yml` with resource limits and logging drivers.
- **Client Applications**:
  - Tauri 2.0 desktop license validator with hardware fingerprinting and background heartbeat worker.
  - Flutter 3.x mobile catalog and customer portal application.
- **Commerce & Delivery**:
  - Payment webhook fulfillment for VST plugins and download-only sample packs.
  - AWS S3 presigned asset delivery with configurable expiration.
