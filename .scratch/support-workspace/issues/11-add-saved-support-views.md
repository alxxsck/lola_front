# 11 — Подключить Saved Views

**What to build:** Оператор сохраняет рабочие фильтры и возвращается к ним через список представлений с server-owned freshness/count semantics.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** complete

**Backend gate (verified 2026-08-08):** разблокирован backend commit `b63d8bc`.
Pinned OpenAPI содержит Saved Views, System Views, OCC/ETag, idempotency,
authoritative count/freshness и query receipts. См. [contract gate](../../../docs/specs/support-workspace-frontend/15-search-saved-views-contract-blockers.ru.md#ticket-11--saved-views).

**Execution gate:** снят; frontend реализован и проверен по pinned contract.

- [x] System Views и personal/team Saved Views различаются по scope и permissions.
- [x] Create/replace/publish/archive используют revision contract и показывают conflict рядом с действием.
- [x] Выбор view обновляет URL и authoritative inbox query.
- [x] Count/freshness отображаются только когда их возвращает сервер.
- [x] Удалённое или запрещённое view безопасно удаляется из navigation и выбирается допустимый fallback.
- [x] Reload и project switch не смешивают views разных проектов.
