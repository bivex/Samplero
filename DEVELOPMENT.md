# 💻 Local Development Guide

## Prerequisites

- **Node.js**: >= 20.x (Node 22 LTS recommended) or **Bun**: >= 1.2
- **Go**: >= 1.24+ (for `cert-signer` microservice)
- **Rust / Cargo**: >= 1.80+ (for `customer-tauri` desktop client)
- **Flutter / Dart**: >= 3.x (for `customer_mobile` app)
- **Docker & Docker Compose**: >= 2.20+

---

## 🚀 Quick Start (Local Development)

### 1. Install Root & Plugin Dependencies

```bash
# Using npm
npm install

# Or using Bun
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

### 3. Start Local Microservices Stack (Docker)

```bash
# Start PostgreSQL, Redis, and Nginx edge
docker compose -f docker/docker-compose.yml up -d strapiDB strapi-redis
```

### 4. Run Strapi in Development Mode

```bash
npm run develop
# Or: bun run develop
```

Admin Panel: `http://localhost:1337/admin`  
API Base: `http://localhost:1337/api`

---

## 🧪 Running Test Suites

```bash
# Run all backend & plugin tests
npm test
# Or: bun test

# Run Go Cert-Signer tests
cd services/cert-signer && go test -v ./... && cd ../..

# Run Flutter mobile analyzer & tests
cd apps/customer_mobile && flutter analyze && cd ../..

# Check Tauri Rust backend
cd apps/customer-tauri/src-tauri && cargo check && cd ../../..
```
