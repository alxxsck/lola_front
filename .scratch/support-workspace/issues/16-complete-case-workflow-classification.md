# 16 — Завершить Case workflow и классификацию

**What to build:** Оператор меняет состояние, классификацию и приоритет обращения прямо в inspector с server-owned authority и audit trail.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** partially-blocked-by-backend

**Backend gate (audit 2026-08-07):** базовые workflow/classification mutations готовы;
priority floor, confidence/evidence, action-level authority и typed audit/errors не опубликованы.
См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#16--case-workflow-и-классификация).

- [ ] Inspector показывает canonical state, category/topic, confidence/evidence, priority и priority floor.
- [ ] Оператор может исправить classification с обязательной reason там, где это требует contract.
- [ ] Разрешённые transitions включают open/wait/resolve/reopen/escalate без client-derived policy.
- [ ] Mutation использует allowed action, expected revision/etag и показывает changed state при `409`.
- [ ] Audit/activity отражает actor, reason, previous/next value и server timestamp.
- [ ] Classification dialog старого Case UI больше не нужен в основном Support flow.
