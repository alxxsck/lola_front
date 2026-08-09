## Цель

Поставить отдельный Project-scoped раздел «Отчёты», в котором авторизованный CMS User создаёт
governed Saved Reports и собирает из них versioned Dashboards без SQL, arbitrary JSON paths и
client-side агрегирования.

## Источники истины

- `docs/specs/reporting-and-dashboards-frontend-mvp.ru.md`
- `docs/research/reporting-frontend-discovery-2026-08-09.ru.md`
- `docs/research/reporting-backend-discovery.md`
- `CONTEXT.md`
- Backend target model: `Lola_backend/docs/specs/reporting-and-dashboards-platform.ru.md`

## Принципы

- Frontend использует effective Permission codes и server-provided allowed actions, никогда имена ролей.
- Saved Report — самостоятельный versioned artifact; Dashboard компонуется из опубликованных Saved Reports.
- Query Result и Resource Receipt приходят с backend; browser не считает totals, freshness или exactness.
- Event-backed Dataset — первый source. Current Profile/Segment populations подключаются только через явный published contract.
- Published Revisions immutable; authoring работает через Draft + OCC.
- Dashboard shell загружается до Widgets; hidden tabs и below-viewport Widgets не исполняются eager.
- `/overview` остаётся фиксированным Project overview.

## Завершение эпика

- Permission-gated library, Saved Report builder/viewer и Dashboard builder/viewer работают на merged OpenAPI.
- KPI/line/bar/table и contract-approved low-cardinality donut имеют accessible summary и Evidence rail.
- 12 видимых Widgets соблюдают concurrency budget; 50 Widgets в hidden tabs не создают 50 initial runs.
- Profile/Segment current semantics показана явно и никогда не маркируется historical.
- Revoke, logout и Project switch очищают scoped results/drafts и не допускают late commit.
- 1440×1000, 1024×768, 390×844 и 320×568 проходят light/dark, keyboard и visual QA.

## Дочерние задачи

- [ ] #25 — F0 contract foundation; external backend OpenAPI gate
- [ ] #26 — F1 artifact library; blocked by #25
- [ ] #27 — F2 Event-backed Saved Report; blocked by #25 + backend T1
- [ ] #28 — F3 Dashboard viewer; blocked by #26, #27
- [ ] #29 — F4 Dashboard authoring; blocked by #28
- [ ] #30 — F5 governed Profile/Segment populations; blocked by #27 + backend T3
- [ ] #31 — F6 hardening and rollout; blocked by #26–#30

Работать blockers-first. Стартовый frontend frontier — #25 после появления merged backend
Analytics Gateway/Saved Report/Dashboard contracts в pinned OpenAPI.

```text
#25 F0
├── #26 F1
└── #27 F2
    ├── #28 F3 → #29 F4
    └── #30 F5
#26–#30 → #31 F6
```
