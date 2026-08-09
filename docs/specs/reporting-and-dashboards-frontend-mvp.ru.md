# Reporting & Dashboards: frontend MVP

Статус: готово к frontend-декомпозиции; implementation gated by merged backend OpenAPI
Дата: 2026-08-09
Область: Project-scoped создание и просмотр Saved Reports и Dashboards в Lola CMS

## 1. Цель

Дать авторизованному CMS User отдельный раздел `Отчёты`, где он может:

- найти существующий Dashboard или Saved Report;
- собрать Saved Report из опубликованных Dataset, Population, Metric, Dimension и time semantics;
- увидеть preview, происхождение и ограничения результата;
- создать Dashboard и наполнить его опубликованными Saved Reports;
- применить совместимые глобальные filters и быстро отслеживать Project без повторной настройки;
- безопасно открыть Dashboard на desktop или mobile.

Frontend не считает агрегаты из Event Logs, Profile lists или Segment members. Он визуализирует
только авторизованный `Query Result` и показывает `Resource Receipt`.

## 2. MVP и границы

### В MVP

- отдельная navigation surface `Отчёты`;
- library с вкладками `Дашборды` и `Сохранённые отчёты`, search, lifecycle/status и Collection;
- create/edit/publish/archive Saved Report;
- governed builder: Dataset → Population → Metric → range/grain → breakdown/filter → preview → chart;
- Event-backed report как первый реальный source;
- current Profile/Segment population только после явного backend capability;
- visualizations: KPI, line, bar, low-cardinality donut и cursor-paginated table, если они разрешены
  canonical Chart Definition;
- create/edit/publish/archive Dashboard;
- один обязательный page/tab `Обзор`; backend model остаётся массивом для будущего расширения;
- добавление опубликованного Saved Report как Widget;
- reorder и width presets `1/3`, `1/2`, `2/3`, `full`; без свободных pixel coordinates;
- global date range и только server-declared compatible filters с явной кнопкой `Применить`;
- shell-first, viewport-aware Widget loading и bounded concurrency;
- read-only mobile viewing, light/dark, keyboard и screen-reader summaries;
- Draft OCC, immutable published revision, project switch/revoke cleanup.

### Не в MVP

- arbitrary SQL, JSON path, JavaScript formatter или generated SVG;
- свободный drag/resize canvas и nested layout grid;
- funnel, retention, Sankey, scatter, correlation, anomaly/forecasting;
- scheduled delivery, exports, sharing outside Project и alerts;
- historical Profile/Segment claims до effective-dated source;
- raw content/transcripts/prompts/notes, unrestricted End User identifiers;
- cross-currency totals без published FX definition;
- AI auto-publish или auto-share.

## 3. Пользователи и authority

Основной пользователь MVP — CMS User с Project Permissions просмотра или авторинга аналитики,
который после проверки операционных экранов хочет за 1–2 минуты ответить на повторяющийся вопрос
и сохранить этот способ наблюдения для команды. Product может выдавать эти Permissions через
managed Project Roles, но их названия не становятся frontend contract.

Frontend никогда не проверяет имя роли. Видимость и действия определяются только текущими
`effectivePermissionCodes` и server-provided allowed actions.

Минимальная ожидаемая backend vocabulary:

| Capability                                  | Предлагаемый Permission из backend spec                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| Browse/read artifacts and aggregate results | `project.analytics.read`                                   |
| Execute preview/Widget query                | `project.analytics.query.execute`                          |
| Read subject rows                           | `project.analytics.raw_rows.read`                          |
| Use sensitive dimensions                    | `project.analytics.sensitive_dimensions.read`              |
| Create/edit own Dashboard                   | `project.dashboards.create`, `project.dashboards.edit_own` |
| Edit any Dashboard                          | `project.dashboards.edit_any`                              |
| Publish Dashboard                           | `project.dashboards.publish`                               |
| Share Dashboard                             | `project.dashboards.share`                                 |

Exact Saved Report authoring codes должны появиться в OpenAPI/IAM catalog до implementation.
Managed roles могут получать эти Permissions пакетами, но client не должен знать mapping роли.

## 4. Информационная архитектура

```text
Sidebar: Отчёты
  /reports
    Дашборды
    Сохранённые отчёты
  /reports/new
  /reports/:reportId
  /reports/:reportId/edit
  /dashboards/:dashboardId
  /dashboards/:dashboardId/edit
```

`/overview` остаётся фиксированным Project overview и не превращается в user-authored Dashboard.

### Library `/reports`

- header: `Отчёты`, search, Collection filter, `Создать`;
- две tabs с counts только из authority-filtered response;
- list-first layout: title, owner/space, updated, lifecycle, data freshness/error badge;
- Dashboard preview не исполняет все Widgets; допустимы server-provided last-success summaries;
- empty state предлагает первый Saved Report, а не сразу пустой Dashboard canvas;
- hidden/forbidden artifact не участвует в totals, filters или suggestions.

### Saved Report builder

Desktop — двухколоночный workbench:

- слева configuration rail шириной около 360px;
- справа один доминирующий preview с result summary и table alternative;
- шаги остаются на одной странице и раскрываются по готовности, без цепочки модалок;
- preview запускается явно, показывает normalized interpretation, cost/freshness warning и не
  публикует Draft;
- `Publish` — отдельная primary action; `Save draft` и `Archive` визуально вторичны.

Mobile поддерживает чтение опубликованного Saved Report и простые filters. Полное authoring
открывается как последовательные sections без drag и horizontal overflow, но desktop остаётся
целевой средой создания.

### Dashboard viewer

- shell/title/tabs/filters появляются до Widget data;
- focal point — первый широкий Widget, отвечающий на главный вопрос Dashboard;
- дальше используется асимметричный, но grid-aligned rhythm, а не парковка одинаковых cards;
- above-the-fold Widgets имеют приоритет; below-viewport и hidden tabs не исполняются;
- общий browser budget — ориентир четыре активных аналитических запроса;
- duplicate descriptors coalesce на backend; obsolete runs отменяются при Project/filter change;
- filter bar показывает `применено к N из M` и причины несовместимости;
- каждый Widget имеет menu: `Открыть отчёт`, `Объяснить`, `Обновить`, а в edit mode — `Заменить` и
  `Удалить`.

### Dashboard editor

- редактируется Draft, published revision остаётся неизменной;
- добавление Widget начинается с search опубликованных Saved Reports;
- widget может менять title override, width preset и position, но не меняет Query Definition;
- изменение аналитики ведёт в Saved Report Draft и создаёт новую pinned revision после publish;
- preview layout не запускает query из-за reorder/resize;
- conflict сохраняет local Draft, показывает server version и предлагает reload/duplicate;
- первая версия имеет один `Обзор` page, но DTO и renderer не предполагают singleton навсегда.

## 5. Интерфейсное направление

### Intent

Плотное, спокойное аналитическое рабочее место. Пользователь должен сначала увидеть ответ, затем
сразу понять «что именно посчитано и насколько данным можно доверять».

### Domain exploration

- **Domain:** Dataset, Population, Metric, Dimension, time grain, Revision, Widget, freshness,
  exactness, exclusions, Resource Receipt.
- **Color world:** нейтральный Project canvas, белая/системная рабочая поверхность, navy sidebar,
  firm blue для выбранного/разрешённого действия, muted grid/axis, semantic warning/danger только
  для качества или недоступности данных.
- **Signature:** `Evidence rail` под значением/графиком — компактная строка
  `Период · данные по · полнота · точность`, раскрывающая `Resource Receipt` через `Объяснить`.
- **Rejecting:** одинаковая сетка KPI cards → один главный вопрос и подчинённые Widgets;
  blank drag canvas → Saved Report-first governed flow; rainbow charts → стабильные semantic series
  tokens и color-independent legends.

### System

- 4px spacing base; основные gaps/padding `8 / 12 / 16 / 24px`;
- workbench-tight controls, более свободное расстояние между аналитическими группами;
- quiet borders + tonal surface shifts; без декоративных gradients/shadows;
- existing PrimeVue controls и theme tokens; новый raw hex запрещён;
- dynamic values используют tabular numerals;
- headings и values различаются weight/color раньше, чем экстремальным size;
- Widget radius следует существующей CMS card scale; nested chart surface имеет concentric radius;
- motion 150–220ms только для раскрытия/первого появления; refresh не переигрывает cascade;
- `prefers-reduced-motion` отключает movement.

### Widget anatomy

```text
title + optional status/action
primary value or bounded chart
legend / accessible summary / table alternative
Evidence rail: range · timezone · dataAsOf · completeness · exactness
```

States не схлопываются в один error:

- `loading`: geometry-matched skeleton;
- `queued/running`: progress copy без fake percent;
- `empty`: корректный ноль или отсутствие совпадений с definition;
- `stale`: last-success остаётся видимым с явным `данные по`;
- `partial`: result видим, exclusions/limitations раскрыты;
- `suppressed`: безопасное объяснение без hidden count;
- `forbidden`: нет schema/series/previous sensitive result в DOM/cache;
- `failed`: stable safe message и retry;
- `expired`: новый run, старый result не используется как authority.

## 6. Минимальные chart rules

| Result shape             | Default                        | Constraints                                                |
| ------------------------ | ------------------------------ | ---------------------------------------------------------- |
| Scalar                   | KPI + optional delta/sparkline | unit, denominator, period обязательны                      |
| Time series              | line                           | bounded points, gap policy, timezone visible               |
| Category                 | horizontal bar                 | stable order, Top-N/Other server-owned                     |
| Low-cardinality category | donut                          | только после canonical `DONUT` contract; legend обязателен |
| Rows                     | table                          | server cursor, stable sort, totals не выводятся из page    |

Один `ReportingChartRenderer` скрывает library/implementation. Existing chart tokens
`--chart-series-*`, `--chart-axis`, `--chart-grid`, `--chart-tooltip` являются palette source.
Chart обязан иметь текстовое summary; декоративные bars/segments скрываются от assistive tech, если
соседний текст несёт полное значение.

## 7. Data semantics в UI

### Events

Builder показывает только Event-backed Datasets и поля, опубликованные analytics catalog. Stable
field identity приходит с backend; browser не хранит JSON path. Money требует currency dimension
или published constant. `occurredAt` и `receivedAt` не смешиваются.

### Profile

Profile Attribute доступен только с classification и allowed operations из catalog. MVP label
`Текущее состояние на момент запроса` всегда видим. Restricted/hidden fields не появляются как
disabled options, если их существование нельзя раскрывать.

### Segments

Выбирается stable Segment и pinned Revision. MVP поддерживает `current evaluation`; label
`Состав пересчитывается по текущему профилю` остаётся рядом с Population. Frozen и historical
population не симулируются frontend-фильтрацией.

### Другие owners

Scenario, AI, Support, Conversation и Integration появляются только после публикации owner
analytics contracts. Content-free aggregate eligibility не даёт права на raw drilldown.

## 8. Frontend architecture

```text
src/features/reporting/
  api/          generated-client adapters + mock contract fixtures
  model/        route state, permissions, lifecycle, run coordinator, chart compatibility
  ui/           library, report builder/viewer, dashboard shell/editor, widget states
src/pages/
  ReportsPage.vue
  SavedReportPage.vue
  DashboardPage.vue
```

Обязательные правила:

- generated client импортируется только в `features/reporting/api`;
- repository exposes typed domain-shaped responses and supports mock/API parity;
- run coordinator владеет concurrency, cancel, polling/realtime hints и scope generation;
- route state хранит только safe IDs/filter values; Query Result и receipt не идут в URL/storage;
- Project switch, logout, permission revoke и artifact change abort requests и purge scoped cache;
- REST result остаётся authoritative; realtime только инициирует bounded reconcile;
- client не вычисляет totals, ratios, `Other`, freshness или exactness из Widget rows;
- chart renderer не принимает arbitrary formatter/HTML.

## 9. Contract Definition of Ready

Frontend ticket, читающий реальные данные, готов только когда:

- операции опубликованы в pinned frontend OpenAPI;
- exact Permissions и allowed actions известны;
- request/response examples есть для sync result и async run;
- Draft OCC, immutable revision и archive semantics определены;
- Result schema, cursor identity и Resource Receipt типизированы;
- stable errors существуют для forbidden/suppressed/stale/expired/quota/conflict;
- lifecycle fixtures покрывают loading/empty/partial/stale/forbidden/error;
- Project switch/revoke semantics проверяемы;
- Dashboard shell и Widget descriptors позволяют staged loading без N eager requests;
- contract явно называет current/historical Profile/Segment semantics.

Незакоммиченная backend документация или локальный DTO не снимают gate.

## 10. Acceptance MVP

- CMS User без read Permission не видит route, artifact metadata, counts или cached result.
- CMS User с read, но без authoring Permissions, читает Dashboard и Saved Report без edit controls.
- Автор создаёт Event-backed Saved Report, видит preview/receipt, публикует immutable revision.
- Dashboard Draft принимает опубликованный Saved Report как Widget, сохраняет order/width и
  публикуется без копирования query/result.
- 12 видимых Widgets не превышают agreed browser/server concurrency; 50 Widgets в hidden tabs не
  становятся 50 initial runs.
- Date filter применяется только после `Применить`; несовместимые Widgets объяснены.
- Profile/Segment population никогда не подписана historical без соответствующего contract.
- stale/partial/suppressed/forbidden/failed визуально и программно различимы.
- route/project/filter changes не коммитят late response от старого scope.
- 1440×1000, 1024×768, 390×844 и 320×568 проходят visual/keyboard QA в light/dark; page-level
  horizontal overflow отсутствует.
- screen reader получает title, value/summary, unit, period и status каждого Widget.
- typecheck, unit/component tests и API/browser e2e проходят.

## 11. Delivery slices

### F0 — contract foundation

Синхронизировать merged OpenAPI, завести reporting repository/types/fixtures, Permission helpers,
route skeleton и run coordinator contract. Backend gate: Analytics Gateway + Dashboard contract.

### F1 — artifact library

Добавить permission-gated navigation и `/reports` с authority-filtered search, tabs, Collection и
lifecycle states. Не исполнять Widget queries для catalog cards.

### F2 — Saved Report vertical

Собрать Event-backed Saved Report Draft → preview/run → KPI/line/bar/table → receipt → publish.
Donut входит только после устранения contract mismatch. Current Profile/Segment не эмулировать.

### F3 — Dashboard viewing

Реализовать shell-first Dashboard viewer, filters, staged Widget runs, independent states,
accessible chart renderer и mobile read-only layout.

### F4 — Dashboard authoring

Реализовать Draft, add Saved Report, reorder, width presets, title overrides, preview, OCC conflict,
publish/archive. Query editing остаётся в Saved Report.

### F5 — governed populations

Подключить Current Profile и pinned Segment current-evaluation через published catalog/receipt,
compatibility filters и disclosure rules. Backend gate: второй owner/population contract.

### F6 — hardening and rollout

Contract/browser/load proofs, 50-Widget lazy-load fixture, revoke/project-switch purge,
accessibility/visual matrix, feature flag, evidence и rollback.

## 12. Dependency graph

```text
F0 Contract foundation
├── F1 Artifact library
└── F2 Saved Report vertical
    ├── F3 Dashboard viewing
    │   └── F4 Dashboard authoring
    └── F5 Governed Profile/Segment populations
        └── F6 Hardening and rollout
            (F6 also waits for F1, F3 and F4)
```

Стартовый frontend frontier — только F0. F1 и fixture-first часть F2 могут разрабатываться после
freeze contract shapes; real-API acceptance остаётся закрыта до merge backend OpenAPI.
