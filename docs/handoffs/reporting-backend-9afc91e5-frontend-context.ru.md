# Reporting backend `9afc91e5`: frontend handoff

Дата проверки: 2026-08-10

Backend: `alxxsck/lola_back`, ветка `codex/reporting-dashboards-backend`

Коммит: `9afc91e541985dc79090ec268cf36565e2c7e32a`

## Что готово на backend

- PostgreSQL-first Analytics Query, Saved Report и Dashboard gateways;
- data-free Dashboard shell и явная активация только выбранных/видимых Widgets;
- один activation batch максимум из 6 Widgets;
- relative Saved Report range `LAST_COMPLETE_DAYS`: по умолчанию 2 полных Project days,
  `periodDays: 7` и другие периоды передаются явно;
- Draft OCC, immutable published revisions, pinned query/report definitions и Resource Receipts;
- readiness worker работает независимо от открытия Dashboard и читает возобновляемые страницы не
  более 256 строк;
- удаление End User Profile сохраняет исторические Reporting events и aggregates; destructive
  privacy worker не скомпонован;
- production envelope подтверждён на PostgreSQL для 10M/100M logical source volumes, 117 120
  rollup rows, 10 одновременных CMS Users и Project fairness.

## Что frontend уже принял

- Dashboard viewer не загружает catalog всех Saved Reports: shell содержит immutable Widget
  presentation snapshot и pins;
- catalog Saved Reports запрашивается только в Dashboard editor;
- Widget execution проходит через отдельный Dashboard activation repository seam, а не через
  прямой запуск Saved Report query из компонента;
- период открытия — 2 полных дня; 7/30/90 дней применяются явно;
- frontend coordinator допускает максимум 6 активных activation requests и сохраняет
  generation/cancellation/coalescing guards;
- readiness не блокирует route или shell, а profile deletion не запускает frontend purge
  исторической статистики.

## Точный integration gap

В коммите нет Reporting/Dashboard HTTP controllers, request/response DTO и Swagger decorators.
`DashboardModule`, `ReportingModule`, `DashboardGateway`, `SavedReportGateway` и
`AnalyticsQueryGateway` доступны только как Nest module seams. Поэтому экспортированный OpenAPI не
содержит Reporting paths, а frontend не может честно сгенерировать API client/adapters.

Дополнительно backend-ветка расходится с revision `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`,
на которой закреплён текущий frontend OpenAPI: между ними 48 Reporting commits с одной стороны и 7
последующих backend-main commits с другой. Синхронизация frontend snapshot напрямую из этой ветки
откатила бы уже принятые Support contracts.

## Условие снятия F0 gate

1. Rebase/merge Reporting backend branch на актуальный backend `main`.
2. Опубликовать project-scoped HTTP controllers и закрытые OpenAPI DTO для semantic catalog,
   Saved Report lifecycle/run/result/table page и Dashboard catalog/shell/activation/result.
3. Добавить stable operation IDs, error schemas и allowed actions/Permission codes в OpenAPI.
4. После merge синхронизировать pinned frontend OpenAPI, сгенерировать client и заменить
   fail-closed API repository реальными adapters с mock/API conformance suite.

До выполнения этих пунктов production API mode намеренно остаётся fail-closed; mock MVP не
выдаётся за real-backend integration.
