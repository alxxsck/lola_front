# 17 — Завершить действия оператора с назначением

**What to build:** Оператор принимает работу, освобождает или передаёт Case через один assignment use case с защитой от конфликтов.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** partially-blocked-by-backend

**Backend gate (audit 2026-08-07):** release и own offers доступны; manual claim/transfer
ждут Case-scoped eligible Team/operator targets. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#17--действия-оператора-с-назначением).

- [ ] Operator может claim Case и принять/отклонить routing offer, если это разрешено.
- [ ] Release и transfer показываются только по effective permission + server allowed action.
- [ ] Assignment, claimant, viewers и availability визуально остаются разными состояниями.
- [ ] Mutation использует version/action etag и сохраняет draft при `409`.
- [ ] Success обновляет selection, inbox row и workload через authoritative reconcile.
- [ ] Expired offer/revoked permission очищают action surface без утечки деталей.
