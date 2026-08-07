# 26 — Завершить Lead Control

**What to build:** Lead идёт от server-defined риска к конкретному Case, понимает причину и выполняет разрешённое audited действие.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 10 — Добавить server search, filters и sort; 18 — Добавить назначение и override для лида; 19 — Добавить SLA, routing и availability context.

**Status:** ready-for-agent

- [ ] Summary KPI показывают definition, computedAt/freshness и корректный shadow/degraded state.
- [ ] Risk tables покрывают unassigned, SLA breach/risk, overloaded, stuck routing и delivery failures.
- [ ] Drill-down открывает точный отфильтрованный inbox/Case по canonical URL.
- [ ] Assign/reassign/override использует общий lead assignment use case, а не отдельную упрощённую команду.
- [ ] Alerts поддерживают open/acknowledged/closed, owner, occurrence count и audited reason.
- [ ] Causal investigation timeline связывает routing, assignment, SLA и delivery sources.
