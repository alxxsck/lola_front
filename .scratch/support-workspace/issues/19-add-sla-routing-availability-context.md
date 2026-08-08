# 19 — Добавить SLA, routing и availability context

**What to build:** Оператор понимает, почему Case находится в очереди, кто может его взять и какой срок требует внимания.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** frontend-complete

**Backend gate (resolved 2026-08-08):** backend `main` `442d185` публикует typed SLA signal
для unified Inbox, selected-Case response/resolution clocks с action ETag, privacy-scoped current
routing context (`FULL | OWN | NONE`), Lead investigation routing facts и snapshot-paginated
current capacity risks. Блокер снят; задачу можно брать в frontend-разработку. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#19--sla-routing-и-availability-context).

- [x] Inspector показывает queue, routing reason, team/skills eligibility и assignment offer/reservation state.
- [x] Availability/capacity не выводятся из socket online или presence.
- [x] SLA показывает response/resolution clocks, waiting side, pause/resume и breach state.
- [x] Shadow/degraded/stale SLA не подписывается как contractual.
- [x] Offer expiry/reservation loss обновляют allowed actions через reconcile.
- [x] Inbox отображает один наиболее важный SLA signal с текстом, а не только цветом.

## Frontend evidence (2026-08-08)

- Pinned OpenAPI синхронизирован с backend `main` `442d185`; SLA/routing schemas защищены contract gate и generated-client check.
- Unified Inbox показывает один серверный SLA signal текстом; цвет используется только как дополнительный сигнал.
- Case inspector показывает серверные SLA clocks и routing context без вывода opaque ID, ETag или revision.
- Reservation expiry запускает до трёх bounded authoritative reconcile с backoff; интерфейс не меняет assignment state или allowed actions локально и после исчерпания показывает честное ручное обновление.
- Privacy/revoke состояния `REDACTED`, `NOT_EVALUATED` и отсутствие permission очищают чувствительный routing context.
- Unit/component/integration tests, TypeScript, lint, contract fixtures, build и Playwright desktop/mobile + axe прошли.
- Visual evidence: `docs/evidence/support-workspace/ticket-19-sla-routing-desktop-detail.png` и `docs/evidence/support-workspace/ticket-19-sla-routing-mobile.png`.
