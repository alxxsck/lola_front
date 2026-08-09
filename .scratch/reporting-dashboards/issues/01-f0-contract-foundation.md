Part of #24.

## Пользовательский результат

Раздел Reporting получает надёжный frontend seam: route и действия fail-closed по реальным
Permissions, а дальнейшие экраны могут разрабатываться на contract fixtures и переключаться на API
без переписывания компонентов.

## Backend gate

До real-API acceptance в backend `main` должны быть merged и опубликованы в OpenAPI Analytics
Gateway, Saved Report и Dashboard contracts. Текущий pinned frontend OpenAPI этих операций не
содержит. Незакоммиченные backend docs/DTO gate не снимают.

## Scope

- Синхронизировать pinned OpenAPI и regenerated client после merge backend contracts.
- Добавить exact reporting Permission codes и helpers; не проверять role names.
- Создать `src/features/reporting/api` adapters для catalog, Saved Reports, Dashboards и runs/results.
- Зафиксировать domain-shaped repository interfaces и API/mock parity.
- Добавить contract fixtures: sync result, async queued/running/complete, empty, stale, partial,
  suppressed, forbidden, failed, expired и OCC conflict.
- Реализовать run coordinator contract: max concurrency, cancel obsolete work, polling/reconcile и
  Project/artifact/filter generation.
- Добавить feature-flagged route skeleton и navigation guard без production authoring UI.
- Изолировать будущий chart implementation за `ReportingChartRenderer`; использовать существующие
  chart/theme tokens.

## Acceptance criteria

- [ ] Generated operations импортируются только из reporting API adapters.
- [ ] Route и navigation скрыты без aggregate read Permission; direct URL fail-closed.
- [ ] Permission revoke/logout/Project switch abort requests и очищают scoped results/drafts.
- [ ] Late response старого Project/artifact/filter generation не коммитится.
- [ ] Sync result и `202` async lifecycle приводятся к одному typed frontend state machine.
- [ ] Resource Receipt, stable errors, cursor identity и allowed actions типизированы без local DTO drift.
- [ ] Existing End User Event Query/Event Logs/Profile APIs не используются как Dashboard backend.
- [ ] Contract tests краснеют при OpenAPI drift route prefix, DONUT kind или Saved Report permissions.
- [ ] Mock и API repositories проходят одинаковый conformance suite.

## Relevant seams

- `src/features/auth/permission-access.ts`
- `src/app/router.ts`
- `src/widgets/layout/AppShell.vue`
- `src/shared/api/generated/retenive-backend.ts`
- новый `src/features/reporting/`

## Verification

```bash
npm run api:check
npm run typecheck
npx vitest run src/features/reporting src/features/auth src/app/router.test.ts
```
