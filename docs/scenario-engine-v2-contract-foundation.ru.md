# Scenario Engine V2: frontend contract foundation

## Реализованный scope FE-V2-01

- OpenAPI snapshot обновлён с живой backend-ветки `codex/scenario-engine-v2-runtime` через `npm run api:fetch`.
- Orval client содержит `catalog`, `validate`, `preview`, `publish`, `rollback` и Run `explain`.
- Public frontend seam находится в `shared/api/repository/scenario-authoring`.
- Repository принимает и возвращает generated DTO, формирует только wire-envelope для `validate`, `preview` и `rollback` и централизованно преобразует transport errors в `ApiError`.
- Publish использует единственную атомарную backend-команду. Отдельного frontend activation шага нет: backend создаёт immutable revision и ставит Scenario в `ACTIVE` в одной transaction.
- OpenAPI пока помечает `rule` и `deliveryPolicy` как optional. Public repository принимает производный от generated DTO `ScenarioPublishInput`, где все четыре publish-поля обязательны, и не позволяет будущему UI уйти в legacy publish без typed rule или delivery policy.
- Contract gate проверяет обязательные publish concurrency fields, catalog field capabilities, Rule AST discriminator и leaves, Delivery Policy union, preview scope и `countsAsActivity`. Исчезновение этих частей schema ломает `api:check`, даже если operationId остался прежним.

## Нормализованный authoring contract

Один adapter объединяет generated OpenAPI enums с project catalog:

- event-field operators берутся из catalog и ограничиваются generated `EventFieldRuleNodeDtoOperator`;
- aggregate-filter operators являются пересечением catalog operators и generated `AggregateFilterDtoOperator`;
- event-level measures, field requirement, result/compare-value types и compare operators берутся из generated AST contract;
- field-level `sum/min/max` остаются доступны только для полей, которые разрешил catalog;
- `distinct_count` удаляется в этом adapter как известный BE-FE-09 defect и в development выдаёт warning.

Это временно локализует BE-FE-08A. UI не должен создавать собственные operator/measure matrices.

## Точный backend/OpenAPI gap

Rollback handler фактически возвращает созданную `ScenarioRevision`, но его `@ApiOkResponse` содержит только description без response type. Поэтому живой OpenAPI описывает `200` без `application/json` schema, а Orval корректно генерирует `scenarioAuthoringRollbackScenario(...): Promise<void>`.

Frontend не подставляет fallback DTO: repository пока возвращает `Promise<void>`. Чтобы CMS могла сохранить новый head после rollback, backend должен описать фактический success response отдельным DTO (или согласованным revision summary) в OpenAPI. Backend в этой реализации не изменялся.

## Сопутствующие изменения живого контракта

Обновлённый snapshot добавил `countsAsActivity` к Event Definition и сократил Scenario Run list до безопасного operational summary: step config/result/command payload больше не входят в list DTO, зато появились revision id, node key, executor и delivery-wait status. Existing frontend domain mapper приведён к generated contract без восстановления удалённых полей пустыми объектами.
