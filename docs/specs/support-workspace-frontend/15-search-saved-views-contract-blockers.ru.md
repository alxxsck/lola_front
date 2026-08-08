# Contract blockers: Support search и Saved Views

Дата повторной проверки: 7 августа 2026 года

Статус: **P1-блокеры Tickets 10–11 сняты; оба пункта готовы, можно проверять и брать в frontend-разработку.**

Проверенный backend `main`: `b63d8bc` (`Support Platform: complete search and system views`).

Frontend перед началом реализации должен обновить pinned OpenAPI/generated client из этого backend
checkout. Канонический статус задач по-прежнему меняется только в GitHub Issues.

## Ticket 10 — server search, filters и sort

**Готово, можно проверять и брать в разработку.**

Backend публикует typed bounded response pages для Cases, Conversations, Messages и End Users:
canonical target identity, signed cursor, freshness (`READY | BUILDING | DEGRADED`), match provenance
и typed validation/error responses.

Закрытая `CASES` grammar теперь включает:

- status, priority и waiting side;
- assignee CMS User IDs, Team IDs и `ASSIGNED | UNASSIGNED`;
- SLA state и SLA due sort;
- Queue IDs, topic и category;
- channel и language;
- `UNREAD | READ`, `HAS_DRAFT | NO_DRAFT`, `PROBLEM | HEALTHY` для delivery;
- bounded time range и exact Case/Conversation/Message/End User IDs;
- sorts `RELEVANCE`, `ACTIVITY_AT`, `PRIORITY`, `SLA_DUE_AT`, `WAITING_SINCE`,
  `UNREAD_COUNT`, `CREATED_AT` с `ASC | DESC`.

Нормализованные filters/sort входят в query hash и signed cursor. Structured Case query допускается
без phrase, но остаётся bounded; Case-only поля на других surfaces отклоняются. Exact IDs, включая
Queue IDs, owner-authorize до Search projection, поэтому denied targets не становятся existence
oracle. Search reader использует отдельную least-privilege DB identity и не читает canonical owner
tables.

Проверено: OpenAPI/DTO contracts, cursor binding, tenant/actor fences, 532 миграции на чистой БД,
20k Cases/60k Messages и 10 конкурентных Case Search readers под server timeout 1,5 с.

## Ticket 11 — Saved Views и System Views

**Готово, можно проверять и брать в разработку.**

Backend публикует typed catalog/query/mutation responses, closed Saved View draft grammar,
permissions, strong ETag, immutable published revision, typed count/freshness и Queue execution
receipt. Surface permission, Queue permission, current Queue visibility/lifecycle/READY generation и
все `filters.queueIds` revalidate fail closed при execution и Default resolution.

Authoritative System View catalog и query operations готовы для:

- `MY_ACTIVE`;
- `MY_TEAM_UNASSIGNED`;
- `ALL_CASES`;
- `ALL_CONVERSATIONS`.

`MY_ACTIVE` и `MY_TEAM_UNASSIGNED` применяют server-owned actor-relative scope set-based до
sort/keyset/`LIMIT`, затем повторно reauthorize bounded result page. `MY_TEAM_UNASSIGNED` больше не
возвращает `SUPPORT_VIEW_PRESET_NOT_READY`; `permitted` вычисляется из current permissions.

Server-owned Default View готов через
`GET/PUT /admin/projects/:projectId/support/saved-views/default`. Preference принадлежит паре
Project/CMS User, использует strong actor-bound ETag, `If-Match` и `Idempotency-Key`. Durable replay
возвращает исходный полный receipt даже после смены preference или отзыва permissions; недоступный
Saved/System View сохраняет selection, но возвращает `effectiveSelection: null` и typed reason.

Проверено: CRUD/ETag/idempotency, permission revocation, Queue visibility, degraded counts/freshness,
pre-`LIMIT` System View scope, least privilege, clean PostgreSQL migration gate и повторное
архитектурное/security/scalability ревью — P0/P1 не найдено.

## Последующие frontend handoff

### Ticket 14 — read/unread и first-unread

**Готово, можно проверять и брать в разработку.**

Backend `main` `75739a1` публикует reader-scoped durable read state/counts в inbox и authoritative
workspace, first-unread anchor, подписанную двунаправленную history pagination и monotonic ACK в
authorization-bound IAM transaction. Typed OpenAPI включает read-position operations, nested error
envelope и server high-water для ACK-ahead conflict.

Проверено: unit/OpenAPI, build, architecture, PostgreSQL/load, production health-smoke и повторные
spec/standards/architecture/security/scalability review без P0/P1.

### Ticket 15 — delivery и reconnect reconciliation

**Готово, можно проверять и брать в разработку.**

Backend `main` `0f5404f` публикует authoritative Delivery receipt в history/send/lookup/workspace,
безопасный `AdminMessaging_retryFailedDelivery` и `SupportRealtime_deliveryContract` со schema refs
для Message upsert, Translation upsert, Delivery upsert и Delivery revoke. Merge выполняется по
`generation/version/operationPrecedence`; realtime остаётся hint, а gap/reconnect всегда приводит к
bounded `SupportWorkspace_read`, который побеждает конфликтующее событие.

Проверено: 3848/3848 тестов, build/typecheck/Prisma/architecture, 533 migrations на чистой БД,
PostgreSQL lifecycle и index-backed load по 20k pending/published/dead hints без `Sort`, два
production health-профиля и повторные spec/standards/architecture/security/scalability review без
P0/P1.
