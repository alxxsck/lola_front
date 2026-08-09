Part of #24. Blocked by: F0 contract foundation.

## Пользовательский результат

CMS User открывает один раздел «Отчёты», быстро находит Dashboard или Saved Report и видит только те
artifacts и действия, которые разрешены в текущем Project.

## Scope

- Добавить permission-gated sidebar item `Отчёты` и route `/reports`.
- Реализовать tabs `Дашборды` / `Сохранённые отчёты`, authority-filtered search и Collection filter.
- Показывать title, owner/Artifact Space, lifecycle, updated time и safe freshness/error status.
- Синхронизировать safe search/filter/tab state с URL и сбрасывать его при Project switch.
- Добавить loading, empty, forbidden-safe и retry states.
- Не исполнять Widget queries для catalog cards; использовать только server-provided summaries.

## Acceptance criteria

- [ ] CMS User без read Permission не видит route, counts, suggestions или artifact metadata.
- [ ] Search/facets/counts приходят уже authority-filtered и не выводятся из клиентского списка.
- [ ] Draft/Published/Archived и Personal/Team/Project различимы текстом, не только цветом.
- [ ] Empty state ведёт к первому Saved Report, а не в blank Dashboard canvas.
- [ ] Catalog cards не запускают analytical runs при render/scroll.
- [ ] Project switch отменяет запрос, очищает selection и не показывает старый Project.
- [ ] Keyboard tab/search/list flow и 320px layout не имеют horizontal overflow.
- [ ] Component/router tests покрывают read-only, author, empty, error и revoke.

## Blocked by

- #25

## Verification

```bash
npm run typecheck
npx vitest run src/features/reporting src/widgets/layout/AppShell.test.ts src/app/router.test.ts
```
