# 18 — Добавить назначение и override для лида

**What to build:** Lead назначает и переназначает Case оператору или команде из Control и inspector через общий audited assignment flow.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию; 17 — Завершить действия оператора с назначением.

**Status:** frontend-complete-except-team-only-backend-gap

**Backend gate (проверено 2026-08-08):** backend `9a93282` публикует Case-scoped eligible
operator-in-Team targets, ordinary/force commands, single outcome lookup, durable bulk с
per-item receipt и safe Lead audit facts. Frontend pin обновлён на exact revision
`9a93282723b5ce9c6e57dae87a9bd9ee63c07387`.

- [x] Lead может assign/reassign/unassign Case конкретному оператору внутри Team по отдельным permissions.
- [x] Override availability/capacity требует server-owned force action и обязательного обоснования.
- [x] Command использует revision/OCC, сохраняет draft при conflict и восстанавливает неизвестный outcome без повторной команды.
- [x] Bulk assignment возвращает и показывает per-item `SUCCEEDED|FAILED`, включая общий `PARTIAL`.
- [x] Один Lead assignment use case доступен из Lead Control drill-down и Case inspector.
- [x] Safe audit timeline показывает actor kind, reason, target Team/operator, exact override и command outcome; raw protected note не выводится.
- [ ] Team-only assignment: backend request требует одновременно `teamId` и `operatorCmsUserId`, поэтому назначить Case только на Team невозможно.

**Frontend evidence:** `src/features/support-lead-assignment`, интеграции в
`SupportWorkspacePage.vue` и `SupportControlPage.vue`; contract assertions —
`scripts/support-inbox-case-workforce-contract.mjs`.
