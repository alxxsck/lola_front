# 30 — Синхронизировать JSM/HelpDesk-контракты

**What to build:** Зафиксировать отдельный adapter contract для внешней работы, не связывая core Case semantics с конкретным vendor.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Published operations разделяют connection/mapping authority, object read и Case-scoped actions.
- [ ] OAuth/credentials остаются backend-owned и не попадают во frontend state/logs.
- [ ] Vendor capabilities, required fields, async receipts и idempotency/lookup опубликованы сервером.
- [ ] Fixtures покрывают disconnected/degraded/reauth, stale destination, `202 pending`, partial failure и unknown outcome.
- [ ] Canonical Lola Case state не подменяется vendor status.
- [ ] Отдельного GSM adapter не предполагается без отдельного published contract.
