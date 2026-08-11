# 33 — Реализовать оценку качества и аналитику поддержки

**What to build:** единый production-раздел Support Quality и Analytics: versioned QA workflow,
оперативное состояние поддержки, исторические показатели, безопасная детализация, сохранённые
отчёты, Dashboard, выгрузки и управляемое обновление данных.

**Status:** frontend specification complete; blocked-by-published-backend-contracts

**Не делить на отдельные A/B tickets.** Backend-блокеры закрываются до начала production frontend
implementation, после чего Ticket 33 выполняется целиком.

**Исследование и UI-основание:**
[Support Quality и аналитика поддержки: primary-source research](../../../docs/research/support-quality-analytics-ticket-33-primary-sources-2026-08-11.ru.md).

## Решение

Ticket 33 создаёт две связанные поверхности под одной группой `Поддержка`:

1. **Качество** — очередь проверок, сама проверка, оценочные листы, feedback, disputes и
   calibration.
2. **Аналитика** — состояние сейчас, поток и SLA, качество и клиентский результат, команда и
   capacity, автоматизация и расходы, Saved Reports и Dashboards.

Это один пользовательский контур, но разные permissions и источники данных. Доступ к Dashboard не
даёт права читать QA evidence; доступ к собственной проверке не даёт Project analytics.

## Ограничения продукта

- Никаких feature flags, rollout controls, Project allowlists или новых `VITE_*`/runtime env.
- Никакой второй legacy analytics surface и обратной совместимости с браузерными расчётами.
- Frontend не читает domain owner tables и не рассчитывает employee/Team/Project metrics из
  загруженных Cases, Conversations или Messages.
- Reporting & Dashboards context владеет Query/Result/Receipt и analytical artifacts, но не
  исходными Support facts.
- Support, SLA, Assignment, Quality, Delivery, AI, External Work и другие owners публикуют только
  committed, versioned, content-free facts/adapters.
- Realtime transport сообщает о новой generation, но не становится источником аналитической истины.
- Transcript, internal note, prompt, rationale, signed URL, credentials и arbitrary profile fields
  не попадают в aggregate result, telemetry, route или export.
- Correlation/association никогда не называется причинностью.
- Показатели сотрудников не превращаются в публичную турнирную таблицу и не используются без
  coverage/context для автоматического дисциплинарного решения.

## Пользователи и главные вопросы

### Оператор

- Какие submitted reviews относятся ко мне?
- Что именно было оценено и по какой revision оценочного листа?
- Где evidence и понятный feedback без раскрытия чужих данных?
- Могу ли я задать вопрос или открыть спор?
- Как выглядят мои показатели только в пределах разрешённой и достаточной выборки?

### Проверяющий качество

- Какие проверки назначены, просрочены или требуют повторной работы?
- Почему Case попал в выборку и какой sampling policy применён?
- Какая scorecard revision действует для этого Case/channel/language/team?
- Все ли обязательные критерии заполнены и evidence закреплено?
- Не вижу ли я чужую review до отправки calibration review?

### Руководитель смены

- Что требует вмешательства сейчас?
- Растёт ли backlog быстрее, чем команда его закрывает?
- Где нарушается SLA и какой owner reason объясняет нарушение?
- Улучшается ли результат клиента, а не только скорость ответа?
- Где падает качество, coverage или agreement reviewers?
- Хватает ли capacity по Team/queue/hour/language/skill?
- Что дают Lola, Macros, Knowledge и automation, сколько это стоит и где создаёт риск?

### Руководитель поддержки / владелец качества

- Какие определения и revisions стоят за цифрой?
- Данные полные, свежие и сопоставимые?
- Можно ли безопасно открыть detail, выгрузить или поделиться отчётом?
- Где наблюдается системная причина, а где маленькая/смещённая выборка?

## Разделы и маршруты

```text
Поддержка
  Качество
    /support/quality                         Очередь и сводка
    /support/quality/reviews/:reviewId       Проверка / feedback / dispute
    /support/quality/scorecards              Оценочные листы
    /support/quality/calibrations             Калибровки
    /support/quality/disputes                 Споры
  Аналитика
    /support/analytics                        Сейчас
    /support/analytics/flow                   Поток и SLA
    /support/analytics/quality                Качество и клиенты
    /support/analytics/team                   Команда и нагрузка
    /support/analytics/automation             Автоматизация и расходы
    /support/analytics/reports/:reportId      Saved Report
    /support/analytics/dashboards/:dashboardId Dashboard
```

Route query хранит только валидированные presentation filters: period, comparison, Team, queue,
channel, category, language и safe selected artifact identity. Cursor, result payload, capability,
receipt и bearer values в URL не попадают.

Mobile использует route stack `список → результат → detail`, сохраняет filters и поддерживает
browser Back/Forward. Прямой deep link всегда повторно читает authoritative object.

## Как проходит проверка качества

### Очередь проверок

- Server-owned очередь со stable cursor, состояниями `Назначено`, `В работе`, `Просрочено`,
  `Отправлено`, `На споре`, `Закрыто`.
- Источники selection: manual Case review, bounded random sample, risk/SLA/CSAT/AI/safety signal,
  calibration session. Причина selection видна reviewer, но не раскрывает hidden facts.
- Sampling policy versioned; snapshot хранит population, time window, exclusions и selection reason.
- Assignment/reassignment/due date принадлежат серверу и имеют OCC/audit.
- Reviewer видит только разрешённые tasks. Hidden count/facet не раскрывается.

### Оценочный лист

- Stable scorecard identity и immutable published revisions.
- Section/category/item hierarchy.
- Item label, plain-language guidance, rating scale, weight, critical-failure flag, applicability и
  разрешённое `Не применяется`.
- Conditional items компилируются сервером; frontend не исполняет произвольные expressions.
- Score calculation, normalization и critical-failure outcome принадлежат серверу.
- Draft заменяется атомарно с `If-Match` и stable `Idempotency-Key`.
- Submit невозможен при missing required item/evidence и возвращает exact field errors.
- Новая scorecard revision не переписывает старые reviews.

### Доказательства и обратная связь

- Evidence ссылается на pinned message content/revision, Case/Conversation и reviewer authority.
- Review snapshot не подмешивает текущий mutable message, profile или internal note.
- Evidence excerpt читается отдельной защищённой операцией; aggregate/list не содержит content.
- Reviewer оставляет criterion feedback, summary, root cause и coaching theme из bounded catalog.
- Operator видит только submitted review и разрешённый feedback.
- Operator может подтвердить ознакомление, ответить или открыть dispute; submit/acknowledge/dispute
  имеют immutable audit.

### Споры

- Open, reviewer response, resolved, dismissed и withdrawn — versioned server states.
- Dispute не изменяет исходную submitted review; correction создаёт отдельную superseding revision
  или documented resolution.
- У спора есть owner, due date, reason/outcome и safe timeline.
- Revoke немедленно очищает review/evidence/dispute DOM и controller state.

### Калибровка

- Несколько reviewers независимо оценивают один pinned Case snapshot.
- До своей отправки reviewer не видит peer scores, если server visibility policy не разрешает иное.
- Calibration scores не входят в operator quality metrics.
- Result показывает baseline/consensus, absolute/normalized variance, agreement by item и reviewer
  drift только при достаточном sample.
- Close session — audited versioned command; late/stale review не меняет closed result.

## Аналитические разделы

Полный catalog target и определения находятся в research. На Dashboard не нужно выводить всё сразу:
каждая page отвечает на одну группу вопросов и содержит не больше 8–12 initially visible Widgets.

### Сейчас

- ожидают первого ответа;
- открытые, неназначенные, в работе, waiting user/system, snoozed;
- at-risk/breached SLA и самое старое ожидание;
- active/away/offline operators и available/used capacity;
- routing offers и assignment pressure;
- delivery/realtime/projection health.

Главный блок — не ряд равных KPI cards, а `Support health spine`:
`Поступило → Назначено → Отвечено → Решено → Не вернулось → Проверено`.
Каждый stage имеет собственное определение и denominator.

### Поток и SLA

- created/reopened/resolved/closed и net backlog change;
- backlog age distribution;
- volume by time/channel/category/priority/language/Team/queue;
- time to assignment, first/next response, first/full resolution, active handling;
- waiting user/system/snoozed duration;
- p50/p75/p90/p95;
- SLA applied/hit/missed, hit/miss rate, at-risk и time-to-breach;
- business/calendar time как отдельные Metric Definitions;
- breach reason/policy/rule breakdown.

### Качество и клиенты

- submitted reviews и evaluated coverage;
- overall score distribution и scorecard item/category trends;
- critical failure rate и root causes;
- dispute rate/outcome/time и calibration agreement;
- CSAT/CES вместе с survey response coverage;
- first-contact resolution, reopen и recontact 24/48/72h;
- same-category/topic recontact при достаточном classification coverage;
- abandonment, escalation и complaint outcomes;
- human и AI agent populations не смешиваются.

### Команда и нагрузка

- open/assigned/idle/snoozed work by Team/operator;
- available/used capacity и time-at-capacity;
- assignment, acceptance, reassignment, transfer и handoff;
- availability duration by state;
- schedule adherence/occupancy только при опубликованном owner contract;
- skill/language eligibility exclusions и routing fallback reasons;
- hourly coverage и server forecast confidence.

Individual detail всегда показывает coverage, role/Team context и definition. Малые выборки
подавляются. По умолчанию сортировка идёт по operational need/risk, а не «лучший/худший сотрудник».

### Автоматизация и расходы

- Lola/AI involvement, containment, confirmed/assumed resolution и human handoff;
- correction/override, safety escalation и failed/unknown outcomes;
- classification/escalation quality по pinned evaluation/release;
- latency p50/p95 и cost per Case/resolved Case/accepted reply;
- provider/model/release/channel/language breakdown;
- suggestion shown/accepted/edited/ignored;
- Macro applied/edited/cancelled;
- Knowledge search/zero-result/opened/applied/helpfulness;
- External Work created/linked/pending/unknown/recovered и sync failures;
- reply accepted/delivered/read и delivery lag.

Сравнение automation-assisted и unassisted cohorts показывает selection-bias warning и не заявляет
causal impact без approved experiment/relationship definition.

## Контракт показателя

Каждый Metric Definition обязан содержать:

- stable `metricCode`, русское title/description и owner;
- immutable `definitionRevisionId` и effective interval;
- numerator, denominator, population и time anchor;
- timezone, Project Business Calendar и window boundary semantics;
- unit/value kind и aggregation temporality;
- percentiles/distribution policy;
- compatible Dimensions, filters, comparison и drilldown;
- exact/approximate status, uncertainty и error policy;
- `computedAt`, `dataThrough`, freshness tier и expected lag;
- coverage, exclusions, late/correction handling и retention;
- zero/no-data/not-applicable/suppressed distinction;
- minimum sample, small-cell suppression и privacy classification;
- exact permissions для result/drilldown/export/share/authoring;
- source revisions и Resource Receipt fields.

Metric Catalog доступен из info popover и отдельной definition drawer. Пользователь всегда может
ответить: «Что считается? За какой период? По какое время есть данные? Что исключено?»

## Фильтры, сравнение и выборки

- Global period, comparison, Team, queue, channel, language, category, priority и scorecard/release
  revision применяются только к compatible Widgets.
- Expensive changes staged через `Применить`; ввод текста не запускает cold query.
- Current assignee и assignee-at-action — разные Dimensions.
- Created-at, replied-at, resolved-at и action-at — разные time anchors.
- Business hours и 24/7 — разные definitions, а не presentation toggle поверх одного числа.
- Comparison использует сопоставимый period/population/definition revision; иначе возвращает
  `Нельзя сравнить` с причиной.
- Selected cohort всегда виден в sticky filter bar и Resource Receipt.
- Current Profile/Segment нельзя выдавать за historical cohort без owner historical facts.

## Безопасная детализация

- Клик по point/bar/cell формирует server-owned Drilldown Definition, а не client filter по already
  loaded rows.
- Drilldown повторно проверяет Membership, Permission, field classification, minimum sample и result
  generation.
- Breadcrumb показывает цепочку `Metric → Dimension value → Cases/Reviews` и позволяет сбросить
  каждый уровень.
- Возвращаются safe identity, occurredAt, state/reason и capability; content читается только через
  существующий Case/Conversation route и его permissions.
- `403/404` concealed, не оставляют hidden count, title или stale rows.
- Cursor opaque, server order authoritative, browser не merge/sort pages.

## Обновление данных и realtime

### Источник истины

```text
Committed owner facts
  → Support analytics projection / rollups
  → published generation
  → realtime invalidation
  → authoritative REST Query Result + Resource Receipt
```

Realtime payload содержит только `projectId`, `datasetCode`, `generation`, `updatedAt` и safe
freshness class. Никаких metric values, Case/End User IDs или content.

### Поведение интерфейса

- Toolbar всегда показывает `Данные по <время>` и freshness state.
- После новой generation появляется `Есть новые данные · Обновить`.
- Нажатие сохраняет route filters, comparison, scroll и selected chart point, если result совместим.
- Первое чтение показывает geometry-matched skeleton.
- Повторное чтение сохраняет старый snapshot, отмечает его как updating и не очищает весь экран.
- Оперативный раздел может включить `Обновлять автоматически`; bounded interval задаёт серверный
  freshness tier. Hidden tab/offline/revoke останавливают refresh.
- Исторические reports по умолчанию обновляются вручную или после finished Query Run.
- Realtime events coalesce по Dataset/generation; burst не создаёт N одинаковых HTTP queries.
- WebSocket/SSE reconnect не считается изменением данных и сам по себе не запускает mutation.
- Stale snapshot может остаться видимым только с явной маркировкой; forbidden result purged.
- Screen reader получает одно краткое announcement, focus/tooltip не сбрасываются автоматически.

## Сохранённые отчёты, панели, выгрузка и общий доступ

- Использовать общий Reporting & Dashboards context и язык `Saved Report`, `Dashboard`, `Widget`,
  `Query Definition`, `Query Run`, `Query Result`, `Resource Receipt` из `CONTEXT.md`.
- Support Dashboard — curated Project artifact, а не специальная система расчёта.
- Saved Report имеет Draft, immutable published Revision и canonical URL.
- Dashboard Revision pin-ит Saved Report/Query/Chart revisions; Widget не хранит computed values.
- Shell загружается первым, затем bounded visible Widgets; hidden tabs queries не запускают.
- Browser concurrency bounded, одинаковые queries coalesce, obsolete navigation aborts.
- Export CSV/XLSX/PDF/PNG async: estimate → confirmation → job → expiring download capability.
- CSV/XLSX по умолчанию содержит reporting metadata, не transcript/content.
- Share разрешает Personal/Team/Project audience, но каждый read re-authorized.
- Schedule pin-ит timezone/revision/target и re-authorizes каждый dispatch.
- Revocation, subject deletion, retention и artifact archive отзывают result/export/share capability.

## IAM

Использовать уже принятые exact permissions, не role names:

### Quality

- `project.support.quality.self_read`
- `project.support.quality.read`
- `project.support.quality.review`
- `project.support.quality.dispute`
- `project.support.quality.manage`

### Reporting

- `project.reporting.catalog.read`
- `project.reporting.aggregate.read`
- `project.reporting.subject.read`
- `project.reporting.sensitive.read`
- `project.reporting.author`
- `project.reporting.drilldown.read`
- `project.reporting.export`
- `project.reporting.schedule`

### Dashboards

- `project.dashboards.read`
- `project.dashboards.author`
- `project.dashboards.publish`
- `project.dashboards.share`
- `project.dashboards.drilldown.read`

Support-specific Dataset/Metric visibility дополнительно пересекается с owner permission. Generic
`reporting.aggregate.read` не открывает Quality evidence, internal notes, sensitive profile или
subject-level detail.

Permission loss synchronously aborts reads, purges results/detail/export links and clears route
selection. Late old-scope success/error не меняет новый Project/actor context.

## Что должен доделать backend до реализации фронта

Базовый Support Quality API уже опубликован, а внутренние Reporting/Dashboard gateways существуют.
Для полного Ticket 33 backend должен опубликовать и закрепить в OpenAPI следующее.

### B1. Семантика и источники аналитики поддержки

#### Что есть сейчас

В `Lola_backend` уже есть ядро Reporting:

- `src/modules/reporting/reporting.module.ts`;
- `src/modules/reporting/semantics/reporting-semantic-document.ts`;
- `src/modules/reporting/projection/analytics-projection-worker.ts`;
- `src/modules/reporting/public/analytics-query-gateway.ts`.

Оно умеет публиковать версии Dataset, строить поколения проекций и выполнять Query Run. Однако
общая семантика пока рассчитана преимущественно на дневные денежные события: `EVENT_COUNT`,
`DISTINCT_SUBJECTS`, `SUM_AMOUNT`, `AVG_AMOUNT`, измерения `OCCURRED_DAY` и `CURRENCY`. Этого
недостаточно для SLA, очередей, назначений, длительностей, percentile, качества и загрузки команды.

#### Что реализовать

1. Ввести owner-owned интерфейс публикации закрытых фактов поддержки:

   ```text
   src/modules/support-operations/public/support-analytics-fact.port.ts
   src/modules/support-operations/application/support-analytics-fact-projector.ts
   src/modules/reporting/public/analytics-owner-fact-intake.ts
   ```

   Reporting не читает таблицы обращений, сообщений, SLA или назначений напрямую. Владелец домена
   публикует факт с `projectId`, стабильным `factId`, `sourceFamily`, версией схемы, временем
   события, временем приёма и действием `ACCEPT | CORRECTION | REVERSAL`. В факте нет текста
   сообщения, заметки, prompt/result модели, контактов пользователя, произвольного JSON и сырого
   текста ошибки.

2. Добавить отдельные source-family проекции. Не собирать всё в одну универсальную таблицу:

   ```text
   analytics_support_case_facts
   analytics_support_conversation_facts
   analytics_support_queue_occurrences
   analytics_support_assignment_occurrences
   analytics_support_sla_occurrences
   analytics_support_quality_facts
   analytics_support_delivery_facts
   analytics_support_external_work_facts
   analytics_support_content_usage_facts
   analytics_support_ai_usage_facts
   ```

3. Подключить следующие authoritative lifecycle:

   - создание, закрытие, повторное открытие и смену приоритета обращения;
   - вход и выход из очереди, dwell time и backlog snapshot;
   - назначение, снятие назначения, transfer, ручную и автоматическую маршрутизацию;
   - первый ответ, последующий ответ, resolution и reopen;
   - SLA due/met/breached и elapsed business time с pinned policy/calendar revision;
   - accepted/sent/delivered/read/failed delivery transitions;
   - Support Quality review/void, dispute и calibration;
   - использование Macro и Knowledge без текста содержимого;
   - External Work command/reconcile/provider outcome;
   - AI/translation operation, latency, tokens, priced/estimated/unpriced cost.

4. Расширить семантический компилятор закрытыми операциями:

   ```text
   COUNT
   DISTINCT_COUNT
   SUM
   AVERAGE
   MINIMUM
   MAXIMUM
   P50
   P90
   P95
   RATIO
   RATE
   DURATION_SUM
   DURATION_AVERAGE
   ```

   `RATIO` и `RATE` ссылаются только на зарегистрированные numerator/denominator. Произвольные
   формулы и исполняемые выражения запрещены.

5. Добавить типизированные измерения:

   ```text
   OCCURRED_DAY
   OCCURRED_HOUR
   QUEUE
   TEAM
   OPERATOR
   CHANNEL
   CATEGORY
   PRIORITY
   CASE_STATE
   SLA_STATE
   ASSIGNMENT_KIND
   ROUTING_OUTCOME
   QUALITY_ITEM
   DELIVERY_STATE
   EXTERNAL_PROVIDER
   AI_OPERATION
   LOCALE
   ```

   Компилятор отклоняет несовместимые metric/dimension, высокую кардинальность, ID пользователя как
   обычную series, денежный показатель без валюты, percentile по нечисловому значению и source без
   готовой проекции.

6. Опубликовать readiness/coverage для каждого Dataset:

   ```ts
   {
     datasetCode;
     datasetRevisionId;
     generationId;
     status: "BUILDING" | "READY" | "DEGRADED" | "UNAVAILABLE";
     coverageFrom;
     coverageUntil;
     dataAsOf;
     projectionLagMs;
     missingSourceFamilies;
   }
   ```

   Отсутствующий owner source возвращается как `UNAVAILABLE` или `PARTIAL`, а не как ноль.

7. Через `CmsProjectRealtimePublisher` отправлять безопасную invalidation:

   ```text
   reporting.dataset.generation.changed.v1
   ```

   Payload содержит только `projectId`, `datasetCode`, `generationId`, `updatedAt` и freshness.
   Значения метрик и пользовательские идентификаторы через realtime не передаются. REST остаётся
   единственным authoritative read.

#### Проверки

- duplicate delivery не удваивает показатель;
- correction заменяет старый вклад, reversal снимает его;
- позднее событие попадает в правильный Project-local период;
- rebuild даёт тот же результат, что live projection;
- Project A не попадает в Project B;
- отсутствующий источник не превращается в ноль;
- p50/p90/p95 совпадают с контрольной выборкой;
- subject deletion пересчитывает затронутые результаты;
- realtime получают только CMS Users с актуальным правом.

#### Критерий готовности

У каждого показателя поддержки есть зарегистрированная Metric Definition, совместимые Dimensions,
готовая проекция, generation/freshness и воспроизводимый PostgreSQL integration test.

### B2. Публичный API отчётов и OpenAPI

#### Что есть сейчас

`AnalyticsQueryGateway` уже поддерживает validate/estimate, execute, result, cancel и table page.
Публичного NestJS controller для CMS нет, поэтому эти возможности не попадают в OpenAPI и generated
frontend client.

#### Файлы

```text
src/modules/reporting/api/reporting.controller.ts
src/modules/reporting/api/reporting.dto.ts
src/modules/reporting/api/reporting-error.mapper.ts
src/modules/reporting/api/reporting-presenter.ts
```

Контроллер зарегистрировать в `ReportingModule` без feature flag, Project allowlist или нового env.

#### HTTP-контракт

```text
GET  /api/v1/admin/projects/{projectId}/reporting/catalog
POST /api/v1/admin/projects/{projectId}/reporting/queries/validate
POST /api/v1/admin/projects/{projectId}/reporting/query-runs
GET  /api/v1/admin/projects/{projectId}/reporting/query-runs/{runId}
POST /api/v1/admin/projects/{projectId}/reporting/query-runs/{runId}/cancel
GET  /api/v1/admin/projects/{projectId}/reporting/query-runs/{runId}/result
GET  /api/v1/admin/projects/{projectId}/reporting/query-runs/{runId}/table
```

`GET /catalog` возвращает только доступные актору Dataset/Metric/Dimension и для каждого определения
указывает revision, unit, aggregation, denominator, exactness, minimum sample, совместимость,
classification, required permissions и readiness.

Query Definition имеет закрытую форму:

```ts
{
  version: 1;
  datasetRevisionId: string;
  range: { from: string; until: string; timezone: string; grain: string };
  metrics: string[];
  groupBy: string[];
  filters: { dimension: string; operator: string; value: unknown }[];
  comparison?: { kind: 'PREVIOUS_PERIOD' | 'PREVIOUS_WEEK' | 'PREVIOUS_MONTH' };
  order?: { field: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
}
```

`validate` возвращает canonical query hash, выбранный plan, sync/async route, оценку source/result
rows/bytes, freshness, несовместимые поля, workload lane и необходимость явного high-cost
confirmation.

`POST /query-runs` требует стабильный `Idempotency-Key` и `expectedQueryHash`. Повтор точного запроса
возвращает тот же Run; другой intent с тем же ключом завершается typed conflict.

Состояния Query Run:

```text
QUEUED
RUNNING
READY
FAILED
CANCELLED
EXPIRED
DATA_UNAVAILABLE
```

Готовый результат содержит `ResourceReceipt`: `resultId`, `runId`, query/dataset/generation pins,
semantic/authority digest, privacy epoch, `dataAsOf`, `snapshotAt`, completeness, количество
исключённых и подавленных ячеек, rows/bytes и `expiresAt`.

Постраничный table result использует непрозрачный cursor, связанный с Project, Run, query hash,
sort и filters.

#### IAM

- catalog: `project.reporting.catalog.read`;
- aggregate result: `project.reporting.aggregate.read`;
- subject rows: `project.reporting.subject.read`;
- sensitive dimensions: дополнительно `project.reporting.sensitive.read`;
- drilldown: `project.reporting.drilldown.read`.

#### Typed errors

```text
REPORTING_QUERY_INVALID
REPORTING_QUERY_UNSUPPORTED
REPORTING_QUERY_FORBIDDEN
REPORTING_QUERY_NOT_FOUND_OR_FORBIDDEN
REPORTING_QUERY_DATA_UNAVAILABLE
REPORTING_QUERY_STALE_ESTIMATE
REPORTING_QUERY_CONFIRMATION_REQUIRED
REPORTING_QUERY_OVER_BUDGET
REPORTING_QUERY_RESULT_EXPIRED
REPORTING_QUERY_CURSOR_INVALID
REPORTING_QUERY_IDEMPOTENCY_KEY_REUSED
```

#### Проверки

- OpenAPI фиксирует operationId, request/response DTO и полный error enum;
- чужой Project/Run скрывается, а не подтверждает существование ресурса;
- live revoke запрещает чтение уже созданного Result;
- stale estimate нельзя запустить;
- cancel одного consumer не отменяет coalesced Run другого;
- cursor нельзя использовать с другим Project, Run или набором фильтров;
- `EMPTY`, `PARTIAL`, `SUPPRESSED` и `READY` не смешиваются.

#### Критерий готовности

Generated frontend client может получить каталог, проверить Query Definition, запустить Run,
дождаться результата и пройти cursor pagination без импорта backend internal types.

### B3. Публичный API панелей и OpenAPI

#### Что есть сейчас

Внутренние интерфейсы уже реализованы в:

```text
src/modules/dashboards/public/saved-report-gateway.ts
src/modules/dashboards/public/dashboard-gateway.ts
src/modules/dashboards/public/report-delivery-gateway.ts
```

PostgreSQL implementations поддерживают значительную часть черновиков, публикаций, widget
activation, export и schedule. Публичных CMS controllers нет; Saved Report также не имеет полного
catalog/archive/duplicate/history interface, а Dashboard не имеет законченного share lifecycle.

#### Файлы

```text
src/modules/dashboards/api/saved-reports.controller.ts
src/modules/dashboards/api/dashboards.controller.ts
src/modules/dashboards/api/report-delivery.controller.ts
src/modules/dashboards/api/dashboard.dto.ts
src/modules/dashboards/api/dashboard-error.mapper.ts
```

#### Saved Reports

```text
GET  /api/v1/admin/projects/{projectId}/saved-reports
POST /api/v1/admin/projects/{projectId}/saved-reports
GET  /api/v1/admin/projects/{projectId}/saved-reports/{id}
PUT  /api/v1/admin/projects/{projectId}/saved-reports/{id}/draft
POST /api/v1/admin/projects/{projectId}/saved-reports/{id}/preview
POST /api/v1/admin/projects/{projectId}/saved-reports/{id}/publish
POST /api/v1/admin/projects/{projectId}/saved-reports/{id}/archive
POST /api/v1/admin/projects/{projectId}/saved-reports/{id}/duplicate
GET  /api/v1/admin/projects/{projectId}/saved-reports/{id}/revisions
GET  /api/v1/admin/projects/{projectId}/saved-reports/{id}/revisions/{revision}
```

Расширить `SavedReportGateway`: catalog с cursor, read draft, archive, duplicate, revision history,
`allowedActions` и `actionEtag`.

#### Dashboards

```text
GET    /api/v1/admin/projects/{projectId}/dashboards
POST   /api/v1/admin/projects/{projectId}/dashboards
GET    /api/v1/admin/projects/{projectId}/dashboards/{id}
PUT    /api/v1/admin/projects/{projectId}/dashboards/{id}/draft
POST   /api/v1/admin/projects/{projectId}/dashboards/{id}/publish
POST   /api/v1/admin/projects/{projectId}/dashboards/{id}/archive
GET    /api/v1/admin/projects/{projectId}/dashboards/{id}/revisions
POST   /api/v1/admin/projects/{projectId}/dashboards/{id}/interactions
GET    /api/v1/admin/projects/{projectId}/dashboards/{id}/interactions/{interactionId}/widgets/{widgetId}
GET    /api/v1/admin/projects/{projectId}/dashboards/{id}/interactions/{interactionId}/widgets/{widgetId}/table
GET    /api/v1/admin/projects/{projectId}/dashboards/{id}/interactions/{interactionId}/widgets/{widgetId}/drilldown
POST   /api/v1/admin/projects/{projectId}/dashboards/{id}/interactions/{interactionId}/cancel
PUT    /api/v1/admin/projects/{projectId}/dashboards/{id}/favorite
POST   /api/v1/admin/projects/{projectId}/dashboards/{id}/share
DELETE /api/v1/admin/projects/{projectId}/dashboards/{id}/share/{shareId}
```

Share ограничен Project/Team/CMS User. Публичные bearer-ссылки в Ticket 33 не входят.

#### Collections и Artifact Spaces

```text
GET  /api/v1/admin/projects/{projectId}/dashboard-collections
POST /api/v1/admin/projects/{projectId}/dashboard-collections
PUT  /api/v1/admin/projects/{projectId}/dashboards/{id}/collection
POST /api/v1/admin/projects/{projectId}/dashboards/{id}/transfer
```

Поддерживаемые пространства: `PERSONAL`, `TEAM`, `PROJECT`. При переносе права и видимость
проверяются заново.

#### OCC и commands

Каждая mutation требует `Idempotency-Key`, текущий `If-Match`/`actionEtag` и exact allowed action.
Version conflict возвращает свежий root без автоматического повтора. Неизвестный outcome сохраняет
точные key/ETag/body для exact replay.

#### Export

```text
POST /api/v1/admin/projects/{projectId}/report-exports/estimate
POST /api/v1/admin/projects/{projectId}/report-exports
GET  /api/v1/admin/projects/{projectId}/report-exports/{exportId}
POST /api/v1/admin/projects/{projectId}/report-exports/{exportId}/cancel
POST /api/v1/admin/projects/{projectId}/report-exports/{exportId}/download-capability
GET  /api/v1/admin/projects/{projectId}/report-exports/{exportId}/download
POST /api/v1/admin/projects/{projectId}/report-exports/{exportId}/revoke
```

Форматы: `CSV | XLSX | PDF | PNG`. Download capability короткоживущая, одноразовая, привязана к
actor/Project/export и не попадает в URL, access log или browser history.

#### Schedule

```text
GET  /api/v1/admin/projects/{projectId}/report-schedules
POST /api/v1/admin/projects/{projectId}/report-schedules
GET  /api/v1/admin/projects/{projectId}/report-schedules/{id}
PUT  /api/v1/admin/projects/{projectId}/report-schedules/{id}
POST /api/v1/admin/projects/{projectId}/report-schedules/{id}/pause
POST /api/v1/admin/projects/{projectId}/report-schedules/{id}/resume
POST /api/v1/admin/projects/{projectId}/report-schedules/{id}/archive
GET  /api/v1/admin/projects/{projectId}/report-schedules/{id}/runs
GET  /api/v1/admin/projects/{projectId}/report-deliveries
```

Каждый schedule run повторно проверяет Project, membership, права автора/получателя, Dataset
Revision и export quota.

#### Проверки

- draft не изменяет published revision;
- Dashboard ссылается только на pinned Saved Report Revision;
- несовместимый Dataset блокирует publish;
- hidden tab и Widget вне viewport не запускаются до activation;
- exact replay не создаёт вторую revision/export/schedule;
- share revoke работает в активной сессии;
- экспорт нельзя скачать после permission revoke;
- schedule переходит в safe pause после потери authority;
- archived report не создаёт новый Run;
- Widget results читаются независимо, без ожидания всей Dashboard.

#### Критерий готовности

Все существующие Dashboard gateways доступны через typed OpenAPI. Отдельный временный Support
Dashboard backend не создаётся.

### B4. Недостающие production-контракты проверки качества

#### Что есть сейчас

`support-quality.controller.ts`, `support-quality.dto.ts` и `support-quality.service.ts` уже дают
scorecard, Review, evidence references, dispute, calibration и личный aggregate. Текущий scorecard
item содержит только `code`, `label`, `maximumScore`; Review не имеет sections, applicability,
criterion feedback или task. Списки Reviews и Calibrations ограничены `LIMIT 100`, Disputes —
`LIMIT 20` без cursor.

#### Review queue и sampling

Добавить таблицы:

```text
support_quality_sampling_policies
support_quality_sampling_policy_revisions
support_quality_review_tasks
support_quality_population_receipts
support_quality_task_commands
```

Task contract:

```ts
{
  id;
  projectId;
  caseId;
  conversationId;
  operatorCmsUserId;
  scorecardRevisionId;
  samplingPolicyRevisionId;
  selectionReasonCode;
  populationReceiptId;
  state: "READY" | "CLAIMED" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  assignedReviewerCmsUserId;
  dueAt;
  version;
}
```

```text
GET  /api/v1/admin/projects/{projectId}/support/quality/tasks
GET  /api/v1/admin/projects/{projectId}/support/quality/tasks/{id}
POST /api/v1/admin/projects/{projectId}/support/quality/tasks/{id}/claim
POST /api/v1/admin/projects/{projectId}/support/quality/tasks/{id}/release
POST /api/v1/admin/projects/{projectId}/support/quality/tasks/{id}/cancel
```

#### Scorecard revision

Заменить плоский список критерия на immutable section model:

```ts
{
  sections: [{
    code;
    name;
    description;
    weightBasisPoints;
    items: [{
      code;
      name;
      guidance;
      ratingScale: 'BINARY' | 'THREE_POINT' | 'FIVE_POINT' | 'NUMERIC';
      criticalFailure;
      applicability: 'ALWAYS' | 'CONDITIONAL' | 'REVIEWER_DECIDES';
      maximumScore;
    }];
  }];
}
```

Публикация запрещена при неверной сумме weights, повторе code, несовместимой scale/maximumScore,
отсутствующем guidance или неописанном результате critical failure.

#### Review detail

Для каждого критерия сохранять `applicable`, rating/score, bounded feedback, evidence references,
root cause и coaching theme. На уровне Review нужны summary, critical-failure outcome, task ID,
selection reason и acknowledgment state. Feedback не попадает в Reporting, telemetry или обычный
export.

Операторские команды:

```text
POST /api/v1/admin/projects/{projectId}/support/quality/reviews/{reviewId}/acknowledge
POST /api/v1/admin/projects/{projectId}/support/quality/reviews/{reviewId}/operator-reply
```

Оператор может подтвердить или прокомментировать только собственную submitted Review. Команда не
изменяет баллы.

#### Calibration

Добавить participants, minimum reviews, peer visibility, optional baseline, agreement result и
criterion variance. До собственной отправки reviewer не видит чужие результаты.

```text
GET  /api/v1/admin/projects/{projectId}/support/quality/calibrations/{id}
POST /api/v1/admin/projects/{projectId}/support/quality/calibrations/{id}/participants
POST /api/v1/admin/projects/{projectId}/support/quality/calibrations/{id}/baseline
POST /api/v1/admin/projects/{projectId}/support/quality/calibrations/{id}/close
```

#### Pagination

Заменить hard limit на opaque cursor в Reviews, operator Reviews, Disputes, Calibrations и Tasks.
Разрешённые `limit`: `25 | 50 | 100`; cursor связан с Project, сортировкой и фильтрами. Поддержать
state/operator/reviewer/scorecard revision/date filters.

#### Reporting facts

Support Quality публикует факты `review submitted/voided`, normalized section/item score, critical
failure, dispute lifecycle, acknowledgment и calibration variance/agreement. Project/Team/operator
агрегаты строятся через B1/B2; browser и `operatorMetrics()` не становятся вторым источником истины.

#### Проверки

- Task нельзя claim/complete дважды;
- published Scorecard Revision неизменяема;
- N/A не считается нулём;
- critical failure влияет на overall outcome;
- submitted Review нельзя редактировать;
- оператор видит только собственную Review;
- peer Calibration скрыта до разрешённого момента;
- Dispute не переписывает Review;
- cursor нельзя перенести между Project или filters;
- void/dispute/calibration корректно перестраивают Quality facts.

#### Критерий готовности

Reviewer проходит `queue → review → evidence → submit`, оператор —
`read → acknowledge/dispute`, а lead получает Quality aggregates через Reporting.

### B5. Приватность, полномочия и доказательства готовности

Этот блок выполняется вместе с B1–B4, а не после реализации продукта.

#### Metric/Dimension classification

Каждое определение хранит `classification`, exact required permissions, minimum sample,
drilldown/export admission. Минимальные классы: `AGGREGATE`, `INTERNAL`, `PERSONAL`, `SENSITIVE`.
`project.reporting.aggregate.read` не открывает индивидуальные Quality Reviews, Operator grouping,
Internal Notes или subject rows.

#### Small-cell suppression

Подавление выполняется на сервере до записи Query Result:

```ts
{
  state: 'VALUE' | 'NULL' | 'SUPPRESSED' | 'NOT_APPLICABLE';
  value?: string;
  suppressionReason?: 'MINIMUM_SAMPLE' | 'RESTRICTED_BREAKDOWN';
}
```

Backend не возвращает скрытое значение с расчётом на то, что UI его не покажет. Resource Receipt
фиксирует suppression policy revision, minimum sample и suppressed cell count.

#### Повторная авторизация

Расширить `ReportingArtifactAccessPolicy`. При каждом чтении Result, Dashboard, drilldown, export,
share и schedule проверяются текущие actor/membership/Project status, Dataset/Metric permissions,
authority digest, privacy epoch, deletion fence и Artifact Space. Ранее созданный Result становится
недоступен сразу после revoke.

#### Subject deletion

Существующий `reporting-privacy-reconciliation.worker.ts` расширить на support facts,
subject-level contributions, Query Result rows, drilldown cache, export artifacts, in-app delivery и
pending schedule result. Workflow завершается durable receipt со списком очищенных generations и
artifacts.

#### Audit

Audit хранит actor, Project, operation, definition/revision ID, query/result/export/dashboard ID,
rows, bytes, duration, outcome и requestId. В Audit не попадают значения метрик, текст обращения,
текст Review, download capability, пользовательские данные из filters и raw backend error.

#### PostgreSQL и load proof

Покрыть:

- параллельные Project;
- interactive query во время export/backfill;
- correction/reversal во время Query Run;
- live permission revoke;
- subject deletion при готовом export;
- worker crash между claim и commit;
- exact replay Query/Export;
- high-cardinality Project;
- fairness: один Project не забирает всю очередь.

Зафиксировать SLO для catalog, validate, interactive result, first Widget, drilldown, projection lag
и export queue age.

#### Handoff фронту

Добавить в backend:

```text
docs/specs/support-platform/support-quality-analytics-frontend-handoff.ru.md
```

В документе зафиксировать backend commit, OpenAPI SHA-256 и provenance, operationId, permissions,
DTO/enums/errors, cursor, idempotency/OCC, realtime event, freshness/suppression/null semantics,
примеры и команды executable contract tests.

#### Критерий готовности

Есть PostgreSQL correctness/load proof, OpenAPI contract test, IAM/live-revoke test, deletion proof и
pinned frontend handoff. Одних unit tests gateway недостаточно.

### Порядок backend-работы

```text
B1 Support facts/semantics/projections
 ├─→ B2 Reporting HTTP/OpenAPI
 └─→ B4 полный Support Quality workflow
       ↓
B3 Saved Reports/Dashboards поверх B2
       ↓
B5 сквозной security/release proof
```

Frontend Quality можно начинать после B4 и его pinned OpenAPI. Curated Support Analytics требует
B1+B2 и обязательную часть B5. Конструктор, Saved Reports, Dashboards, export и schedule требуют B3
и полного B5.

До B1–B5 frontend не создаёт временные DTO, fake analytics и производственные mock-only surfaces.

## Архитектура фронта

Новый глубокий модуль скрывает generated client:

```text
src/features/support-quality/
  api/support-quality-source.ts
  model/use-support-quality-queue.ts
  model/use-support-quality-review.ts
  model/use-support-quality-calibration.ts
  ui/...

src/features/support-analytics/
  api/support-analytics-source.ts
  model/use-support-analytics-dashboard.ts
  model/use-support-analytics-run.ts
  model/support-analytics-presenter.ts
  ui/...
```

- Vue pages не импортируют generated operations.
- Controller scope: actor + Project + sorted permissions + definition/result generation.
- Reads abortable/fenced; mutations serialized; unknown outcomes retain exact attempt.
- Realtime port зависит от Dataset generation, а не знает controller implementation.
- Presentation helpers exhaustive для enums и fail closed на неизвестном состоянии.
- Chart renderer принимает bounded server Chart Definition/Result shape; arbitrary JS expressions и
  arbitrary colors не исполняются.

## Направление интерфейса

**Intent:** Support lead за несколько секунд понимает, где риск и что открыть; QA reviewer быстро и
справедливо завершает проверку; оператор понимает feedback без ощущения скрытого рейтинга.

**Hierarchy:** один главный вывод/health spine, затем причина и detail. Не стена одинаковых cards.

**Palette:** существующие semantic tokens; neutral canvas, operational blue, success только для
подтверждённого результата, warning для риска, danger для breach/critical. Calibration получает
тихий отдельный маркер, но не новый декоративный theme.

**Depth:** quiet borders + tonal surface shifts из `.interface-design/system.md`; chart tooltip и
drawer на один elevation выше, без тяжёлых теней.

**Typography:** tabular numerals; metric title muted/compact, value primary, unit и denominator рядом;
heading формулирует вопрос или вывод.

**Spacing:** 4px base; dense filters 8/12px, Widget 16px, major section 24px.

### Правила графиков

- KPI только для decision-driving headline; у числа видны denominator/coverage и trend.
- Line/area для времени, horizontal bar для категорий, histogram для duration distribution, funnel
  для committed stages, heatmap для hour/day и quality matrix, table для exact/audit.
- Stacked chart только когда parts образуют honest whole.
- Donut только для 2–5 stable categories; длинный tail уходит в bar/table.
- Не больше 3–4 simultaneously emphasized series.
- Одинаковый Metric/Dimension сохраняет цвет между pages и refresh.
- Green/red не единственный сигнал; labels, icons/line style и textual delta обязательны.
- У каждого chart есть accessible name, concise insight, keyboard points и table alternative.
- Null не соединяется линией и не превращается в zero.

### Состояния и анимация

- Geometry-matched skeleton для first load.
- Refresh не заменяет весь Dashboard skeleton.
- Empty, no-data, not-applicable, suppressed, stale, partial, forbidden, failed, cancelled и expired
  имеют разные copy/action.
- 120–220ms transform/opacity, никаких `transition: all`, count-up и layout-shifting animations.
- `prefers-reduced-motion` сохраняет смысл без movement.
- Hover/focus/active/disabled и touch targets 40–44px.

### Матрица адаптива

- `1440×1000`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `320×568`.
- Light/dark, 200% zoom, long labels, large values, empty/suppressed/stale/error.
- Desktop/tablet/mobile screenshots визуально проверяются, а не только сохраняются.
- Mobile charts не ужимаются до нечитаемости: summary → chart/table → detail route.
- Нет document-level horizontal overflow; table/chart может иметь собственную bounded scroll region.

## Критерии приёмки

### Контракты и безопасность

- [ ] Backend B1–B5 опубликованы, pinned OpenAPI/hash/source provenance зафиксированы.
- [ ] Все Quality/Reporting/Dashboard permissions проверяются exact code и live revoke.
- [ ] Browser не рассчитывает Project/Team/operator metrics из raw rows/messages.
- [ ] Unknown/partial/stale/suppressed/no-data не смешиваются с zero/success.
- [ ] Drilldown/export/share/schedule повторно проверяют authority и не раскрывают hidden counts.
- [ ] Content/PII/secrets/internal notes/prompts не попадают в aggregate, route, telemetry или export.
- [ ] Actor/Project/permission switch aborts stale work and purges protected state.
- [ ] Нет feature flags, env, allowlists, legacy analytics или обратной совместимости.

### Проверка качества

- [ ] Reviewer проходит queue → draft → evidence → submit → feedback/dispute.
- [ ] Operator видит только собственную submitted review и может acknowledge/dispute.
- [ ] Scorecard revision immutable; old review reproducible after new publication.
- [ ] Calibration hides peer result until allowed, не влияет на обычный quality score.
- [ ] Critical failure, N/A, conditional item и exact field errors покрыты.
- [ ] Review/dispute/calibration pagination, conflict, revoke и unknown outcome покрыты.

### Аналитика

- [ ] Curated pages покрывают Сейчас, Поток/SLA, Качество/клиентов, Команду и Automation/cost.
- [ ] Metric definition/receipt доступен для каждого Widget.
- [ ] Period/comparison/filters URL-synchronized и применяются только к compatible Widgets.
- [ ] p50/p90/p95, coverage и denominator отображаются там, где average вводит в заблуждение.
- [ ] Realtime invalidation показывает `Есть новые данные`; refresh authoritative и coalesced.
- [ ] Auto-refresh доступен только подходящим оперативным views и не работает в hidden/offline state.
- [ ] Drilldown имеет breadcrumb/reset, stable cursor и direct Case/Review deep link.
- [ ] Saved Report/Dashboard revisions, staged Widgets, share, export и schedule работают.

### Интерфейс и доступность

- [ ] Skeleton повторяет итоговую геометрию; repeat refresh не мигает пустой страницей.
- [ ] Keyboard-only и screen reader покрывают filters, charts, table alternative и drilldown.
- [ ] Axe: нет critical/serious violations на ключевых routes без отключения contrast rule.
- [ ] Light/dark, responsive matrix, 200% zoom и reduced motion проверены.
- [ ] Chart meaning не зависит от color/animation/hover.
- [ ] Mobile Back/Forward сохраняет filters/draft/result context.

### Быстродействие и доказательства готовности

- [ ] Dashboard shell появляется до Widgets; hidden tabs не выполняют queries.
- [ ] Initial visible queries bounded; identical Widgets coalesce; obsolete requests cancel.
- [ ] Interactive refresh не конкурирует с export/schedule/backfill lane.
- [ ] Зафиксированы p50/p95/p99 Query Run, first-useful-render, projection lag и scanned rows/bytes.
- [ ] Large Project/long period/noisy neighbor/load tests не влияют на operational Support writes.
- [ ] Focused tests, contract tests, `api:check`, typecheck, lint/architecture, full Vitest, build и
      Playwright desktop/tablet/mobile проходят.
- [ ] UI вручную протыкан: filters, compare, refresh/reconnect, detail, revoke, Project switch,
      Back/Forward, export, share, QA submit/dispute/calibration и все corner states.

## Тикет готов, когда

Ticket 33 закрывается только целиком:

- production QA workflow работает для reviewer/operator/lead;
- Support analytics использует общий server-owned Reporting context;
- все требуемые metric families опубликованы или честно помечены owner source unavailable;
- оперативное обновление, исторические runs, drilldown, Saved Reports, Dashboards, export и share
  имеют production contracts;
- безопасность, privacy, fairness, accessibility, responsive UX и performance доказаны;
- P0/P1 Standards/architecture/security и Spec/UX review закрыты;
- отдельный локальный commit в `main`; push только по явной команде пользователя.
