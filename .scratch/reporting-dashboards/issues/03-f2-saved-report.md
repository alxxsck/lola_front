Part of #24. Blocked by: F0 contract foundation and backend Event-backed Saved Report tracer.

## Пользовательский результат

Автор собирает первый Event-backed Saved Report через governed fields, проверяет результат и его
происхождение, затем публикует immutable revision с KPI, trend или detail table.

## Scope

- Реализовать Saved Report Draft/view routes и двухколоночный desktop workbench.
- Builder flow: Dataset → Population → Metric → range/grain → breakdown/filter → preview → chart.
- Использовать authority-filtered semantic catalog и server compatibility/estimate; не показывать SQL/JSON paths.
- Реализовать explicit preview/run, cancel obsolete preview, Draft autosave/OCC и Publish.
- Добавить `ReportingChartRenderer` для contract-approved KPI, line, bar и table; DONUT только после
  canonical OpenAPI kind и low-cardinality policy.
- Добавить Evidence rail: period, timezone, dataAsOf, completeness, exactness, exclusions + `Объяснить`.
- Добавить cursor-paginated table и accessible text summary.

## Acceptance criteria

- [ ] Event-backed report создаётся и публикуется без local aggregation/raw EventLog scan.
- [ ] Publish pin-ит Query/Chart/semantic revisions; edit published создаёт/продолжает Draft.
- [ ] OCC conflict сохраняет local work и не перезаписывает server revision.
- [ ] Money не суммируется между currencies без published FX semantics.
- [ ] `occurredAt`/`receivedAt`, range, grain и Project timezone показаны по server definition.
- [ ] loading/queued/empty/stale/partial/suppressed/forbidden/failed/expired различимы.
- [ ] Forbidden result удаляет previous schema/series/rows/receipt из DOM и scoped cache.
- [ ] KPI/line/bar/table имеют screen-reader summary; table использует server cursor/totals.
- [ ] Current Profile/Segment historical semantics не эмулируются в этом ticket.
- [ ] Component/API browser tests покрывают Draft → preview → publish → reopen.

## Blocked by

- #25
- External backend gate: Reporting T1 / published Event-backed Saved Report OpenAPI.

## Verification

```bash
npm run typecheck
npx vitest run src/features/reporting
npm run test:e2e -- --grep "saved report"
```
