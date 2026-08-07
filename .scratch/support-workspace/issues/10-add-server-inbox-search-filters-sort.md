# 10 — Добавить server search, filters и sort

**What to build:** Оператор находит Cases, Conversations, сообщения и пользователей через опубликованные search projections, не фильтруя локально неполную страницу.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** blocked-by-backend

**Backend gate (audit 2026-08-07):** полный blocker — response schemas, Users search и
closed filter/sort grammar не опубликованы. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#10--server-search-filters-и-sort).

**Execution gate:** реализация заблокирована опубликованными контрактами;
условия снятия блокировки зафиксированы в
[contract gate](../../../docs/specs/support-workspace-frontend/15-search-saved-views-contract-blockers.ru.md#ticket-10--server-search-filters-и-sort).

- [ ] URL хранит нормализованные shareable query/filter/sort параметры.
- [ ] Search поддерживает разрешённые scopes и не раскрывает hidden targets.
- [ ] Filter/sort отправляются серверу вместе с cursor и не применяются к одной загруженной странице.
- [ ] Быстрая смена query отменяет или игнорирует stale responses.
- [ ] Empty, no-results, degraded index и validation errors имеют отдельные состояния.
- [ ] Keyboard search и возврат к inbox selection работают без pointer.
