# 31 — Реализовать Integration Settings и External Work

**What to build:** Администратор настраивает JSM/HelpDesk, а оператор видит отдельную очередь объектов, которые требуют синхронизации или ручного восстановления.

**Blocked by:** 30 — Синхронизировать JSM/HelpDesk-контракты.

**Status:** ready-for-agent

- [ ] Settings показывает disconnected/authorizing/connected/degraded/reauth-required/disabled states.
- [ ] Site/project выбираются явно, включая multi-site, с test connection и last successful sync.
- [ ] Mapping имеет draft/preview/validation/publish/version diff/rollback.
- [ ] External Work показывает remote object, last attempt, correlation, failure reason и next action.
- [ ] Retry/reconcile не создают повторный внешний объект.
- [ ] Filters и causal timeline позволяют восстановить `202 pending` и unknown outcome.
