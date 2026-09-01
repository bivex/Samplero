# 💾 Disaster Recovery & Database Backup Runbook

## Backup Strategy

- **PostgreSQL Database**: Automated daily logical backups (`pg_dump`) + continuous WAL archiving for Point-In-Time Recovery (PITR).
- **PKI & CA Keys**: Encrypted tarball stored in secure offline cold storage.
- **S3 Assets**: S3 bucket versioning & cross-region replication enabled.

---

## 1. Automated PostgreSQL Backup Script

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/samplero/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/license_server_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

docker compose -f /opt/samplero/docker/docker-compose.yml exec -T strapiDB \
  pg_dump -U strapi -d license_server | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
echo "Backup created successfully at ${BACKUP_FILE}"

# Retention: Delete backups older than 30 days
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +30 -delete
```

---

## 2. Restore Procedure

```bash
# 1. Stop application traffic
docker compose stop strapi

# 2. Restore PostgreSQL dump
gunzip -c /var/backups/samplero/postgres/license_server_TARGET.sql.gz | \
  docker compose exec -T strapiDB psql -U strapi -d license_server

# 3. Start Strapi and verify readiness
docker compose start strapi
curl http://127.0.0.1:1337/api/license-server/readyz
```
