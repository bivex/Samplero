# 🚀 Production Deployment Guide

## 1. System Requirements

- **Operating System**: Debian 12 (Bookworm) or Ubuntu 22.04/24.04 LTS (x86_64 or aarch64)
- **CPU / RAM**: Minimum 2 vCPU, 4GB RAM (Recommended: 4 vCPU, 8GB RAM)
- **Disk**: 50GB+ NVMe SSD
- **Docker Engine**: >= 26.0+ with Docker Compose v2

---

## 2. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential dependencies
sudo apt install -y curl git ufw fail2ban htop jq openssl

# Configure UFW Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (Let's Encrypt / ACME)
sudo ufw allow 443/tcp    # HTTPS Public Web
sudo ufw allow 8443/tcp   # mTLS VST Licensing Gateway
sudo ufw enable
```

---

## 3. Deployment Steps

```bash
# 1. Clone repository into production directory
sudo git clone https://github.com/bivex/Samplero.git /opt/samplero
cd /opt/samplero

# 2. Configure production secrets
cp .env.example .env
chmod 600 .env
nano .env # Set real strong random keys & DB credentials

# 3. Bootstrap Intermediate CA & Server Certificates
bash scripts/pki/bootstrap-intermediate-ca.sh

# 4. Build and Launch Production Stack
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build

# 5. Verify Health Status
curl -f http://127.0.0.1:1337/api/license-server/healthz
curl -f http://127.0.0.1:1337/api/license-server/readyz
```
