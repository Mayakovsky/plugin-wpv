# Post-Launch Hardening — Flagged Issues

## 1. AcpService/WpvService Load Order Race Condition

**Flagged:** 2026-04-11 (ACP v2 migration)

**Symptom:** WpvService logs "AcpService not available — skipping ACP handler registration" on every startup, then registers successfully on 3s retry.

**Root cause:** `AcpService.start()` returns before `connectSdk()` completes. The SDK connection (Privy auth + SocketTransport handshake) is async. WpvService runs `registerWithAcp()` during its own `start()`, finds AcpService not yet connected, logs warning, retries after 3s.

**Risk:** If SDK takes >3s (Privy timeout, network), WpvService runs standalone with no ACP connection. No error — just silent degradation.

**Fix:** Make `AcpService.start()` await full SDK connection before returning. Or emit a "ready" event that WpvService subscribes to instead of polling.

**Priority:** Low — works in practice, survived 37 evals + graduation. Fix when refactoring plugin lifecycle.
