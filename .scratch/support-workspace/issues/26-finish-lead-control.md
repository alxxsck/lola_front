# 26 — Завершить Lead Control

**What to build:** Lead идёт от server-defined риска к конкретному Case, понимает причину и выполняет разрешённое audited действие.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 10 — Добавить server search, filters и sort; 18 — Добавить назначение и override для лида; 19 — Добавить SLA, routing и availability context.

**Status:** frontend-complete

**Backend gate (validated 2026-08-09):** commit `0e3f35d9` публикует admission/readiness,
capacity risks, routing investigation, protected Activity и безопасные Lead target catalogs.
Pinned OpenAPI синхронизирован с этим fixed point. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#26--lead-control).

- [x] Summary KPI показывают definition, computedAt/freshness и корректный shadow/degraded state.
- [x] Risk tables покрывают unassigned, SLA breach/risk, capacity/routing и delivery failures.
- [x] Drill-down открывает точный отфильтрованный inbox/Case по canonical URL.
- [x] Assign/reassign/override использует общий lead assignment use case, а не отдельную упрощённую команду.
- [x] Alerts поддерживают NEW/ACKNOWLEDGED/RESOLVED, owner, occurrence count и audited reason.
- [x] Causal investigation timeline связывает routing, assignment, SLA, reply и delivery sources.
