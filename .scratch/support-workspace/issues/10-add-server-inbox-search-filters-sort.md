# 10 — Добавить server search, filters и sort

**What to build:** Оператор находит Cases, Conversations, сообщения и пользователей через опубликованные search projections, не фильтруя локально неполную страницу.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** blocked-contract

**Contract audit (2026-08-07):** pinned OpenAPI
`sha256:75b825f98afe9306678964691841029e36bb293a5846354b3e3651d5409c002b`
publishes only the `SupportSearchQueryDto` request. Responses for
`SupportSearch_cases`, `SupportSearch_conversations` and
`SupportSearch_messages` have no schema, so the generated client returns
`void`. The current backend checkout (`c8948779d9d5ef4fb1421a5ac416768782dd8647`)
still has description-only `@ApiOkResponse` decorators and therefore does not
close this transport gap.

**Unblock condition:** backend publishes typed, bounded result pages for every
allowed search scope, including canonical target identity, cursor,
freshness/degraded state and typed validation/error responses; frontend then
repins OpenAPI and regenerates the client. Until that happens the UI must not
invent response DTOs, filter an incomplete page locally or reveal targets
through fallback owner reads.

- [ ] URL хранит нормализованные shareable query/filter/sort параметры.
- [ ] Search поддерживает разрешённые scopes и не раскрывает hidden targets.
- [ ] Filter/sort отправляются серверу вместе с cursor и не применяются к одной загруженной странице.
- [ ] Быстрая смена query отменяет или игнорирует stale responses.
- [ ] Empty, no-results, degraded index и validation errors имеют отдельные состояния.
- [ ] Keyboard search и возврат к inbox selection работают без pointer.
