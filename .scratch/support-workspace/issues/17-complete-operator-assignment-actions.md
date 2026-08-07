# 17 — Завершить действия оператора с назначением

**What to build:** Оператор принимает работу, освобождает или передаёт Case через один assignment use case с защитой от конфликтов.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** ready-for-agent

- [ ] Operator может claim Case и принять/отклонить routing offer, если это разрешено.
- [ ] Release и transfer показываются только по effective permission + server allowed action.
- [ ] Assignment, claimant, viewers и availability визуально остаются разными состояниями.
- [ ] Mutation использует version/action etag и сохраняет draft при `409`.
- [ ] Success обновляет selection, inbox row и workload через authoritative reconcile.
- [ ] Expired offer/revoked permission очищают action surface без утечки деталей.
