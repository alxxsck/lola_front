# External Work — frontend capability matrix

## Зафиксированный контракт

- Backend: `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`.
- OpenAPI: `sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.
- Frontend вызывает generated client только через
  `support-external-work-source.ts`; UI не импортирует transport functions.
- OAuth credentials, opaque state, provider secrets и raw backend errors не
  попадают в DOM, URL, analytics или client logs.

## Поверхности и authority

| Surface                       | Route                            | Exact Project permission                         | Authority                                            |
| ----------------------------- | -------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Connection и mapping settings | `/support/settings/integrations` | `project.support.external_work.manage`           | backend connection/catalog/mapping roots             |
| Compatibility inbox           | `/support/external-work`         | `project.support.external_work.inbox_read`       | backend compatibility read model                     |
| Linked recovery               | `/support/external-work`         | `project.support.external_work.read_linked`      | remote read model + Case-scoped command receipts     |
| Safe retry                    | linked recovery detail           | `project.support.external_work.retry`            | exact Case command receipt + quoted numeric OCC      |
| Unknown evidence refresh      | linked recovery detail           | `project.support.external_work.resolve_unknown`  | exact Case command receipt + quoted numeric OCC      |
| Case external links           | Support Workspace Case inspector | `project.support.external_work.read_linked`      | Case-scoped links, remote projection и timeline      |
| Case external create          | Support Workspace Case inspector | `project.support.external_work.create` + `project.support.external_work.read_linked` | server create options + pinned mapping/form revision + authoritative receipt recovery |
| Internal external comment     | Support Workspace Case inspector | `project.support.external_work.comment_internal` | server allowed action + quoted link version          |
| Public external comment       | Support Workspace Case inspector | `project.support.external_work.comment_public`   | separate permission + explicit operator confirmation |
| Link compatibility inbox item | Support Workspace Case inspector | `project.support.external_work.inbox_read`       | exact item version + published mapping revision      |

`project.integrations.manage` не даёт доступ к Support External Work. Actor,
Project и permission scope участвуют в fencing каждого read/mutation.
Сам backend mutation проверяет exact `external_work.create`, но pinned read
contract разрешает reconciliation принятого `202` только с `read_linked`.
Поэтому frontend admission для Create требует оба permission и не открывает
необратимую команду create-only роли без способа проверить outcome.

## Mutation contract

- Settings commands используют stable `Idempotency-Key`, generated DTO body и,
  где опубликовано, quoted numeric `If-Match`.
- Audited commands отключают автоматический auth retry. `401/428` требуют новой
  аутентификации и забывают intent; `403/404` очищают protected state.
- Network/timeout и `429/503` сохраняют exact body/key/ETag в actor+Project
  scope. Новый intent заблокирован до exact replay и authoritative reread.
- `409 VERSION_CONFLICT` перечитывает target root, сохраняет operator draft и
  требует нового явного подтверждения. `OUTCOME_PENDING/UNKNOWN` сохраняет
  receipt и блокирует новый intent до actor-scoped reconciliation.
- Remote status не заменяет canonical Lola Case state. Unknown command остаётся
  unknown, пока сервер не вернул evidence/receipt.

## UI/UX contract

- Settings показывает connection lifecycle, site/account, version, capability
  proof, catalog freshness и last successful sync. Все server-cursor pages
  перечитываются; несколько sites одного provider остаются отдельными
  connection roots, а Add action не исчезает после первого подключения.
- Mapping lifecycle: create, draft, validation, preview, diff, publish и
  immutable rollback revision.
- Recovery workbench: bounded filters, route-owned deep link, opaque server
  cursors без client sorting, master/detail, remote correlation, failure
  category, next attempt/action и causal timeline.
- Skeletons сохраняют геометрию; transitions — 120–180 ms; reduced-motion
  выключает перемещения. Touch targets — не меньше 40 px, ключевые mobile
  controls — 44 px.

## Не входит в Ticket 31

- Ticket 32 завершает создание/link/comment/refresh/unlink External Work из
  Case inspector. Browser не вызывает provider напрямую и не меняет canonical
  Lola Case state по remote status.
- Import preview/execution — отдельная управляемая поверхность.
- Production rollout, реальные OAuth credentials и provider mutations остаются
  release-owner действиями; mock/manual frontend gate их не выполняет.
