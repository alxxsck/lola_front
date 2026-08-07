# 29 — Провести hardening, pilot и rollback core Support

**What to build:** Проверить P0 Support Workspace на реальных операторских сценариях и безопасно включить его пилотному проекту.

**Blocked by:** 28 — Перевести legacy entry points на Support.

**Status:** transitively-blocked-by-backend

**Backend gate (audit 2026-08-07):** visual/read-only hardening можно продолжать; write pilot
ждёт 28 и typed project rollout/admission. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#29--hardening-pilot-и-rollback-core-support).

- [ ] Visual matrix проходит desktop/tablet/mobile, light/dark, 200% zoom и mobile keyboard.
- [ ] Keyboard-only и axe не находят critical/serious нарушения основного flow.
- [ ] E2E покрывает reply, translation, assignment, classification, conflict, reconnect, revoke, project switch и Back.
- [ ] Telemetry проверяет duplicate prevention, draft recovery, unread/delivery accuracy и P95 feedback без content/PII.
- [ ] Read-only dogfood и one-project write pilot имеют владельца, runbook и success/abort criteria.
- [ ] Rollback feature flags проверен; core pilot не ждёт attachments, macros, knowledge, notifications или external integrations.
