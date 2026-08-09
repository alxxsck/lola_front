# 30 — Синхронизировать JSM/HelpDesk-контракты

**What to build:** Зафиксировать отдельный adapter contract для внешней работы, не связывая core Case semantics с конкретным vendor.

**Blocked by:** —

**Status:** completed-by-backend

**Resolved:** backend commit `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`, frontend
OpenAPI `sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.

**Backend gate (audit 2026-08-07):** полный blocker — в backend `main` нет External Work,
JSM или HelpDesk API/schemas/implementation; присутствует только нормативная документация. См.
[аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#30--синхронизация-jsmhelpdesk-контрактов).

- [x] Published operations разделяют connection/mapping authority, object read и Case-scoped actions.
- [x] OAuth/credentials остаются backend-owned и не попадают во frontend state/logs.
- [x] Vendor capabilities, required fields, async receipts и idempotency/lookup опубликованы сервером.
- [x] Fixtures покрывают disconnected/degraded/reauth, stale destination, `202 pending`, partial failure и unknown outcome.
- [x] Canonical Lola Case state не подменяется vendor status.
- [x] Отдельного GSM adapter не предполагается без отдельного published contract.
