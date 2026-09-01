# 🔑 Local Development Credentials (Template)

> **Warning**: These credentials are strictly for **local development and testing only**.
> Never use default credentials in production. In production, provide strong random secrets via environment variables.

## Default Local Admin Panel User

| Field | Value |
| :--- | :--- |
| **URL** | `http://localhost:1337/admin` |
| **Email** | `admin@bivex.io` |
| **Password** | `Admin123!@#` |
| **Role** | Super Admin |

## Default Database (PostgreSQL)

| Variable | Local Default |
| :--- | :--- |
| `DATABASE_HOST` | `127.0.0.1` |
| `DATABASE_PORT` | `5432` |
| `DATABASE_NAME` | `license_server` |
| `DATABASE_USERNAME` | `strapi` |
| `DATABASE_PASSWORD` | `strapi` |

## Default Cert-Signer Microservice

| Variable | Local Default |
| :--- | :--- |
| `LICENSE_SIGNER_URL` | `http://127.0.0.1:8081` |
| `LICENSE_SIGNER_AUTH_TOKEN` | `change-me-signer-token` |
| `LICENSE_SIGNER_SHARED_SECRET` | `change-me-signer-shared-secret` |
