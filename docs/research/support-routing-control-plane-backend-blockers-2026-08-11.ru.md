# Backend-блокеры полного Routing Control Plane

Дата аудита: 2026-08-11

Backend snapshot: `b72dd685567e20aebf10a3d43e13719ea8bde18f` (`Fix support case notification online migrations`)

Репозиторий backend: `/Users/alxxsck/Documents/Lola_backend`

## Executive verdict

Механика live-routing на backend уже существует: опубликованные Queue, Routing
Policy и Workforce связываются через Queue Slot; Queue можно активировать в
`OFFER` или `AUTO_ASSIGN`; worker создаёт закреплённые Routing Decisions и
делегирует резервацию/назначение владельцу Assignment.

Однако backend snapshot ещё не предоставляет достаточный **human control-plane
contract** для полноценного frontend. Семь P0 ниже не являются пожеланиями к
красоте интерфейса. Это отсутствующие или противоречивые server-owned контракты,
из-за которых UI не может:

1. восстановить уже сохранённую топологию Queue → Policy после перезагрузки;
2. авторитетно объяснить, чего не хватает для активации;
3. безопасно прочитать и сравнить Policy;
4. стабильно отобразить доказательства Routing Decision;
5. показать операторов без обхода IAM и утечки CMS-профиля;
6. гарантировать round-trip разрешённых параметров Policy;
7. связать ручной Shadow Run с получившимися результатами.

Итоговая оценка:

- live runtime и Assignment/Offer flow **не нужно переписывать**;
- до начала основной frontend-реализации следует закрыть семь P0 контрактными
  backend-срезами;
- история версий, server diff и restore-as-new-draft относятся к P1 governance,
  если их явно не сделать частью определения «маршрутизация завершена»;
- экспорт OpenAPI и регенерация frontend-клиента выполняются во frontend ticket
  после стабилизации backend-контрактов и сами по себе backend-блокером не
  являются.

## Архитектурные ограничения

Аудит следует принятой модели владения:

- Support Operations владеет Workforce, Queue, Routing, Assignment и их
  проекциями, но не копирует IAM/CMS User write model: [ADR-0032](../../../Lola_backend/docs/adr/0032-support-operations-compose-domain-owners.md);
- публичное имя оператора — отдельная Project-owned Support Presentation, а не
  email, роль или CMS-профиль: [ADR-0042](../../../Lola_backend/docs/adr/0042-project-scoped-support-presentations.md);
- Support Platform имеет один deployment-wide availability switch; readiness и
  публикации — факты домена, но не скрытые feature flags: [ADR-0047](../../../Lola_backend/docs/adr/0047-one-deployment-wide-support-switch.md);
- Operator Availability — длительное намерение оператора и не должна
  подменяться browser presence или настройками Workforce: [ADR-0048](../../../Lola_backend/docs/adr/0048-operator-availability-is-durable-intent.md).

## Ownership matrix

| Область | Владелец | Приоритет | Решение |
|---|---|---:|---|
| Queue Slot catalog/read | Routing | P0 | Новый bounded read contract |
| Routing readiness | Routing | P0 | Server-owned projection с закрытыми reason codes |
| Typed Routing Policy response | Routing | P0 | Явные DTO draft/published/configuration |
| Typed Decision investigation | Routing | P0 | Закрытые outcome/exclusion/candidate DTO |
| Operator presentation catalog/batch | Shared Support Presentations + Workforce composition | P0 | Safe, PII-free resolver |
| Policy round-trip и retry bounds | Routing | P0 | Исправление reader и единого validation contract |
| Shadow Run correlation | Routing | P0 | Durable run resource и связь с Decisions |
| Revision history/diff/restore | Queue, Routing, Workforce | P1 | Governance API поверх immutable revisions |
| Audit timeline конфигурации | IAM audit + владельцы ресурсов | P1 | Safe resource-scoped read projection |
| Редакторы, анимация, responsive layout | Frontend | Не backend blocker | Реализовать после P0 contracts |
| OpenAPI export/client regeneration | Frontend integration | Не backend blocker | Выполнить после стабилизации API |

## P0.1. Queue Slot можно записать, но нельзя прочитать

### Evidence

Runtime controller содержит только
`PUT /admin/projects/:projectId/support/routing/queue-slots/:queueId`:
[support-routing-runtime.controller.ts:135](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L135).

Сервис предоставляет только `set(...)` и возвращает один изменённый slot:
[support-routing-queue-slot.service.ts:17](../../../Lola_backend/src/modules/support-operations/application/support-routing-queue-slot.service.ts#L17),
[support-routing-queue-slot.service.ts:34](../../../Lola_backend/src/modules/support-operations/application/support-routing-queue-slot.service.ts#L34).

При этом authoritative state уже хранится в
`support_queue_routing_slots`; на Project действует уникальный
`routePriority`:
[schema.prisma:12074](../../../Lola_backend/prisma/schema.prisma#L12074).

Следствие: после reload frontend не может узнать связь неактивной Queue с Policy,
её route priority и версию. Activation catalog не заменяет этот read, потому что
содержит только текущие активированные vectors.

### Target HTTP contract

```text
GET /admin/projects/{projectId}/support/routing/queue-slots?cursor=&limit=
GET /admin/projects/{projectId}/support/routing/queue-slots/{queueId}
```

Catalog response:

```ts
type SupportRoutingQueueSlotCatalogResponse = {
  items: Array<{
    queueId: string;
    policyId: string;
    routePriority: number;
    version: number;
    updatedAt: string;
  }>;
  nextCursor: string | null;
  configurationVersion: number;
  actionEtag: string;
};
```

- сортировка: `routePriority ASC, queueId ASC`;
- `limit <= 100`, cursor Project/filter/authorization-bound;
- `Cache-Control: no-store, no-transform`;
- `routing.read` или `routing.manage` для чтения;
- существующий PUT остаётся под `routing.manage`, `If-Match` и
  `Idempotency-Key`.

### Service/persistence DoD

- добавить read seam, не читать slot напрямую из frontend-specific service;
- читать slot, root version и ETag в одной IAM-bound transaction;
- не возвращать Policy body или Queue body из slot catalog;
- сохранить уникальность `(project_id, route_priority)` и существующий
  `SUPPORT_ROUTING_ROUTE_PRIORITY_IN_USE`:
  [support-routing-queue-slot.service.ts:147](../../../Lola_backend/src/modules/support-operations/application/support-routing-queue-slot.service.ts#L147);
- индекс `(project_id, route_priority, queue_id)` добавлять только если
  `EXPLAIN` покажет необходимость; отдельной data migration не требуется.

### Error and test DoD

- typed errors: invalid cursor/limit, concealed not-found, version conflict,
  priority conflict, degraded dependency;
- OpenAPI проверяет named DTO, bounds и `additionalProperties: false`;
- HTTP/permission tests: read/manage allow, чужой Project concealed, отсутствие
  slot возвращает 404 только в detail и пустой catalog в list;
- PostgreSQL test: PUT → GET detail → GET catalog сохраняет exact
  `policyId/routePriority/version`; конкурентный priority даёт один winner.

## P0.2. Нет server-owned readiness projection

### Evidence

`GET /routing/activation` возвращает только текущие activations:
[support-routing-activation.service.ts:44](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L44),
[support-routing-activation.service.ts:71](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L71),
[support-routing.dto.ts:326](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L326).

Готовность фактически вычисляется inner join-ами по:

- Queue Slot;
- active Queue с current published revision;
- текущей `READY` Queue Generation;
- active Policy с current published revision;
- опубликованному Workforce;
- совместимому Queue routing mode.

Это видно в
[support-routing-activation.service.ts:309](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L309).
Любой отсутствующий join и несовместимый mode сворачиваются в один
`SUPPORT_ROUTING_CONFIGURATION_NOT_READY`:
[support-routing-activation.service.ts:338](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L338).

Следствие: frontend может показать лишь общий отказ и вынужден угадывать причину
по нескольким несинхронным reads.

### Target HTTP/DTO contract

```text
GET /admin/projects/{projectId}/support/routing/readiness?queueId=
```

```ts
type SupportRoutingReadinessItem = {
  queueId: string;
  status: 'READY' | 'NOT_READY' | 'DEGRADED';
  allowedTargetModes: Array<'OFFER' | 'AUTO_ASSIGN'>;
  checks: Array<{
    code:
      | 'SLOT_MISSING'
      | 'QUEUE_NOT_PUBLISHED'
      | 'QUEUE_GENERATION_BUILDING'
      | 'QUEUE_GENERATION_DEGRADED'
      | 'POLICY_NOT_PUBLISHED'
      | 'WORKFORCE_NOT_PUBLISHED'
      | 'QUEUE_MODE_INCOMPATIBLE';
    status: 'PASS' | 'BLOCKING' | 'DEGRADED';
    resourceId: string | null;
    observedVersion: number | null;
  }>;
  candidateVector: {
    queueRevisionId: string;
    queueGenerationId: string;
    policyId: string;
    policyRevisionId: string;
    workforceRevisionId: string;
    algorithmRevision: string;
    routePriority: number;
  } | null;
  currentActivation: SupportRoutingQueueActivationResponse | null;
};
```

Readiness не должна становиться новой rollout gate. Это read projection тех же
фактов, которые activation повторно проверяет под lock.

### Service/persistence DoD

- один общий domain query используется readiness read и activation preflight;
- activation продолжает повторно собирать exact vector внутри своей
  Serializable transaction перед commit;
- `READY` не является обещанием будущего успеха и содержит observed pins;
- никакого client-provided vector или client-computed readiness;
- максимум 100 Queue items, без Case/operator fan-out;
- worker/database readiness может давать `DEGRADED`, но не превращается в
  feature flag.

### Error and test DoD

- activation при отказе возвращает стабильный
  `SUPPORT_ROUTING_CONFIGURATION_NOT_READY` и безопасный массив blocking reason
  codes либо ссылку на тот же readiness resource;
- по одному test case на каждый отсутствующий/деградировавший join;
- race test: readiness был `READY`, публикация сменилась до activation — command
  не использует устаревший browser vector;
- permission/concealment tests и OpenAPI enum exactness;
- test подтверждает, что Queue publication сама не переписывает уже активный
  pinned vector.

## P0.3. Routing Policy response нетипизирован и не отдаёт published configuration

### Evidence

HTTP DTO объявляет `draft` и `publishedRevision` как произвольные object:
[support-routing.dto.ts:348](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L348).

Внутренний port при этом знает точную форму draft configuration:
[support-routing-workspace.port.ts:46](../../../Lola_backend/src/modules/support-operations/public/support-routing-workspace.port.ts#L46).

Published revision во внутренней проекции содержит только metadata и не
содержит configuration:
[support-routing-workspace.port.ts:57](../../../Lola_backend/src/modules/support-operations/public/support-routing-workspace.port.ts#L57).

Следствие: generated consumer получает `Record<string, unknown>`, не может
построить безопасную форму, а manager не может авторитетно сравнить draft с
published state.

### Target DTO contract

Добавить named DTO:

- `SupportRoutingPolicyConfigurationResponseDto`;
- `SupportRoutingPolicyDraftResponseDto`;
- `SupportRoutingPolicyPublishedRevisionResponseDto`;
- `SupportRoutingPolicyResponseDto`.

Published revision должен включать exact compiled configuration:

```ts
type SupportRoutingPolicyPublishedRevisionResponse = {
  id: string;
  revisionNumber: number;
  sourceDraftGeneration: number;
  contentHash: string;
  algorithmRevision: 'routing-v1';
  configuration: SupportRoutingPolicyConfigurationResponse;
  publishedAt: string;
};
```

`draft.configuration` и `publishedRevision.configuration` используют одну
закрытую схему, включая `weights`, `queueWeights`, `timeouts` и `retry`.

### Service/persistence DoD

- projection reader возвращает draft и published configuration одновременно;
- catalog может возвращать metadata-only summary, detail обязан вернуть обе
  конфигурации;
- response не использует `additionalProperties: true`;
- все даты имеют `date-time`, IDs — `uuid`, hash — pattern/length 64;
- lifecycle, algorithm revision и mutation intent — закрытые enum;
- read-only caller не получает unpublished draft; manager получает draft.

### Error and test DoD

- OpenAPI schema tests проверяют named nested DTO и запрет неизвестных полей;
- create/read/replace/publish round-trip test с каждым optional coefficient;
- test manager detail: одновременно видны draft и published config;
- test read-only detail: опубликованная config видна, draft отсутствует;
- corruption даёт typed `SUPPORT_ROUTING_DEGRADED`, не 500 и не усечённый
  object.

## P0.4. Decision investigation DTO расходится с фактической проекцией

### Evidence

Read service фактически читает и возвращает `selectedTeamId`, а candidate имеет
`rank`, `operatorId`, `eligible`, `exclusions`, `score`, `factVersions`:
[support-routing-decision-read.service.ts:12](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L12),
[support-routing-decision-read.service.ts:59](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L59),
[support-routing-decision-read.service.ts:278](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L278).

HTTP DTO:

- не объявляет `selectedTeamId`;
- объявляет `outcome` просто string;
- оставляет `inputManifest/sourceVector` произвольными object;
- объявляет candidate как object без единого свойства.

Evidence:
[support-routing.dto.ts:256](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L256),
[support-routing.dto.ts:281](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L281).

В persistence уже есть live correlation fields — activation, admission/vector и
attempt — но read projection их не отдаёт:
[schema.prisma:12271](../../../Lola_backend/prisma/schema.prisma#L12271).

### Target DTO contract

Добавить закрытые DTO для:

- decision `mode` и `outcome`;
- `selectedTeamId` и `selectedOperatorId`;
- activation/vector/attempt pins для `LIVE_PROPOSAL`;
- exclusion reason enum;
- score components;
- candidate summary;
- безопасного typed evidence envelope.

Raw internal IAM/data-scope facts не должны автоматически становиться public
API. `factVersions`, `inputManifest` и `sourceVector` следует преобразовать в
явно разрешённый redacted DTO с IDs/versions/hashes, нужными для investigation.

### Service/persistence DoD

- list остаётся bounded summary; detail отдаёт максимум 50 candidates;
- response соответствует фактически возвращаемому объекту byte-for-byte;
- candidate presentation может быть присоединена только через P0.5 и не
  заменяет immutable `operatorId`;
- historical Decision не пересчитывается и не переписывается при смене имени;
- list cursor остаётся Project/authorization/time-window-bound:
  [support-routing-decision-read.service.ts:197](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L197).

### Error and test DoD

- OpenAPI/runtime parity test сериализует реальный summary и detail;
- по одному fixture на каждый outcome и exclusion reason;
- SHADOW и LIVE_PROPOSAL fixtures проверяют nullable/required pins;
- PII negative test: нет email, role IDs, credential state, raw policy body,
  message content;
- cross-Project ID concealed;
- corrupt persisted proof возвращает controlled degraded response/error, а не
  необработанный 500.

## P0.5. Нет безопасного каталога/пакетного resolver операторов

### Ownership

Это shared Support P0, а не Routing-owned read CMS Users. Источник публичной
презентации — Support Presentations по ADR-0042; Workforce и Routing лишь
потребители безопасной проекции.

### Evidence

Presentations API умеет прочитать только одного заранее известного оператора:
`GET /support/presentations/operators/:cmsUserId`, причём требует отдельного
`project.support.presentations.read`:
[support-presentations.controller.ts:51](../../../Lola_backend/src/modules/chat/support-presentations.controller.ts#L51).

Port также предоставляет только single-item `operator(...)`:
[support-presentations.port.ts:28](../../../Lola_backend/src/modules/chat/support-presentations.port.ts#L28).

Общий Membership catalog — неправильная замена: он требует
`project.members.read` и возвращает email, given/family names, roles и effective
permissions:
[project-membership.controller.ts:62](../../../Lola_backend/src/modules/iam/memberships/project-membership.controller.ts#L62),
[project-membership.dto.ts:97](../../../Lola_backend/src/modules/iam/memberships/project-membership.dto.ts#L97).

Workforce input хранит только `cmsUserId`:
[support-workforce.dto.ts:182](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L182).
Поэтому Support Lead с `teams.manage` не имеет корректного способа выбрать и
назвать операторов без более широкого IAM permission.

### Target HTTP/DTO contract

```text
GET  /admin/projects/{projectId}/support/presentations/operators?cursor=&limit=&search=
POST /admin/projects/{projectId}/support/presentations/operators/resolve
```

Batch body: максимум 100 distinct `cmsUserIds`. Safe item:

```ts
type SupportOperatorPresentationSummary = {
  cmsUserId: string;
  displayName: string;
  presentationVersion: number;
  avatar: { assetId: string; version: number } | null;
  membershipState: 'ACTIVE' | 'INACTIVE';
  selectable: boolean;
};
```

Catalog для Workforce authoring показывает только текущих Project members,
которых разрешено привязать. Batch resolver нужен для уже сохранённых IDs,
Decision detail и исторических экранов.

### Service/persistence/security DoD

- авторизация по потребительской цели: `teams.read/manage` для Workforce,
  `routing.read/manage` для Decision; не выдавать `project.members.read`;
- resolver использует Presentation owner и deterministic fallback, но не
  копирует CMS User profile в Routing tables;
- response никогда не содержит email, given/family names, roles, permissions,
  status credentials или raw object key;
- avatar выдаётся как versioned reference; signed read grant остаётся отдельным
  авторизованным действием;
- search bounded и нормализован, cursor подписан и Project-bound;
- historical workforce/decision IDs не должны исчезать из batch response без
  явного `INACTIVE/not selectable` состояния.

### Test DoD

- permission matrix для Workforce reader/manager и Routing reader/manager;
- inactive membership, отсутствующая custom presentation и revoked avatar;
- batch bounds, duplicate normalization, search/cursor mismatch;
- cross-Project concealment;
- explicit JSON snapshot без PII;
- query-count/load test исключает N+1 на 100 операторов.

## P0.6. Policy round-trip повреждён, а retry bounds противоречат друг другу

### Evidence: round-trip

Reader восстанавливает stored Policy через compiler, но передаёт только skills,
languages, capacity, utilization и `weights`:
[prisma-support-routing-projection-read.ts:147](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-routing-projection-read.ts#L147).

Compiler включает в canonical value и content hash также `queueWeights`,
`timeouts`, `retry`:
[support-routing.ts:178](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L178),
[support-routing.ts:190](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L190),
[support-routing.ts:205](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L205).

Если эти значения отличаются от defaults, read может пересчитать другой hash и
вернуть `SUPPORT_ROUTING_DEGRADED`:
[prisma-support-routing-projection-read.ts:159](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-routing-projection-read.ts#L159).

### Evidence: retry bounds

HTTP DTO принимает `maxAttempts` до 10:
[support-routing.dto.ts:92](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L92).

Domain compiler разрешает только 1..5:
[support-routing.ts:200](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L200).

Domain test уже утверждает, что 6 невалидно:
[support-routing-domain.test.ts:99](../../../Lola_backend/test/support-routing-domain.test.ts#L99).

### Fix DoD

- `stored(...)` передаёт compiler все поля:
  `queueWeights`, `timeouts`, `retry`;
- DTO/OpenAPI `maxAttempts.maximum` становится 5; поднимать runtime ceiling до
  10 без отдельного domain решения нельзя;
- create/replace validation использует один canonical compiler error mapping;
- существующие корректные rows не переписываются: дефект находится в reader, не
  в persisted configuration;
- выполнить диагностический read всех существующих Policy revisions до release,
  чтобы отделить reader bug от реально повреждённых rows.

### Error and test DoD

- unit и PostgreSQL round-trip с non-default `queueWeights`, `timeouts`, `retry`;
- draft и published revision возвращают исходный content hash;
- boundary: 5 принимается, 6 отклоняется на HTTP validation layer стабильной
  ошибкой;
- неизвестные nested keys запрещены;
- намеренно повреждённый config/hash даёт `SUPPORT_ROUTING_DEGRADED`;
- regression test покрывает read после process restart, а не только результат
  mutation receipt.

## P0.7. Ручной Shadow Run нельзя связать с Decisions

### Evidence

POST shadow-run принимает только bounded limit и возвращает `{ accepted }`:
[support-routing.dto.ts:202](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L202),
[support-routing-shadow-run-request.service.ts:14](../../../Lola_backend/src/modules/support-operations/application/support-routing-shadow-run-request.service.ts#L14).

Work coalesced уникально по `(projectId, caseId)` и не содержит run/request ID:
[schema.prisma:12239](../../../Lola_backend/prisma/schema.prisma#L12239).

Decision также не содержит manual run ID:
[schema.prisma:12271](../../../Lola_backend/prisma/schema.prisma#L12271).

Worker создаёт Decision и candidates, но не может вернуть связь исходному
запросу:
[prisma-support-routing-shadow-work.ts:275](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-routing-shadow-work.ts#L275).

Следствие: UI после «Запустить проверку» не может показать progress, завершение,
ошибки и точный набор результатов этого запуска. Фильтр по времени не является
надёжной correlation identity.

### Target resource contract

```text
POST /admin/projects/{projectId}/support/routing/shadow-runs
GET  /admin/projects/{projectId}/support/routing/shadow-runs/{runId}
GET  /admin/projects/{projectId}/support/routing/shadow-runs/{runId}/decisions?cursor=&limit=
```

POST возвращает durable resource:

```ts
type SupportRoutingShadowRunResponse = {
  id: string;
  state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  requested: number;
  accepted: number;
  pending: number;
  completed: number;
  failed: number;
  createdAt: string;
  completedAt: string | null;
};
```

### Persistence/migration DoD

- additive `support_routing_shadow_runs` root с Project ID, actor attribution,
  request/correlation IDs, state/counters/timestamps;
- отдельная run↔case/work/decision association, потому что один coalesced work
  может обслужить несколько overlapping runs;
- FK и indexes всегда начинаются с `project_id`;
- state/counters обновляются атомарно с Decision completion/failure;
- crash/retry и deterministic Decision replay не создают ложные duplicate
  completions;
- retention policy bounded; idempotency key, raw token и PII не сохраняются в
  public result;
- существующий unique coalescing work можно сохранить, нельзя просто добавить
  один nullable `run_id` в work row и потерять many-to-many semantics.

### Error and test DoD

- POST idempotency и exact replay;
- два overlapping runs на один Case оба завершаются и ссылаются на один
  допустимый deterministic Decision;
- worker crash до/после Decision commit;
- stale/fenced/dead-letter outcomes корректно закрывают run counters;
- Project/IAM concealment и bounded pagination;
- OpenAPI named DTOs и state enums;
- cleanup/retention test не удаляет Decision evidence, закреплённое другими
  владельцами.

## P1. Governance после функционального P0

### Revision history, diff и restore-as-new-draft

Immutable history уже хранится:

- Workforce revision с publisher/time и normalized snapshot:
  [schema.prisma:11925](../../../Lola_backend/prisma/schema.prisma#L11925);
- Routing Policy revision с config, publisher/time:
  [schema.prisma:12203](../../../Lola_backend/prisma/schema.prisma#L12203);
- Queue revision с config, publisher/time и history index:
  [schema.prisma:12507](../../../Lola_backend/prisma/schema.prisma#L12507).

Human APIs показывают только current revision; нет list/detail всех revisions,
server diff и restore. Рекомендуемые endpoints:

```text
GET  .../queues/{queueId}/revisions
GET  .../queues/{queueId}/revisions/{revisionId}
POST .../queues/{queueId}/revisions/{revisionId}/restore-draft

GET  .../routing/policies/{policyId}/revisions
GET  .../routing/policies/{policyId}/revisions/{revisionId}
POST .../routing/policies/{policyId}/revisions/{revisionId}/restore-draft

GET  .../workforce/revisions
GET  .../workforce/revisions/{revisionId}
POST .../workforce/revisions/{revisionId}/restore-draft
```

Правила:

- restore создаёт **новый draft generation**, не двигает published pointer и не
  изменяет старую revision;
- mutation требует `If-Match`, `Idempotency-Key` и bounded reason code;
- diff вычисляет сервер по canonical typed configuration;
- publisher отображается через safe presentation, не raw actor ID/email;
- Policy может потребовать index
  `(project_id, policy_id, revision_number DESC)` после проверки плана.

### Resource-scoped audit timeline

Command receipt tables существуют для Workforce, Routing control/activation,
Routing Policy и Queue:
[schema.prisma:12027](../../../Lola_backend/prisma/schema.prisma#L12027),
[schema.prisma:12157](../../../Lola_backend/prisma/schema.prisma#L12157),
[schema.prisma:12222](../../../Lola_backend/prisma/schema.prisma#L12222),
[schema.prisma:12730](../../../Lola_backend/prisma/schema.prisma#L12730).

Но receipts являются idempotency evidence, а не готовым human audit API.
Следующий P1 должен дать resource-scoped timeline с operation, safe actor
presentation, reason, timestamp, old/new revision IDs и correlation ID без
request payload, idempotency hash или PII.

## Non-blockers и границы ticket

Следующее не должно раздувать backend P0:

- ручное назначение, transfer, OFFER accept/decline и AUTO_ASSIGN runtime уже
  принадлежат Assignment/Offer flow;
- текущая Availability остаётся отдельным live state и не редактируется внутри
  Workforce draft;
- Queue editor, form validation presentation, граф topology, drag-and-drop,
  animation, responsive layout и reduced motion — frontend responsibility;
- server не обязан хранить визуальные координаты routing graph;
- frontend не должен вычислять candidate rank, capacity, readiness или
  activation vector;
- отдельный per-Project routing enable flag не нужен и противоречит ADR-0047;
- удалённые admission/project-rollout contracts не следует возвращать.

Последнее подтверждает текущий activation contract test: в command больше нет
client `admissionReceiptId`, `hardCeiling` или `emergencyDisabled`, а backend сам
валидирует current published vector:
[support-routing-activation-service-contract.test.ts:5](../../../Lola_backend/test/support-routing-activation-service-contract.test.ts#L5).

Экспорт OpenAPI из backend snapshot и регенерация frontend SDK обязательны как
интеграционный шаг frontend ticket после слияния P0, но не считаются восьмым
backend-блокером.

## Рекомендуемый порядок реализации

1. **Correctness first:** P0.6 — исправить Policy reader и retry bound, добавить
   regression round-trip.
2. **Typed authoring:** P0.3 — стабилизировать Policy detail/response DTO.
3. **Topology read:** P0.1 — добавить Queue Slot catalog/detail.
4. **Activation preflight:** P0.2 — общий server-owned readiness query и typed
   blocking reasons.
5. **Safe identities:** P0.5 — catalog/batch resolver презентаций операторов.
6. **Investigation:** P0.4 — typed Decision summary/detail и redacted evidence.
7. **Test-run lifecycle:** P0.7 — durable Shadow Run correlation.
8. После P0 — P1 revision history/diff/restore и audit timeline.
9. После стабилизации контрактов frontend экспортирует актуальный OpenAPI,
   регенерирует client и начинает продуктовые экраны.

Пункты 3–6 можно разрабатывать параллельно после фиксации typed Policy schema,
но release должен проходить через единый интеграционный gate.

## Release gate для backend handoff

Backend считается готовым к полной frontend-разработке только если одновременно
выполнено следующее:

### Contract gate

- все семь P0 endpoints/DTO присутствуют в runtime OpenAPI;
- ни один product DTO не использует бесконтрольный `object` там, где UI зависит
  от полей;
- error codes и enum values закрыты и документированы;
- mutation routes сохраняют `Idempotency-Key`, strong `If-Match`, no-store и
  concealed cross-Project behavior.

### Correctness gate

- non-default Policy проходит create → read → publish → restart → read с тем же
  content hash;
- HTTP отклоняет `maxAttempts=6` и принимает 5;
- readiness и activation используют один vector query, а activation повторно
  проверяет pins под transaction;
- Queue Slot reload воспроизводит сохранённый topology;
- overlapping Shadow Runs имеют однозначный terminal result;
- Decision JSON соответствует OpenAPI и не содержит PII.

### Database and security gate

- additive migrations проходят fresh и upgrade PostgreSQL profiles;
- composite tenant keys/FKs и indexes начинаются с `project_id`;
- worker principal получает только необходимые права на новые Shadow Run tables;
- API principal не получает Assignment/Case/IAM DML из-за control-plane reads;
- operator resolver не требует расширения до `project.members.read`;
- privilege regression доказывает отсутствие email/roles/credentials/raw object
  keys в новых responses.

### Integration gate

- backend публикует один зафиксированный OpenAPI artifact/commit для frontend;
- frontend contract smoke выполняет: создать/прочитать Workforce → создать и
  опубликовать Queue → создать и опубликовать Policy → записать и прочитать Slot
  → получить READY → активировать OFFER/AUTO_ASSIGN → прочитать Decision;
- unknown mutation outcome восстанавливается authoritative GET, а не повторным
  незащищённым действием;
- deployment smoke подтверждает readiness routing worker и отсутствие скрытых
  Support rollout flags.

До прохождения этого gate frontend может проектировать IA и компоненты, но не
должен закреплять локальные догадки о readiness, Policy body, candidate evidence
или operator identity как продуктовый контракт.
