# 30 — Синхронизировать JSM/HelpDesk-контракты

**What to build:** Зафиксировать отдельный adapter contract для внешней работы, не связывая core Case semantics с конкретным vendor.

**Blocked by:** Published backend External Work/JSM/HelpDesk contract — absent on audited `origin/main`.

**Status:** blocked-by-backend

**Backend gate (audit 2026-08-07):** полный blocker — в backend `main` нет External Work,
JSM или HelpDesk API/schemas/implementation; присутствует только нормативная документация. См.
[аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#30--синхронизация-jsmhelpdesk-контрактов).

- [ ] Published operations разделяют connection/mapping authority, object read и Case-scoped actions.
- [ ] OAuth/credentials остаются backend-owned и не попадают во frontend state/logs.
- [ ] Vendor capabilities, required fields, async receipts и idempotency/lookup опубликованы сервером.
- [ ] Fixtures покрывают disconnected/degraded/reauth, stale destination, `202 pending`, partial failure и unknown outcome.
- [ ] Canonical Lola Case state не подменяется vendor status.
- [ ] Отдельного GSM adapter не предполагается без отдельного published contract.
