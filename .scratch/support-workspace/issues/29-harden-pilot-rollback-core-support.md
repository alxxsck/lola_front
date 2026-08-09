# 29 — Провести hardening, pilot и rollback core Support

**What to build:** Проверить P0 Support Workspace на реальных операторских сценариях и безопасно включить его пилотному проекту.

**Blocked by:** 28 — Перевести legacy entry points на Support.

**Status:** frontend-complete; production pilot remains release-owner controlled

**Backend gate:** снят backend `9f36796b477d34fcac2a9a46844bbd78863df6e1`.
Frontend pinned OpenAPI —
`sha256:2f4da7559279192a20fd77bf07e72c377d9a031724a0d77a21a81aecd521ee44`.
Runbook/evidence: [frontend core pilot proof](../../../docs/support-workspace-core-pilot-frontend-release-proof.ru.md).

**Backend gate (audit 2026-08-07):** visual/read-only hardening можно продолжать; write pilot
ждёт 28 и typed project rollout/admission. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#29--hardening-pilot-и-rollback-core-support).

- [x] Visual matrix проходит desktop/tablet/mobile, light/dark, 200% zoom и mobile keyboard.
- [x] Keyboard-only и axe не находят critical/serious нарушения основного flow.
- [x] E2E покрывает reply, translation, assignment, classification, conflict, reconnect, revoke, project switch и Back.
- [x] Runtime telemetry из реальных reply/live/read/delivery controllers проверяет duplicate prevention, draft recovery, unread/delivery mismatch и передаёт duration для aggregate P95 без content/PII; фактический production P95 фиксирует Release owner в pilot window.
- [x] Read-only dogfood и one-project write pilot имеют владельца, runbook и success/abort criteria.
- [x] Rollback feature flags проверен; core pilot не ждёт attachments, macros, knowledge, notifications или external integrations.

Локальный frontend rehearsal не является production `GO`: immutable backend
`READ_ONLY → WRITE → ROLLBACK` manifests и фактическое включение pilot Project
остаётся внешним действием назначенного Release owner.
