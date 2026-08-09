# 31 — Реализовать Integration Settings и External Work

**What to build:** Администратор настраивает JSM/HelpDesk, а оператор видит отдельную очередь объектов, которые требуют синхронизации или ручного восстановления.

**Blocked by:** — (Ticket 30 resolved by backend `4a96a2a7`.)

**Status:** completed

**Frontend contract:** OpenAPI
`sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.

**Backend gate (audit 2026-08-07):** полный blocker — connection, provider catalog,
mapping lifecycle, External Work inbox и receipt APIs отсутствуют. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#31--integration-settings-и-external-work-inbox).

- [x] Settings показывает disconnected/authorizing/connected/degraded/reauth-required/disabled states.
- [x] Site/project выбираются явно, включая multi-site, с test connection и last successful sync.
- [x] Mapping имеет create/draft/preview/validation/publish/version diff/rollback.
- [x] External Work показывает remote object, last attempt, correlation, failure reason и next action.
- [x] Retry/reconcile не создают повторный внешний объект.
- [x] Filters и causal timeline позволяют восстановить `202 pending` и unknown outcome.
