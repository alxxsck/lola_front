# Reporting & Dashboards: frontend tickets

Дата публикации: 2026-08-09
Epic: [#24 — Governed Saved Reports and Dashboards MVP](https://github.com/alxxsck/lola_front/issues/24)

## Источники

- [Frontend MVP specification](./reporting-and-dashboards-frontend-mvp.ru.md)
- [Frontend discovery](../research/reporting-frontend-discovery-2026-08-09.ru.md)
- [Backend contract audit](../research/reporting-backend-discovery.md)
- [Domain language](../../CONTEXT.md)

## Agent-ready задачи

| Slice                    | GitHub Issue                                           | Native blockers | External backend gate                               |
| ------------------------ | ------------------------------------------------------ | --------------- | --------------------------------------------------- |
| F0 Contract foundation   | [#25](https://github.com/alxxsck/lola_front/issues/25) | —               | Analytics Gateway, Saved Report и Dashboard OpenAPI |
| F1 Artifact library      | [#26](https://github.com/alxxsck/lola_front/issues/26) | #25             | —                                                   |
| F2 Saved Report vertical | [#27](https://github.com/alxxsck/lola_front/issues/27) | #25             | Event-backed Saved Report tracer / backend T1       |
| F3 Dashboard viewing     | [#28](https://github.com/alxxsck/lola_front/issues/28) | #26, #27        | Dashboard shell/run descriptors                     |
| F4 Dashboard authoring   | [#29](https://github.com/alxxsck/lola_front/issues/29) | #28             | Dashboard Draft/Revision commands                   |
| F5 Governed populations  | [#30](https://github.com/alxxsck/lola_front/issues/30) | #27             | Profile/Segment population contract / backend T3    |
| F6 Hardening and rollout | [#31](https://github.com/alxxsck/lola_front/issues/31) | #26–#30         | real-API pilot environment                          |

Все семь Issues добавлены в #24 как GitHub sub-issues. Внутренние frontend зависимости созданы как
native `blocked_by` edges; внешние backend gates оставлены в body, потому что они относятся к
другому repository и пока не имеют опубликованных backend issue numbers.

## Frontier

Backend execution slice завершён в `alxxsck/lola_back` ветке
`codex/reporting-dashboards-backend` коммитом `9afc91e5`, но #25 real-API acceptance остаётся
закрыт: ветка публикует Nest gateways, а не HTTP controllers/DTO/OpenAPI operations, и расходится с
backend revision, на которой закреплён текущий frontend OpenAPI. Точный handoff зафиксирован в
[контексте backend-коммита](../handoffs/reporting-backend-9afc91e5-frontend-context.ru.md).

До появления merged OpenAPI frontend работает только через isolated mock repository. Из backend
контракта уже приняты безопасные runtime-инварианты: data-free Dashboard shell, 2 полных дня по
умолчанию, явный 7-day run и activation batches максимум по 6 видимых Widgets.
