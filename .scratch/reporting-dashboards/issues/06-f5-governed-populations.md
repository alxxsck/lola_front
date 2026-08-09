Part of #24. Blocked by: Saved Report vertical and backend governed population contract.

## Пользовательский результат

Автор наполняет отчёт данными Current Profile и Segment populations, понимая, что состав отражает
текущее состояние, а не историческую аудиторию на момент Event.

## Scope

- Подключить authority-filtered Profile Attribute и Segment Population catalog entries.
- Показывать stable Segment identity, pinned Revision и mode `current evaluation`.
- Показывать Profile mode `Текущее состояние на момент запроса` рядом с filter/breakdown.
- Обрабатывать compatibility errors: `NO_TEMPORAL_HISTORY`, `RESTRICTED_FIELD`,
  `DIMENSION_TOO_HIGH_CARDINALITY`, `SMALL_GROUP_SUPPRESSED`, `NOT_ANALYTICS_READY`.
- Применять server-declared allowed operations/classification; не выводить disabled hidden fields.
- Добавить compatible Dashboard global bindings для current population filters.

## Acceptance criteria

- [ ] Current Profile/Segment никогда не подписаны historical/as-of-event без соответствующего receipt.
- [ ] Segment rule Revision pinned отдельно от current membership evaluation.
- [ ] Hidden field/Segment не оставляет label, count, suggestion, schema или timing oracle.
- [ ] Restricted/high-cardinality/small-group outcomes приходят с safe stable reason и не считаются client-side.
- [ ] Project switch/revoke очищает catalog selections, results и receipts.
- [ ] Event-time population request отклоняется до backend historical projection; UI не делает fallback на current.
- [ ] Contract/component tests покрывают current, not-ready, restricted, suppressed и revoked.

## Blocked by

- #27
- External backend gate: Reporting T3 / governed Profile and Segment population OpenAPI.

## Verification

```bash
npm run api:check
npm run typecheck
npx vitest run src/features/reporting src/features/scenario-audience
```
