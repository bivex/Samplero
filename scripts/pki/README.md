## PKI bootstrap scripts

### Goal
Сгенерировать dev/test PKI layout для схемы:
- offline `root CA`
- runtime `intermediate CA`
- `cert-signer` использует только intermediate key

### Script
- `scripts/pki/bootstrap-intermediate-ca.sh`
- `scripts/pki/prepare-production-stepca-host.sh`
- `scripts/pki/build-production-stepca-bundle.sh`
- `scripts/pki/install-production-stepca-bundle.sh`
- `scripts/pki/deploy-production-stepca-server.sh`
- `scripts/pki/verify-production-stepca-bundle.sh`
- `scripts/pki/audit-production-stepca-host.sh`
- `scripts/pki/rollout-production-intermediate.sh`
- `scripts/pki/rollback-production-intermediate.sh`

### Output
- `.docker-pki/<user>/root/root-ca.crt`
- `.docker-pki/<user>/root/private/root-ca.key`
- `.docker-pki/<user>/intermediate/intermediate-ca.crt`
- `.docker-pki/<user>/intermediate/private/intermediate-ca.key`
- `.docker-pki/<user>/intermediate/ca-chain.crt`
- `.docker-pki/<user>/trust/ca-chain.crt`
- `.docker-pki/<user>/index.txt`
- `.docker-pki/current` → ссылка на активную пользовательскую папку

### Usage
- `bash scripts/pki/bootstrap-intermediate-ca.sh`
- overwrite intentionally: `FORCE=1 bash scripts/pki/bootstrap-intermediate-ca.sh`
- choose a user-specific folder explicitly if needed: `PKI_USER=<name> bash scripts/pki/bootstrap-intermediate-ca.sh`
- for day-to-day stack control use `docker/pki-stack.sh up|down|restart|status`

### Production helper flow
- подготовить серверный layout и права: `bash scripts/pki/prepare-production-stepca-host.sh`
- на защищённой машине собрать bundle без `root key`: `SOURCE_DIR=/secure/step-ca bash scripts/pki/build-production-stepca-bundle.sh`
- до сервера проверить bundle: `bash scripts/pki/verify-production-stepca-bundle.sh /path/to/bundle`
- на сервере установить bundle в `.docker-pki/<user>/step-ca`: `bash scripts/pki/install-production-stepca-bundle.sh /path/to/bundle`
- если хочешь одним запуском: `bash scripts/pki/deploy-production-stepca-server.sh /path/to/bundle`
- для custody-audit на сервере: `SERVER_ROOT=/srv/samplero-license-server PKI_USER=prod bash scripts/pki/audit-production-stepca-host.sh`
- для canary rollout с backup/evidence: `bash scripts/pki/rollout-production-intermediate.sh /path/to/bundle`
- для отката на backup: `bash scripts/pki/rollback-production-intermediate.sh /path/to/backup-dir`

### Runtime split
- Strapi: `LICENSE_SIGNER_MODE=remote`
- signer mounts:
  - `intermediate-ca.crt`
  - `intermediate-ca.key`
  - `ca-chain.crt`
- root key stays outside runtime
- по умолчанию состояние кладётся в локальную папку рядом с запуском Docker, но разносится по пользователям, чтобы файлы не сваливались в одну кучу
- `docker/pki-stack.sh` сам переключает `.docker-pki/current` на активного пользователя и от этого стабильного пути запускает compose-стек

