# 19 — Добавить SLA, routing и availability context

**What to build:** Оператор понимает, почему Case находится в очереди, кто может его взять и какой срок требует внимания.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** ready-for-agent

- [ ] Inspector показывает queue, routing reason, team/skills eligibility и assignment offer/reservation state.
- [ ] Availability/capacity не выводятся из socket online или presence.
- [ ] SLA показывает response/resolution clocks, waiting side, pause/resume и breach state.
- [ ] Shadow/degraded/stale SLA не подписывается как contractual.
- [ ] Offer expiry/reservation loss обновляют allowed actions через reconcile.
- [ ] Inbox отображает один наиболее важный SLA signal с текстом, а не только цветом.
