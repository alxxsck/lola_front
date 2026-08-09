# Frontend discovery: Reporting & Dashboards MVP

Дата: 2026-08-09
Статус: завершённый code/docs discovery; production-код не изменён
Область: отдельный Project-scoped раздел отчётов и дашбордов в Lola CMS

## 1. Вывод

Frontend уже имеет нужные строительные блоки — Project selection, effective Permission guards,
repository boundary, generated OpenAPI client, route-synchronized filters, responsive data tables,
chart tokens и несколько специализированных графиков. Но универсального Reporting/Dashboard
контракта в pinned OpenAPI пока нет, а текущий `/overview` — фиксированный обзор проекта, не
self-service аналитика.

Минимальный честный frontend slice должен быть таким:

1. permission-gated библиотека `Отчёты`;
2. управляемый builder одного `Saved Report` из server-published Dataset/Metric/Dimension/Population;
3. preview и published viewer с `Resource Receipt`;
4. Dashboard, который компонуется из Saved Reports, а не хранит собственные SQL/JSON-запросы;
5. staged Widget loading и независимые состояния каждого Widget;
6. Event-backed Dataset первым, Current Profile/Segment populations — только после появления
   явного backend contract с корректной temporal semantics.

Это меньше полного backend vision, но не создаёт временную модель, которую придётся выбрасывать.

## 2. Источники истины

Подробная проверка backend-кода, фактических endpoint/payloads и readiness gates находится в
[backend contract audit](./reporting-backend-discovery.md).

### Backend checkout

Исследован `/Users/alxxsck/Documents/Lola_backend` на commit
`9f36796b477d34fcac2a9a46844bbd78863df6e1`.

Reporting-документы в этом checkout изменены или ещё не добавлены в git, поэтому они описывают
целевую модель, но не считаются доступным frontend contract:

- [platform discovery](../../../Lola_backend/docs/discovery/dashboard-reporting-platform-discovery.ru.md);
- [all-data architecture audit](../../../Lola_backend/docs/discovery/dashboard-all-data-architecture-audit-2026-08-08.ru.md);
- [platform specification](../../../Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md);
- [delivery map](../../../Lola_backend/docs/specs/reporting-and-dashboards-delivery-map.ru.md).

Backend уже зафиксировал правильные фундаментальные решения:

- Reporting не читает owner tables напрямую;
- Analytics Query Gateway принимает только typed, versioned semantics;
- Saved Report и Dashboard имеют Draft и immutable published Revisions;
- Widget pin-ит report/query/chart revisions и не хранит computed data;
- Current Profile и Segment evaluation нельзя выдавать за historical truth;
- каждый result сопровождается freshness/completeness/exactness/exclusions;
- Dashboard shell загружается до Widgets, hidden tabs не исполняются, browser concurrency bounded;
- PostgreSQL-first и будущий analytical store скрыты от CMS за одним contract.

### Frontend checkout

Фактические frontend источники:

- [AppShell navigation](../../src/widgets/layout/AppShell.vue) — Project-scoped пункт виден по
  effective Permission;
- [router guards](../../src/app/router.ts) — route meta поддерживает один Permission или
  `projectPermissionsAny`;
- [permission vocabulary](../../src/features/auth/permission-access.ts) — client использует exact
  codes, а не имена ролей;
- [OpenAPI snapshot](../../openapi/retenive-backend.json) и
  [generated client](../../src/shared/api/generated/retenive-backend.ts) — единственный готовый
  HTTP contract;
- [Event Query repository](../../src/features/event-query/api/event-query-repository.ts) — пример
  изоляции generated client за feature repository;
- [Event Query preview](../../src/features/event-query/ui/EventQueryPreview.vue) — существующий
  governed picker и server-owned operations;
- [Segments page](../../src/pages/SegmentsPage.vue) — versioned Segment и read/write Permission;
- [Event Logs page](../../src/pages/EventLogsPage.vue) — route-synchronized filters, cursor pages и
  desktop/mobile представления;
- [AI Costs dashboard](../../src/features/ai-costs/ui/AiCostsDashboard.vue) — period state в URL,
  freshness и аналитические таблицы;
- [AI chart components](../../src/features/ai-usage/components/AiModalityChart.vue) — доступный SVG
  donut и screen-reader label;
- [theme tokens](../../src/app/styles/theme.css) — light/dark chart series, axis, grid, tooltip и
  semantic status tokens;
- [.interface-design/system.md](../../.interface-design/system.md) — 4px grid, workbench density,
  quiet borders/tonal surfaces и permission-safe state rules.

Pinned frontend OpenAPI SHA-256:
`2f4da7559279192a20fd77bf07e72c377d9a031724a0d77a21a81aecd521ee44`.

## 3. Что уже можно переиспользовать

| Задача                   | Переиспользуемый паттерн                           | Ограничение                                                          |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| Route и navigation guard | `meta.projectPermission`, `hasProjectPermission`   | reporting codes ещё не входят в client union                         |
| Project switch/revoke    | auth store + generation checks в data pages        | Reporting должен очищать results/drafts всех scopes                  |
| API boundary             | feature repository поверх generated client         | reporting endpoints отсутствуют в snapshot                           |
| Catalog picker           | `EventPicker`, `CatalogPicker`, paged search       | нужен authority-filtered analytics catalog contract                  |
| Filters                  | URL state из AI Costs/Event Logs                   | Dashboard filter binding приходит с Revision, не выводится в browser |
| Tables                   | PrimeVue DataTable + server cursor                 | Result cursor должен быть связан с result identity/sort              |
| Charts                   | chart tokens и специализированные SVG/bar patterns | общего renderer для declarative Chart Definition нет                 |
| States                   | Message/Skeleton/empty/error patterns              | добавить stale/partial/suppressed/forbidden/queued отдельно          |
| Responsive               | mobile route stack/list modes                      | сложное authoring остаётся desktop-first; viewing работает с 320px   |

## 4. Contract gaps до реализации

В pinned OpenAPI нет `analytics`, `dashboards`, `saved reports`, `widgets`, `collections` или
рекомендуемых `project.analytics.*` / `project.dashboards.*` Permissions. Поэтому frontend не должен
создавать временные DTO или вызывать существующий End User Event Query API как Dashboard backend.
Этот API consumer-scoped для AI/preview одного End User и имеет другую authority/retention модель.

Backend docs также требуют уточнить до генерации клиента:

1. canonical route prefix: discovery показывает `/api/v1/projects/...`, тогда как CMS сейчас
   использует `/api/v1/admin/projects/...`;
2. exact Permission для create/edit/publish `Saved Report`: рекомендуемый список подробно описывает
   Dashboard authoring, но не симметричный Report CRUD;
3. donut: discovery разрешает его для low-cardinality category, но пример `VisualizationSpec.kind`
   не содержит `DONUT`;
4. синхронный result против `202 RunAccepted`, polling/realtime transition и cancel;
5. shell payload и batch manifest для staged Widget loading;
6. OCC token, allowed actions, archive/duplicate semantics и stable errors;
7. какие Profile fields/Segments доступны только как current populations и как это отражается в
   receipt;
8. mock/fixture payloads для loading, empty, stale, partial, suppressed, forbidden, failed и
   result-expired.

## 5. Frontend architectural seam

Рекомендуемый модуль `src/features/reporting/` скрывает четыре интерфейса:

```ts
interface ReportingCatalogRepository {
  searchArtifacts(scope: ArtifactSearch): Promise<ArtifactPage>;
  discoverSemantics(query: SemanticCatalogQuery): Promise<SemanticCatalogPage>;
}

interface SavedReportRepository {
  createDraft(input: CreateSavedReportDraft): Promise<SavedReportDraft>;
  saveDraft(id: string, input: SaveSavedReportDraft): Promise<SavedReportDraft>;
  preview(id: string): Promise<QueryRunDescriptor>;
  publish(id: string, expectedVersion: string): Promise<SavedReportRevision>;
}

interface DashboardRepository {
  open(id: string, filters: DashboardFilters): Promise<DashboardShell>;
  createDraft(input: CreateDashboardDraft): Promise<DashboardDraft>;
  saveDraft(id: string, input: SaveDashboardDraft): Promise<DashboardDraft>;
  publish(id: string, expectedVersion: string): Promise<DashboardRevision>;
}

interface AnalyticsRunRepository {
  run(input: RunAnalyticsQuery): Promise<RunAccepted | QueryResult>;
  read(runId: string): Promise<QueryResult | RunStatus>;
  page(resultId: string, cursor?: string): Promise<QueryResultPage>;
  cancel(runId: string): Promise<void>;
}
```

Названия методов иллюстрируют границу, а не заменяют будущий generated OpenAPI. Vue-компоненты не
импортируют generated operations напрямую. Один renderer принимает bounded Chart Definition и
Query Result; выбор chart library остаётся внутри adapter.

## 6. Реалистичная готовность источников

| Source family                    | MVP presentation                                          | Gate                                          |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Event-backed Dataset             | KPI, series, category, table                              | первый Analytics Gateway/OpenAPI tracer       |
| Current Profile                  | current population/filter/breakdown с явной меткой        | backend published analytics policy            |
| Segment                          | pinned rule + current evaluation; frozen/historical позже | backend population contract                   |
| Scenario                         | effectiveness по immutable Scenario Revision              | второй owner adapter                          |
| AI Costs/Usage                   | существующие owner reports можно позднее адаптировать     | semantic publication, не client recomputation |
| Support/Conversation/Integration | только content-free committed facts                       | отдельные source contracts и Permissions      |

В UI недоступный источник не исчезает бесследно, если backend возвращает его как discoverable:
показывается причина `NOT_ANALYTICS_READY`/`NO_TEMPORAL_HISTORY`. Скрытый по authority источник не
оставляет label, count, suggestion или schema в DOM.

## 7. Следствие для декомпозиции

Первый frontend ticket обязан быть contract foundation и остаётся backend-gated. После него можно
параллельно строить библиотеку и Saved Report authoring на contract fixtures. Dashboard viewer
начинается после published report slice; Dashboard builder — после viewer/shell. Profile/Segment
populations остаются отдельной вертикалью, потому что их временная корректность — самостоятельный
backend gate, а не UI checkbox.
