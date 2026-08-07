# 10 — Добавить server search, filters и sort

**What to build:** Оператор находит Cases, Conversations, сообщения и пользователей через опубликованные search projections, не фильтруя локально неполную страницу.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** complete

**Backend gate (audit 2026-08-07):** полный blocker — response schemas, Users search и
closed filter/sort grammar не опубликованы. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#10--server-search-filters-и-sort).

**Execution gate:** реализация заблокирована опубликованными контрактами;
условия снятия блокировки зафиксированы в
[contract gate](../../../docs/specs/support-workspace-frontend/15-search-saved-views-contract-blockers.ru.md#ticket-10--server-search-filters-и-sort).

- [x] URL хранит нормализованные shareable scope/filter/sort параметры; free-text и
  raw external user ID остаются memory-only по запрету PII из master-spec.
- [x] Search поддерживает разрешённые scopes и не раскрывает hidden targets.
- [x] Filter/sort отправляются серверу вместе с cursor и не применяются к одной загруженной странице.
- [x] Быстрая смена query отменяет или игнорирует stale responses.
- [x] Empty, no-results, degraded index и validation errors имеют отдельные состояния.
- [x] Keyboard search и возврат к inbox selection работают без pointer.
