# Reporting & Dashboards: аудит backend-контрактов Lola

Дата проверки: 9 августа 2026 года.

Проверенный backend: локальный `/Users/alxxsck/Documents/Lola_backend`, ветка `main`, commit
`9f36796b477d34fcac2a9a46844bbd78863df6e1` (`SP-29 Prove core Support pilot and rollback`).
Backend не изменялся.

Важная оговорка о статусе источников: основной discovery-файл уже tracked, но локально изменён;
all-data audit, implementation spec, delivery map и второй research-файл пока untracked. Поэтому ниже
они считаются актуальным локальным проектным решением, но не доказательством уже поставленного API.
Это совпадает с пометкой самого discovery: production-код не менялся
([строки 1–6](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L1-L6)),
тогда как новая спецификация помечена «готово к декомпозиции и реализации»
([строки 1–11](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L1-L11)).

## Короткий вывод

Backend **архитектурно спроектирован, но Reporting/Dashboard API ещё не реализован**.

Сейчас в коде есть хороший фундамент:

- typed Project Analysis query kernel по Accepted Events и Current Profile Attributes;
- immutable Segment и Segment Revision;
- CMS API для библиотеки сегментов, профилей, Event Catalog и Event Log;
- Project-scoped IAM с active Membership и exact permissions;
- bounded query limits, receipts, current-profile semantics, decimal/currency guards.

Но фронт сегодня не может вызвать first-class `Analytics Query Gateway`, создать `Saved Report`,
`Dashboard`, `Widget`, `Dashboard Revision`, schedule или export. В Prisma нет таких моделей, в
`AppModule` нет Reporting/Dashboard module, в permission catalog нет `project.analytics.*`,
`project.dashboards.*` или `project.reports.*`. Предложенные endpoint paths и payload shapes пока
существуют только в документации.

Практическое следствие: frontend-модуль нужно планировать contract-first и синхронизировать с T1/T2
backend frontier. Нельзя строить production builder на прямой пагинации `event-logs`/`end-users` или
на вызове Segment evaluation по одному пользователю: это обход целевого query seam и не даёт
правильных totals, rollups, history, cache, suppression и receipts.

## 1. Статус по слоям

| Capability                    | Фактический статус      | Что доступно фронту сейчас                                      |
| ----------------------------- | ----------------------- | --------------------------------------------------------------- |
| Reporting semantic catalog    | Только specification    | Нет HTTP endpoint и DTO                                         |
| Analytics Query Gateway       | Только target interface | Внутренний `ProjectAnalysisQueryPort`, не CMS REST              |
| Saved Reports                 | Только domain/spec      | Нет Prisma model/controller/API                                 |
| Dashboards/Widgets/Revisions  | Только domain/spec      | Нет Prisma model/controller/API                                 |
| Schedules/Exports для reports | Только domain/spec      | Есть AI Analysis scheduled-once, но это другой bounded context  |
| Project AI Analysis           | Реализован              | Question-based async CMS API, не dashboard query API            |
| Segments                      | Реализованы             | Search/detail/revisions/publish/archive + evaluate one End User |
| Current Profile               | Реализован              | Detail/list with one typed filter and cursor pagination         |
| Event Catalog                 | Реализован              | Published definitions/schema metadata                           |
| Event Log                     | Реализован              | Raw cursor-paginated operational rows; не aggregate/report API  |

Проверка отсутствия первого слоя воспроизводится командами:

```bash
rg -n '^model (Dashboard|Widget|SavedReport|Analytics|Report)' prisma/schema.prisma
rg -n 'project\.analytics\.|project\.dashboards\.|project\.reports\.' \
  src/modules/iam/authorization/permission-catalog.ts
rg -n 'DashboardModule|ReportingModule|AnalyticsModule' src/app.module.ts
```

Все три поиска в проверенной рабочей копии пусты. `AppModule` подключает
`ProjectAnalysisQueryModule`, но не Reporting/Dashboard module
([imports, строки 37–49](/Users/alxxsck/Documents/Lola_backend/src/app.module.ts#L37-L49),
[module list, строки 97–105](/Users/alxxsck/Documents/Lola_backend/src/app.module.ts#L97-L105)).

## 2. Целевая модель из backend-документации

### 2.1. Граница bounded context

Спецификация задаёт отдельный Reporting & Dashboards context из четырёх внутренних модулей:

1. Analytics Semantics — versioned Dataset, Metric, Dimension, Population, Relationship.
2. Analytics Projection — typed facts, rollups, checkpoints, generations, deletion tombstones.
3. Analytics Query — compile, IAM, cost/admission, cache/coalescing, store route, Result/Receipt.
4. Dashboard — Collections, Saved Reports, Dashboards, Drafts/Revisions, Widgets, schedules,
   exports и sharing; computed chart data здесь не хранится.

Это нормативно описано в solution
([строки 37–61](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L37-L61)).
Dashboard должен обращаться только к Analytics Query Gateway, а не читать EventLog, Profile или
Segment tables напрямую
([строки 225–244](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L225-L244)).

### 2.2. Artifact hierarchy

Целевая иерархия:

```text
Project
  Analytics Space
    Collection / folder
      Saved Report
      Dashboard
        immutable Dashboard Revision
          page / tab
            Widget
              pinned Query Revision
              pinned Chart / Visualization Definition
```

Исходная модель перечислена в discovery
([строки 123–158](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L123-L158)).
Published revision immutable, edit идёт через Draft с optimistic concurrency; Widget ссылается на
query/visualization и не владеет результатом
([строки 424–439](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L424-L439)).

### 2.3. Что в backend означает «группа»

Термин нельзя оставлять одним универсальным `Group`:

- **Segment** — стабильная Project-owned пользовательская группа с immutable published revisions;
- **Population Definition** — аналитическая семантика множества пользователей
  (`PROJECT`, current Segment, current Profile cohort, позже frozen/historical population);
- **groupBy/Dimension** — разбиение результата по времени, Event field, Profile attribute и т. п.;
- **Project Role/Team** — IAM или operational ownership, не аналитическая аудитория;
- **Collection/folder** — навигационная группировка отчётов, которая не выдаёт access.

Фактические Segment models закрепляют stable identity и immutable revisions
([`schema.prisma`, строки 8284–8325](/Users/alxxsck/Documents/Lola_backend/prisma/schema.prisma#L8284-L8325)).
Спецификация отдельно определяет Population, Dimension и Collection
([строки 197–219](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L197-L219)).

### 2.4. Visualization contract и круговые charts

Discovery разрешает Scalar, Series, Category, Table, Funnel, Retention, Distribution, Relationship и
Flow shapes; для Category прямо упомянут `donut`, но только при low cardinality
([строки 550–564](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L550-L564)).
Однако соседний TypeScript sketch `VisualizationSpec.kind` перечисляет `KPI | LINE | BAR |
STACKED_BAR | TABLE | FUNNEL | RETENTION | HISTOGRAM | SCATTER` и **не содержит `PIE` или `DONUT`**
([строки 566–595](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L566-L595)).

Это реальный контрактный разрыв относительно требования о круговых диаграммах. До frontend
implementation нужно либо добавить `DONUT` в versioned server-validated spec с max-category/Other
policy, либо явно исключить его из первой версии. Backend T1/T2 acceptance сейчас гарантирует только
KPI, daily line/stacked series и table, поэтому donut нельзя считать уже согласованным MVP.

## 3. Предложенный Reporting API — пока не runtime contract

Discovery предлагает следующую форму:

```text
GET    /api/v1/projects/:projectId/analytics/catalog
POST   /api/v1/projects/:projectId/analytics/queries/preview
POST   /api/v1/projects/:projectId/analytics/runs
GET    /api/v1/projects/:projectId/analytics/runs/:runId
POST   /api/v1/projects/:projectId/analytics/runs/:runId/cancel

GET    /api/v1/projects/:projectId/dashboards
POST   /api/v1/projects/:projectId/dashboards
GET    /api/v1/projects/:projectId/dashboards/:dashboardId
PATCH  /api/v1/projects/:projectId/dashboards/:dashboardId/draft
POST   /api/v1/projects/:projectId/dashboards/:dashboardId/preview
POST   /api/v1/projects/:projectId/dashboards/:dashboardId/publish
POST   /api/v1/projects/:projectId/dashboards/:dashboardId/archive

POST   /api/v1/projects/:projectId/report-schedules
GET    /api/v1/projects/:projectId/report-runs/:runId
POST   /api/v1/projects/:projectId/exports
GET    /api/v1/projects/:projectId/exports/:artifactId/download
```

Источник: discovery, строки
[802–829](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L802-L829).
Для async работы предлагаются `202`, status URL и realtime только как уведомление о state transition;
authoritative result читается через REST.

У этих маршрутов сейчас нет controllers, DTO/OpenAPI schemas и tests. Кроме того, путь
`/api/v1/projects/...` расходится с уже существующей CMS-конвенцией
`/api/v1/admin/projects/...`: Project AI Analyses, Segments, Profiles, Event Catalog и Event Logs все
живут под `admin/projects`. Это нужно закрыть до фиксации frontend API client.

Спецификация уже фиксирует классы ответов, но не JSON shape:

- authorized catalog + compatibility;
- normalized validation/estimate + warnings/cost envelope;
- sync bounded Result или accepted async Run;
- Result page со schema, rows/series, cursor и Resource Receipt;
- Draft/publication/revision reads;
- schedule/export receipts и run status
  ([строки 510–524](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L510-L524)).

То есть frontend можно проектировать вокруг этих состояний, но нельзя генерировать типы до появления
OpenAPI/runtime contract.

## 4. Реально доступные API и payloads

Ниже paths уже включают global prefix `api/v1`, который устанавливается приложением
([`configure-http-application.ts`, строка 227](/Users/alxxsck/Documents/Lola_backend/src/common/configure-http-application.ts#L227)).

### 4.1. Project AI Analyses: работающий предшественник, но не замена Dashboard API

Controller публикует:

```text
POST /api/v1/admin/projects/:projectId/ai-analyses/estimate
GET  /api/v1/admin/projects/:projectId/ai-analyses
GET  /api/v1/admin/projects/:projectId/ai-analyses/:analysisId
POST /api/v1/admin/projects/:projectId/ai-analyses
POST /api/v1/admin/projects/:projectId/ai-analyses/:analysisId/cancel
```

Методы, required permissions, `Idempotency-Key`, `If-Match` и `202` для create находятся в
[`project-ai-analysis.controller.ts`, строки 49–202](/Users/alxxsck/Documents/Lola_backend/src/modules/project-ai-analyses/api/project-ai-analysis.controller.ts#L49-L202).

Фактический create payload:

```json
{
  "executionMode": "IMMEDIATE",
  "question": "Покажи количество и сумму успешных депозитов по дням и валютам за 30 дней",
  "scopeKind": "PROJECT"
}
```

Для `SCHEDULED_ONCE` добавляется:

```json
{
  "executionMode": "SCHEDULED_ONCE",
  "question": "Покажи депозиты за вчера",
  "scopeKind": "PROJECT",
  "schedule": {
    "localDateTime": "2026-08-10T09:15:00",
    "timezone": "Europe/Madrid",
    "dstDisambiguation": "EARLIER"
  }
}
```

DTO разрешает question до 10 000 символов, scope `PROJECT | END_USER | COHORT`, optional
`endUserId`, schedule и high-cost confirmation token
([строки 125–202](/Users/alxxsck/Documents/Lola_backend/src/modules/project-ai-analyses/api/dto/project-ai-analysis.dto.ts#L125-L202)).
Accepted response — `{analysisId, runId, status, version, scheduledAt?}`
([строки 221–240](/Users/alxxsck/Documents/Lola_backend/src/modules/project-ai-analyses/api/dto/project-ai-analysis.dto.ts#L221-L240)).

Это question-based AI workflow. Detail response содержит generic `result: object | null`, runs,
model attempts, budget data и query receipts, а не стабильный chart/series schema
([строки 449–559](/Users/alxxsck/Documents/Lola_backend/src/modules/project-ai-analyses/api/dto/project-ai-analysis.dto.ts#L449-L559)).
Поэтому его нельзя использовать как контракт production Dashboard widgets.
Наличие controller также не доказывает, что capability включена в конкретном окружении:
`.env.example` по умолчанию выключает `PROJECT_AI_ANALYSIS_EXECUTION_ENABLED` и scheduler
([строки 455–466](/Users/alxxsck/Documents/Lola_backend/.env.example#L455-L466)).

### 4.2. Внутренний Project Analysis Query kernel

`ProjectAnalysisQueryModule` регистрирует только providers и экспортирует internal
`ProjectAnalysisQueryPort`; controller отсутствует
([строки 1–27](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/project-analysis-query.module.ts#L1-L27)).
Port умеет pin current catalog, search catalog и execute typed query
([строки 13–40](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/public/project-analysis-query.port.ts#L13-L40)).

Даже этот internal kernel по умолчанию fail-closed: master/query, catalog, SQL и profile backfill
flags выставлены в `false`, а пустой allowlist не разрешает ни один Project
([`.env.example`, строки 455–466](/Users/alxxsck/Documents/Lola_backend/.env.example#L455-L466)).
Policy требует одновременно включённые master/feature flags и explicit Project allowlist (либо
осознанный `*`), иначе возвращает stable disabled/not-allowed error
([`project-analysis-feature.policy.ts`, строки 17–77](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/policy/project-analysis-feature.policy.ts#L17-L77)).

Фактическая typed query shape:

```ts
{
  subject: Project | PinnedEndUser | CurrentProfileCohort,
  events: [{ eventCode }],
  timeRange: preset | { from, to },
  metrics: [EventCount | DistinctEndUsers | SumAvgMinMax],
  eventFilters?,
  groupBy?: [TimeBucket | EventField | UserAttribute],
  orderBy?,
  limit?
}
```

Полный type contract находится в
[`project-analysis-query.ts`, строки 25–76](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/domain/project-analysis-query.ts#L25-L76).

Рабочий payload из теста:

```json
{
  "subject": {
    "kind": "COHORT",
    "semantics": "CURRENT_AS_OF_RUN",
    "filters": [
      {
        "attributeCode": "display_name",
        "operator": "PREFIX",
        "value": "Максим"
      }
    ]
  },
  "events": [{ "eventCode": "deposit.completed" }],
  "timeRange": { "preset": "YESTERDAY_PROJECT_TIME" },
  "metrics": [
    { "op": "EVENT_COUNT", "as": "deposit_events" },
    { "op": "DISTINCT_END_USERS", "as": "depositors" },
    { "op": "SUM", "fieldCode": "amount", "as": "amount" }
  ],
  "groupBy": [
    { "kind": "EVENT_FIELD", "fieldCode": "currency", "as": "currency" }
  ],
  "orderBy": [{ "metric": "amount", "direction": "DESC" }],
  "limit": 50
}
```

Источник — executable unit fixture
([`project-analysis-query.test.ts`, строки 135–159](/Users/alxxsck/Documents/Lola_backend/test/project-analysis-query.test.ts#L135-L159)).
Обратите внимание: пример в старой query spec пропускает обязательный `as` у `groupBy`
([строки 78–105](/Users/alxxsck/Documents/Lola_backend/docs/specs/project-ai-analyses/02-query-capability.ru.md#L78-L105));
runtime type и тест требуют его. Для frontend-контрактов source DTO/OpenAPI должен быть сильнее prose
example.

Текущие hard limits:

- 5 Event codes;
- 8 metrics;
- 8 filters;
- 3 dimensions;
- 31 день interactive или 366 дней high-cost confirmed;
- 5 000 raw source rows;
- 200 result groups;
- 256 KiB serialized result;
- 5 секунд statement timeout;
- 6 query calls/run, 4 model rounds/run, 2 concurrent runs/CMS User.

Источник: [`project-analysis-catalog.ts`, строки 9–31](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/domain/project-analysis-catalog.ts#L9-L31).
Result возвращает decimal metrics как strings, rows, completeness/truncation/limitations и подробный
receipt/provenance
([`project-analysis-query.ts`, строки 174–230](/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/domain/project-analysis-query.ts#L174-L230)).

### 4.3. Segments

Рабочие CMS endpoints:

```text
GET  /api/v1/admin/projects/:projectId/scenario-authoring/segments
GET  /api/v1/admin/projects/:projectId/scenario-authoring/segments/:segmentId
GET  /api/v1/admin/projects/:projectId/scenario-authoring/segments/:segmentId/revisions/:revisionId
POST /api/v1/admin/projects/:projectId/scenario-authoring/segments
POST /api/v1/admin/projects/:projectId/scenario-authoring/segments/:segmentId/revisions
POST /api/v1/admin/projects/:projectId/scenario-authoring/segments/:segmentId/archive
POST /api/v1/admin/projects/:projectId/scenario-authoring/audience/evaluate-user
```

Controller и permissions: [`scenario-audience.controller.ts`, строки
61–180](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-audience/scenario-audience.controller.ts#L61-L180).

Publish request V2:

```json
{
  "key": "vip_es",
  "name": "VIP из Испании",
  "description": "Текущая VIP-аудитория в ES",
  "rule": {
    "version": 2,
    "freshness": { "mode": "REQUIRE_FRESH", "maxAgeSeconds": 86400 },
    "root": {
      "kind": "all",
      "children": [
        {
          "kind": "profileAttribute",
          "definitionId": "00000000-0000-4000-8000-000000000001",
          "operator": "eq",
          "value": "vip"
        },
        {
          "kind": "profileAttribute",
          "definitionId": "00000000-0000-4000-8000-000000000002",
          "operator": "eq",
          "value": "ES"
        }
      ]
    }
  },
  "catalogRevision": "<opaque revision>",
  "expectedCurrentRevisionId": null
}
```

Обязательные поля и OCC token описаны в DTO
([строки 376–434](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-audience/dto/scenario-audience.dto.ts#L376-L434)).
Search поддерживает `query`, `limit <= 100`, cursor и `includeArchived`; response — `items` и
`nextCursor`
([строки 452–476](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-audience/dto/scenario-audience.dto.ts#L452-L476),
[response строки 224–267](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-audience/dto/scenario-audience-response.dto.ts#L224-L267)).

Ограничение для отчётов: сегмент хранит правило, а не membership list; его результат меняется вместе
с current profile
([смысл сегмента, строки 1–12](/Users/alxxsck/Documents/Lola_backend/docs/cms-segments-guide.ru.md#L1-L12),
[источник данных, строки 108–122](/Users/alxxsck/Documents/Lola_backend/docs/cms-segments-guide.ru.md#L108-L122)).
Публичный evaluator проверяет только одного `endUserId`. Endpoint «count members», population page,
frozen membership snapshot и membership history отсутствуют; пользовательская документация говорит
об этом прямо
([строки 324–336](/Users/alxxsck/Documents/Lola_backend/docs/cms-segments-guide.ru.md#L324-L336)).
All-data audit относит current,
frozen и historical Segment populations к разным будущим проекциям
([строки 133–141](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md#L133-L141)).

### 4.4. Current Profiles

Рабочие CMS endpoints:

```text
GET /api/v1/admin/projects/:projectId/end-users
GET /api/v1/admin/projects/:projectId/end-users/:endUserId/profile
GET /api/v1/admin/projects/:projectId/end-users/:endUserId/profile-sync-history
```

Они требуют `project.profiles.read`; restricted fields дополнительно проверяют
`project.profiles.restricted.read`
([`profile-runtime.controller.ts`, строки 207–282](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-profile/integration/profile-runtime.controller.ts#L207-L282)).

List query поддерживает:

- `limit <= 100`, cursor;
- до 10 selected Attribute definition IDs;
- только один `filterDefinitionId` + `filterValue` + `EQ|LT|LTE|GT|GTE`;
- last-seen или один RANGE_SORT attribute sort;
- AI-suspension filter.

Контракт: [`profile-runtime.dto.ts`, строки
181–250](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-profile/dto/profile-runtime.dto.ts#L181-L250).
Response — cursor page, без total/count; каждое поле содержит definition revision, classification,
access, availability, observedAt/age и optional value
([field response, строки 90–150](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-profile/dto/profile-runtime.dto.ts#L90-L150),
[page response, строки 261–282](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-profile/dto/profile-runtime.dto.ts#L261-L282)).

Ограничение для аналитики: это current state, не исторический профиль. Backend-документация намеренно
разделяет текущий profile и Event history
([`cms-user-profile-fields-guide.ru.md`, строки 18–36](/Users/alxxsck/Documents/Lola_backend/docs/cms-user-profile-fields-guide.ru.md#L18-L36)).
Existing `ProjectAnalysisAttributeValue` — typed rebuildable projection current scalar values
([`schema.prisma`, строки 8007–8034](/Users/alxxsck/Documents/Lola_backend/prisma/schema.prisma#L8007-L8034)),
но он не создаёт исторические intervals и не доступен фронту как самостоятельный API.

### 4.5. Events и Event Catalog

Рабочие CMS reads:

```text
GET /api/v1/admin/projects/:projectId/event-catalog/event-definitions
GET /api/v1/admin/projects/:projectId/event-logs
GET /api/v1/admin/projects/:projectId/event-logs/:eventId
```

Event Catalog read требует `project.event_catalog.read` и отдаёт stable definition key, code/name,
lifecycle, ingestion policy и current immutable schema revision
([`event-catalog.controller.ts`, строки 81–110](/Users/alxxsck/Documents/Lola_backend/src/modules/event-catalog/event-catalog.controller.ts#L81-L110),
[`event-catalog-response.dto.ts`, строки 282–326](/Users/alxxsck/Documents/Lola_backend/src/modules/event-catalog/dto/event-catalog-response.dto.ts#L282-L326)).

Event Log list требует `project.event_logs.read`, поддерживает repeated filters по eventCode/source/
status, externalUserId, occurred/received ranges и cursor
([`events.controller.ts`, строки 95–166](/Users/alxxsck/Documents/Lola_backend/src/modules/events/events.controller.ts#L95-L166),
[`event.dto.ts`, строки 102–198](/Users/alxxsck/Documents/Lola_backend/src/modules/events/dto/event.dto.ts#L102-L198)).
Response page содержит raw Event rows с payload/context/message, occurredAt/receivedAt/status,
definition и End User refs
([`event-response.dto.ts`, строки 41–77](/Users/alxxsck/Documents/Lola_backend/src/modules/events/dto/event-response.dto.ts#L41-L77)).

Это operational inspector API, не aggregate source для widgets. `EventLog` действительно имеет
Project/time/definition/user indexes
([`schema.prisma`, строки 7662–7709](/Users/alxxsck/Documents/Lola_backend/prisma/schema.prisma#L7662-L7709)),
но target architecture запрещает Dashboard direct reads и требует Accepted Event consumer → typed
fact → shared rollup. Default raw Event retention — 90 дней
([`.env.example`, строка 102](/Users/alxxsck/Documents/Lola_backend/.env.example#L102)), поэтому
366-day Dashboard нельзя обещать поверх Event Log pagination.

## 5. Auth, roles и permissions

### 5.1. Фактическая IAM-модель

CMS endpoints используют `IamHttpExecutionGuard` и route metadata с точным permission/scope. Guard
аутентифицирует token, извлекает Project target и запрашивает authorization decision
([`iam-http-execution.guard.ts`, строки 48–143](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/http/iam-http-execution.guard.ts#L48-L143)).
Project grants берутся только из active Membership, active Project, active Roles и active PROJECT
permissions
([`iam-authorization.service.ts`, строки 410–446](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/authorization/iam-authorization.service.ts#L410-L446)).

Роли не должны становиться hard-coded frontend authorization. Backend хранит Project Roles,
many-to-many Membership Role assignments и exact role permissions
([`schema.prisma`, строки 2230–2310](/Users/alxxsck/Documents/Lola_backend/prisma/schema.prisma#L2230-L2310)).
Фронт должен использовать effective permissions из session/project context, а не проверку названия
роли. Уже существующий `GET /api/v1/auth/me` отдаёт по каждому Project `roleKeys` и
`effectivePermissionCodes`
([controller, строки 12–34](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/session-context/cms-session-context.controller.ts#L12-L34),
[DTO, строки 25–64](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/session-context/cms-session-context.dto.ts#L25-L64)).

### 5.2. Реальные permission codes источников

В текущем catalog есть:

```text
project.profiles.read
project.profiles.restricted.read
project.segments.read
project.segments.write
project.event_catalog.read
project.event_catalog.write
project.event_catalog.publish
project.event_logs.read
project.ai_analyses.run
project.ai_analyses.schedule
project.ai_analyses.read
project.ai_analyses.manage
```

Source anchors:
[`permission-catalog.ts`, строки 40–58](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L40-L58)
и [145–190](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L145-L190).
AI Analysis permissions имеют HIGH risk и отдельные русские labels/descriptions
([строки 757–797](/Users/alxxsck/Documents/Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L757-L797)).

### 5.3. Предложенные Reporting permissions — ещё не существуют

Discovery предлагает:

```text
project.analytics.read
project.analytics.query.execute
project.analytics.raw_rows.read
project.analytics.sensitive_dimensions.read
project.dashboards.create
project.dashboards.edit_own
project.dashboards.edit_any
project.dashboards.publish
project.dashboards.share
project.reports.schedule
project.reports.export
project.analytics.manage_semantics
project.analytics.manage_retention
```

Источник: [discovery, строки 691–712](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L691-L712).
Их нет в фактическом permission catalog/migrations. Также ещё не утверждён список managed/custom roles,
которые смогут публиковать Official Metrics и выполнять restricted drilldown/export; delivery map
явно оставляет это Project configuration approval
([строки 87–95](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-delivery-map.ru.md#L87-L95)).

Для MVP frontend route visibility и button states должны ждать эти новые effective permission codes.
Нельзя временно трактовать `project.event_logs.read`, `project.profiles.read` или
`project.ai_analyses.run` как implicit Dashboard authority: target security design требует отдельный
analytics consumer/audience policy и повторную authorization каждого query/result/export
([discovery, строки 714–723](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md#L714-L723)).

## 6. Источники данных и их готовность для MVP

| Источник            | Что уже реально есть                                                                      | Что готово для Reporting                                                                    | Что блокирует полный Dashboard use                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Accepted Events     | immutable EventLog, stable definition/revision, occurred/received time, acceptance outbox | лучший первый source; current kernel умеет count/distinct/sum/avg/min/max, filters, buckets | нет Reporting source binding, typed facts/rollups, cache/coalescing и public Gateway                    |
| Current Profile     | versioned attribute contract, current typed projection, classification/freshness          | current cohort/filter/grouping с явным `CURRENT_AS_OF_*`                                    | нет historical intervals; sensitive dimensions и small-group policy не оформлены как Reporting contract |
| Segment definitions | stable Segment + immutable revisions + current rule evaluation                            | catalog dependency и explicit current population candidate                                  | нет bulk count/page, frozen snapshot и membership history                                               |
| Event Catalog       | stable codes/schema revisions/policies                                                    | source authoring metadata                                                                   | нет Reporting-specific allowed Metric/Dimension publication UI/API                                      |
| Raw Event Log       | indexed cursor read, default 90-day retention                                             | forensic/detail source behind owner adapter only                                            | не годится для прямых frontend aggregates/годовых charts                                                |

All-data audit считает наиболее готовыми Wave 1 источниками Accepted Events и Current Profile
Attributes; historical Profile/Segment populations оставляет на Wave 3
([строки 646–683](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md#L646-L683)).

### Историческая корректность

Backend различает минимум четыре режима:

```text
CURRENT_AS_OF_QUERY
CURRENT_AS_OF_RUN_SNAPSHOT
EFFECTIVE_AT_FACT_TIME
FROZEN_POPULATION_AT_RUN
```

`EFFECTIVE_AT_FACT_TIME` допустим только при temporal history; current Profile/Segment нельзя
показывать как историческую dimension
([all-data audit, строки 344–380](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md#L344-L380)).
Для MVP это означает: Segment/Profile filter на chart за прошлый месяц должен явно означать
«текущая аудитория, применённая сейчас» либо быть запрещён; UI не может молча подписать его
«пользователи, входившие в сегмент тогда».

### Privacy и малые группы

Aggregate read не автоматически разрешает grouping или raw rows. Target platform разделяет
`AGGREGATE_SAFE`, `PROJECT_RESTRICTED`, `SUBJECT_RESTRICTED`, `CONTENT_HIGH_RISK`
([all-data audit, строки 59–103](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md#L59-L103)).
Нужны minimum population threshold, suppression/Other, защита от subtraction, отдельный threshold для
sensitive dimensions и отдельная permission для exact member list
([строки 408–417](/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md#L408-L417)).

## 7. Что уже решено для первого MVP tracer

Первый end-to-end backend tracer — успешные deposits:

```text
metrics:    deposit_count, distinct_depositors, gross_deposit_amount
dimensions: project_day, currency
views:      KPI, daily series/stack, cursor-paginated detail table
range:      до 366 дней через daily rollup + bounded hot delta
```

Он должен быть generic Event-backed Source Binding/configuration, а не специальная branch по deposit
([spec, строки 487–508](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L487-L508)).
После T1 `Saved Report` T2 строит versioned Dashboard/Widgets; T3 добавляет Scenario source и current
Profile/Segment populations
([delivery map, строки 108–215](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-delivery-map.ru.md#L108-L215)).

Backend frontier уже сформулирован как:

```text
T1 Deposit Saved Report
├── T2 Versioned Dashboard ──┐
├── T3 Second owner source   ├── T5 Production scale/privacy/store gate
└── T4 Secure delivery ──────┘
    (T4 also waits for T2)
```

Источник: [delivery map, строки 278–289](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-delivery-map.ru.md#L278-L289).

## 8. Нерешённые вопросы и frontend blockers

### Контрактные blockers до реализации frontend data layer

1. **Canonical base path:** `/api/v1/projects/...` из discovery или существующая CMS-конвенция
   `/api/v1/admin/projects/...`.
2. **OpenAPI schemas:** catalog, query draft/preview, estimate, run/status/result, receipt, cursor,
   Dashboard Draft/Revision/Widget/Chart, stable error envelope.
3. **Sync/async threshold:** какие plans возвращают immediate result, какие всегда `202`; polling и
   realtime event schema.
4. **Result shape:** column/schema types, decimal serialization, time buckets, nulls, series, totals,
   pagination, exact/approximate metadata.
5. **Draft concurrency:** exact `If-Match`/version/idempotency headers and conflict payload.
6. **Permissions:** final codes, managed-role defaults, own/any semantics, Official publish, sensitive
   dimensions/raw rows/export.
7. **Segment population contract:** current count, frozen snapshot, member drilldown, historical
   membership и suppression semantics.
8. **Source readiness:** catalog status/reason shape для `NOT_ANALYTICS_READY`/
   `SOURCE_PROJECTION_NOT_READY`.
9. **Donut/pie:** category shape упомянут, но отсутствует в `VisualizationSpec.kind` и в T1/T2
   acceptance; нужен единый enum и cardinality/`Other` policy.

### Project-specific approvals

Архитектура уже зафиксирована, но deposit нельзя включить без mapping:

- stable successful Event/revision range;
- amount/currency fields и exact decimal rules;
- deposit identity/deduplication;
- success/correction/reversal/refund semantics;
- subject identity;
- business time, Project timezone/day boundary;
- late-arrival window;
- FX policy либо явное отсутствие cross-currency total.

Эти открытые настройки перечислены в спецификации
([deposit mapping, строки 487–504](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L487-L504),
[Further Notes, строки 612–618](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L612-L618)).

### Нельзя делать во frontend как временный shortcut

- full-scan всех pages `event-logs` и client-side aggregate;
- full-scan `end-users` для Segment count;
- скрытое смешивание current Profile/Segment с historical chart;
- arbitrary JSON path или SQL builder;
- объединение валют в один amount без FX Metric;
- hard-coded access по role name;
- показ cached result без current re-authorization;
- один eager request на каждый Widget при открытии Dashboard.

Эти запреты следуют из product principles
([spec, строки 63–76](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L63-L76))
и Dashboard lifecycle/loading contract
([строки 424–449](/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md#L424-L449)).

## 9. Рекомендация для frontend planning

Планировать frontend двумя последовательными контрактными слоями:

1. **Saved Report vertical slice, зависимый от backend T1:** navigation placeholder/capability gate,
   semantic catalog browser, typed query builder, estimate/apply, run state, KPI/series/table result,
   receipt/freshness/limitations и cursor table. До готовности OpenAPI — только fixture adapter, явно
   не считающийся production integration.
2. **Dashboard authoring/viewing, зависимый от backend T2:** catalog/collections, Draft/OCC/publish,
   pages/tabs/layout, Widget refs, staged viewport loading, compatible global filters, per-widget
   loading/stale/partial/suppressed/forbidden/error states.

Segments/Profile UI можно переиспользовать для выбора definitions и pinned revisions, но не как
runtime data engine. Существующий Project Analysis query JSON полезен как доказанный vocabulary для
Event/Profile measures и dimensions; публичный frontend contract всё равно должен появиться через
новый Analytics Query Gateway.

## 10. Основные source anchors

- Target spec:
  `/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md:37-61,197-244,396-524`.
- Delivery map:
  `/Users/alxxsck/Documents/Lola_backend/docs/specs/reporting-and-dashboards-delivery-map.ru.md:87-95,108-289`.
- Proposed API:
  `/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md:691-829`.
- All-data source/security audit:
  `/Users/alxxsck/Documents/Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md:59-176,344-424,646-683`.
- Internal query contract:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/domain/project-analysis-query.ts:25-230`.
- Query limits:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/project-analysis-query/domain/project-analysis-catalog.ts:9-31`.
- IAM catalog:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/iam/authorization/permission-catalog.ts:40-190`.
- Segment API:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-audience/scenario-audience.controller.ts:61-180`.
- Profile API:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-profile/integration/profile-runtime.controller.ts:207-282`.
- Event APIs:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/events/events.controller.ts:95-166` and
  `/Users/alxxsck/Documents/Lola_backend/src/modules/event-catalog/event-catalog.controller.ts:81-110`.
