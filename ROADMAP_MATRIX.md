## Roadmap Matrix

Updated: 2026-03-06

### Status Legend

| Status | Meaning |
|---|---|
| ✅ | Done |
| 🟡 | Next priority |
| ⏸️ | Deferred intentionally |

### Core Product / Security

| Track | Status | Scope | Current state | Next step |
|---|---|---|---|---|
| License core API | ✅ | activate / validate / heartbeat / deactivate | Stable, covered by tests | Keep stable |
| Signed request flow | ✅ | proof-of-possession, anti-forgery | Implemented and verified | Keep as baseline |
| mTLS edge flow | ✅ | nginx edge, cert binding, verify-mtls | Live flow verified | Use as production shape |
| Security hardening baseline | ✅ | private Strapi bind, trusted proxy token, strict freshness, secure mTLS default, dedicated webhook secret, signed signer auth, optional webhook IP allowlist, optional Strapi↔signer mTLS | Implemented in code/config and covered by targeted tests | Keep enforced in deploys |
| Offline / grace period | ✅ | grace, expiry, recovery heartbeat | Closed through HTTP integration tests | Done |
| Purchase / downloads | ✅ | paid orders, license keys, sample packs | Stable contract and tests | Done |

### PKI / Issuance / Runtime

| Track | Status | Scope | Current state | Next step |
|---|---|---|---|---|
| Remote signer | ✅ | Go `cert-signer`, remote issuance API | Working | Done |
| `step-ca` backend | ✅ | issuance via smallstep, actual serial return | Working and smoke-tested | Done |
| Docker dev stack | ✅ | Strapi + nginx + cert-signer + step-ca | Running and verified | Use for smoke/tests |
| Edge load smoke | ✅ | `k6 + mTLS` through Docker edge | 100/100 passed via `https://[::1]:8443` | Enough for dev proof |
| Bun test suite | ✅ | plugin/service/policy/http tests | `193/193` passing | Keep green |

### Production Readiness

| Track | Status | Scope | Current state | Next step |
|---|---|---|---|---|
| Production CA custody | ✅ | bundle verify, host audit, no root key on server | Tooling + docs ready | Apply on real server |
| Rollout / rollback tooling | ✅ | backup, deploy, audit, rollback helpers | Tooling ready | Use in canary rollout |
| Production bundle preparation | 🟡 | real server-ready PKI bundle | Format/process ready | Build real production bundle |
| Production intermediate issuance | 🟡 | issue real intermediate from offline root | Process ready | Perform real issuance |
| Canary rollout | 🟡 | deploy production bundle to server | Scripts/runbook ready | Execute rollout |
| Live production-like smoke | 🟡 | activate / validate / heartbeat after rollout | Not yet run on target server | Run canary smoke |
| Rollback readiness | 🟡 | fast restore to previous bundle | Script ready | Verify real backup path |

### Deferred

| Track | Status | Why deferred |
|---|---|---|
| Heavy local/admin UI track | ⏸️ | Expensive and not the main blocker now |
| Full local host-nginx cleanup | ⏸️ | Docker edge already proves the required path |
| Non-production polish tasks | ⏸️ | Do not move production PKI cutover forward |

### Recommended Execution Order

| Priority | Action | Goal |
|---|---|---|
| 1 | Build real production bundle | Remove main rollout blocker |
| 2 | Verify bundle with `verify-production-stepca-bundle.sh` | Confirm chain + no root key |
| 3 | Upload and run canary rollout | Move PKI runtime toward production |
| 4 | Run canary smoke | Confirm activate / validate / heartbeat on server |
| 5 | Confirm rollback path | Ensure safe recovery |

### After PKI Cutover

| Track | Status | Comment |
|---|---|---|
| SendGrid | 🟡 | Next ops integration layer |
| Sentry | 🟡 | Add after canary rollout |
| Prometheus / metrics | 🟡 | Add after runtime stabilizes |
| Grafana | 🟡 | Useful after metrics land |

### Executive Summary

| Item | State |
|---|---|
| Product logic | ✅ Ready |
| Security flow | ✅ Ready |
| Dev verification | ✅ Ready |
| Main next milestone | 🟡 Production bundle + canary rollout |
| Heavy local work | ⏸️ Parked for now |