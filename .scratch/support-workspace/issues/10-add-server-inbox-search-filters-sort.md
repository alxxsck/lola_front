# 10 — Добавить server search, filters и sort

**What to build:** Оператор находит Cases, Conversations, сообщения и пользователей через опубликованные search projections, не фильтруя локально неполную страницу.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** ready-for-agent

**Execution gate:** реализация заблокирована опубликованными контрактами;
условия снятия блокировки зафиксированы в
[contract gate](../../../docs/specs/support-workspace-frontend/15-search-saved-views-contract-blockers.ru.md#ticket-10--server-search-filters-и-sort).

- [ ] URL хранит нормализованные shareable query/filter/sort параметры.
- [ ] Search поддерживает разрешённые scopes и не раскрывает hidden targets.
- [ ] Filter/sort отправляются серверу вместе с cursor и не применяются к одной загруженной странице.
- [ ] Быстрая смена query отменяет или игнорирует stale responses.
- [ ] Empty, no-results, degraded index и validation errors имеют отдельные состояния.
- [ ] Keyboard search и возврат к inbox selection работают без pointer.
