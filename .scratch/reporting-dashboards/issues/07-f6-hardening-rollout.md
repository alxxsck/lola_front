Part of #24. Blocked by: artifact library, Saved Report, Dashboard viewer/authoring and governed populations.

## Пользовательский результат

Reporting MVP можно включить для pilot Projects без permission leaks, overload, inaccessible charts
или невозможности безопасно отключить новый раздел.

## Scope

- Добавить full contract/API/browser regression на real backend.
- Проверить 12-visible/50-total Widget fixtures, cancel/coalescing и first-useful-render budget.
- Провести revoke/logout/Project switch/result expiry/OCC conflict recovery matrix.
- Провести accessibility и visual QA: 1440×1000, 1024×768, 390×844, 320×568, light/dark,
  200% text, keyboard, screen reader и reduced motion.
- Проверить no-horizontal-overflow, skeleton geometry, empty/stale/partial/suppressed/forbidden/error.
- Добавить Project capability/feature flag, pilot telemetry, safe rollback и release evidence.
- Обновить пользовательскую документацию раздела `Отчёты`.

## Acceptance criteria

- [ ] No critical axe violations; все Widgets имеют accessible title/value/summary/unit/period/status.
- [ ] 50 total Widgets не исполняются eager; visible run budget и cancel assertions стабильны.
- [ ] Permission revoke и Project switch удаляют sensitive schemas/results из DOM/cache до следующего paint.
- [ ] No stale cross-Project commit после navigation/reconnect/retry.
- [ ] Empty/stale/partial/suppressed/forbidden/error не маскируются одинаковым generic state.
- [ ] Pilot feature flag отключает routes/navigation/runs без миграции artifact data назад.
- [ ] Typecheck, unit/component, API e2e, browser visual/accessibility и contract checks проходят.
- [ ] Release evidence и rollback runbook зафиксированы в docs.

## Blocked by

- #26
- #27
- #28
- #29
- #30

## Verification

```bash
npm run api:check
npm run typecheck
npm test
npm run test:e2e -- --grep "reports|dashboard"
npm run test:e2e:api -- --grep "reports|dashboard"
```
