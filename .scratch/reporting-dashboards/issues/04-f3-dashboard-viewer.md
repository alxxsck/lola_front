Part of #24. Blocked by: artifact library and published Saved Report vertical.

## Пользовательский результат

CMS User открывает Dashboard и быстро получает первый полезный ответ: shell и filters появляются
сразу, видимые Widgets догружаются приоритетно, а скрытые не создают лишнюю нагрузку.

## Scope

- Реализовать `/dashboards/:dashboardId` и shell-first Dashboard rendering.
- Отобразить title, lifecycle/revision, tabs/pages, global filters и Widget descriptors до data.
- Загружать above-the-fold first, below-viewport через `IntersectionObserver`, hidden tabs — после activation.
- Ограничить browser analytical concurrency ориентиром четыре active runs; отменять obsolete work.
- Реализовать explicit `Применить` для filters и compatibility summary `N из M`.
- Отобразить Widget states, Evidence rail, `Открыть отчёт`, `Объяснить`, `Обновить`.
- Собрать responsive viewer: desktop composition и mobile read-only stack.

## Acceptance criteria

- [ ] Dashboard shell видим до Widget data и не блокируется самым медленным Widget.
- [ ] 12 visible Widgets соблюдают concurrency budget; duplicate query descriptors не дублируют cold work.
- [ ] 50 Widgets в hidden tabs не становятся 50 initial runs.
- [ ] Navigation/filter/Project change отменяет obsolete work; late results не коммитятся.
- [ ] Filter применяется только к typed bindings; incompatible Widget показывает server reason.
- [ ] stale/partial/suppressed/forbidden/error одного Widget не ломает остальные.
- [ ] Первый широкий Widget остаётся focal point; layout не превращается в сетку равных KPI cards.
- [ ] Viewer доступен с keyboard/screen reader на 1440/1024/390/320, light/dark и reduced motion.

## Blocked by

- #26
- #27

## Verification

```bash
npm run typecheck
npx vitest run src/features/reporting
npm run test:e2e -- --grep "dashboard viewer"
```
