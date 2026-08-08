# 19 — Добавить SLA, routing и availability context

**What to build:** Оператор понимает, почему Case находится в очереди, кто может его взять и какой срок требует внимания.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** ready-for-frontend

**Backend gate (resolved 2026-08-08):** backend `main` `442d185` публикует typed SLA signal
для unified Inbox, selected-Case response/resolution clocks с action ETag, privacy-scoped current
routing context (`FULL | OWN | NONE`), Lead investigation routing facts и snapshot-paginated
current capacity risks. Блокер снят; задачу можно брать в frontend-разработку. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#19--sla-routing-и-availability-context).

- [ ] Inspector показывает queue, routing reason, team/skills eligibility и assignment offer/reservation state.
- [ ] Availability/capacity не выводятся из socket online или presence.
- [ ] SLA показывает response/resolution clocks, waiting side, pause/resume и breach state.
- [ ] Shadow/degraded/stale SLA не подписывается как contractual.
- [ ] Offer expiry/reservation loss обновляют allowed actions через reconcile.
- [ ] Inbox отображает один наиболее важный SLA signal с текстом, а не только цветом.
