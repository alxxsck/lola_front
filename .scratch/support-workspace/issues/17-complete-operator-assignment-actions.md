# 17 — Завершить действия оператора с назначением

**What to build:** Оператор принимает работу, освобождает или передаёт Case через один assignment use case с защитой от конфликтов.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** done — frontend `main`

**Backend gate:** снят в backend `main` `bdf8116`. Case-scoped eligible targets, server action
matrix и typed own-offer errors опубликованы и проверены; можно брать задачу в разработку. См.
[аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#17--действия-оператора-с-назначением).

- [x] Operator может claim Case и принять/отклонить routing offer, если это разрешено.
- [x] Release и transfer показываются только по effective permission + server allowed action.
- [x] Assignment, claimant, viewers и availability визуально остаются разными состояниями.
- [x] Mutation использует version/action etag и сохраняет draft при `409`.
- [x] Success обновляет selection, inbox row и workload через authoritative reconcile.
- [x] Expired offer/revoked permission очищают action surface без утечки деталей.

**Frontend evidence (2026-08-08):** pinned OpenAPI обновлён до backend gate
`bdf81166faba7a11b1df5ad3449747284dc21960`; старые раздельные release/offer
контуры удалены в пользу единого assignment source/controller/desk. Проверены
focused unit/component tests, полный Vitest suite, typecheck, lint + architecture,
build, backend assignment/offer contract tests и Playwright desktop/mobile E2E.
UI evidence: `docs/evidence/support-workspace/ticket-17-assignment-desktop.png`
и `docs/evidence/support-workspace/ticket-17-assignment-mobile.png`.
