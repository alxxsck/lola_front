# Backend-блокеры Support Workspace для frontend-задач 01–33

Дата аудита: 7 августа 2026 года  
Проверенный backend ref: `origin/main`  
Backend commit: `0ca33c93e52d689de388187091e6aa2f6c05639b`  
Commit time: `2026-08-07T11:10:25+02:00`  
Экспортированный OpenAPI SHA-256: `31e46b0da494a6a483b18f0903d37c0c65fb6e38726246d7eaf3096d100d789f`  
OpenAPI: `3.0.0`, 471 path, 539 operation.

## Как проверялось

1. Выполнен свежий `git fetch origin main` в `/Users/alxxsck/Documents/Lola_backend`.
2. Создан отдельный detached worktree от `origin/main`, чтобы не переключать и не изменять
   пользовательскую `develop`-ветку.
3. В worktree выполнены `prisma generate`, TypeScript-компиляция и штатный
   `scripts/export-openapi.mjs`; итоговый JSON ниже проверен по SHA и числу operations.
4. Каждая frontend-задача из
   `.scratch/support-workspace/issues/01-...33-...md` проверена против экспортированного
   OpenAPI, controller/DTO-кода и нормативных backend-спек ровно на указанном commit.

Текущий frontend pin
`openapi/retenive-backend.json` имеет SHA-256
`75b825f98afe9306678964691841029e36bb293a5846354b3e3651d5409c002b`.
Raw SHA свежего backend export отличается из-за порядка JSON-ключей. Canonical drift-check
подтвердил полное семантическое совпадение operations/schemas с pinned artifact; повторная
generation не дала contract diff. Frontend metadata закреплена на backend source revision выше.

Статусы ниже означают:

- **нет backend-блокера** — точный ticket можно завершить на опубликованном контракте;
- **частичный блокер** — часть ticket можно делать, но хотя бы один acceptance criterion требует
  отсутствующий server-owned контракт;
- **полный блокер** — безопасную production-реализацию основной функции ticket нельзя начать без
  нового опубликованного контракта.

Backend-документ или реализованный внутренний domain service не считается frontend-контрактом,
если операция/response schema/authority не опубликованы в OpenAPI. Особенно это касается browser
notifications и External Work.

## Оперативные обновления после аудита

Историческая карта ниже зафиксирована на backend commit `0ca33c9`. Готовность уже снятых блокеров
учитывается по обновлениям в этом разделе.

### 10 — Server search, filters и sort

**Сделано на backend `main`:** `9da7bc9` (`Support Platform: complete search and saved view contracts`).
Опубликован typed server-side search/filter/sort contract с project-scoped authority. **Блокер снят;
можно проверять и брать задачу 10 в работу.**

### 11 — Saved Views

**Сделано на backend `main`:** `9da7bc9` (`Support Platform: complete search and saved view contracts`).
Опубликованы typed Saved Views contracts, включая preset catalog, counts и freshness semantics.
**Блокер снят; можно проверять и брать задачу 11 в работу.**

### 13 — Durable send и idempotency recovery

**Сделано на backend `main`:** `3791c37` (`Support Platform: complete durable send recovery
contract`). Опубликован `AdminMessaging_lookupOutcome`: lookup по исходному `Idempotency-Key`
изолирован по actor, Project и End User, возвращает persisted message с актуальным delivery receipt,
имеет typed `200/400/403/404`, `Cache-Control: no-store` и не раскрывает существование результата
из другого scope. Typed `409 IDEMPOTENCY_KEY_REUSED` закреплён в OpenAPI для безопасного сохранения
draft. **Блокер снят; можно проверять и брать задачу 13 в работу.**

**Frontend завершён:** Task 13 реализован на pin backend `3791c37`, включая
lookup-before-retry, tab-scoped recovery после reload, compact Conversation
Surface states и e2e без дублирования Message.

## Итоговая карта

Сводно: **12** задач не имеют прямого backend-блокера, **10** имеют полный blocker,
**9** — частичный прямой blocker, ещё **2** (28–29) заблокированы транзитивно через core.

| № | Задача | Backend-статус | Что именно мешает полному завершению |
|---:|---|---|---|
| 01 | Workspace/messaging contract sync | Нет | Pin и source revision проверены на свежем main |
| 02 | Inbox/Case/workforce contract sync | Нет | Pinned contract семантически совпадает со свежим main |
| 03 | Content/Lead/notifications contract sync | Нет | Sync может честно отметить отсутствующие vertical как unpublished |
| 04 | Shared Conversation Surface | Нет | Frontend architecture |
| 05 | Users migration | Нет | Существующие Conversation/translation/AI suspension операции опубликованы |
| 06 | Support migration | Нет | Workspace/history/send capabilities опубликованы |
| 07 | Remove legacy duplicates | Нет | Frontend cutover |
| 08 | Full-tab shell | Нет | Frontend presentation |
| 09 | Unified Case/Conversation inbox | Нет | `SupportWorkspace_read` публикует оба режима и selection |
| 10 | Search/filters/sort | Нет (снят `9da7bc9`) | Typed surface-specific search опубликован |
| 11 | Saved Views | Нет (снят `9da7bc9`) | Typed Saved Views/presets/count/freshness опубликованы |
| 12 | Responsive route stack | Нет | Frontend routing/layout |
| 13 | Durable send/idempotency recovery | Нет (снят `3791c37`); frontend complete | `AdminMessaging_lookupOutcome` опубликован и подключён |
| 14 | Read/unread/first-unread | Нет (снят `75739a1`) | Reader-scoped read state и monotonic ACK опубликованы |
| 15 | Delivery/reconnect reconciliation | Нет (снят `0f5404f`) | Lookup/retry и полный typed realtime contract опубликованы |
| 16 | Case workflow/classification | Нет (снят `2113c99`) | Полный server-owned workflow/classification contract опубликован |
| 17 | Operator assignment actions | **Частичный** | Нет Case-scoped eligible Team/operator targets и typed offer errors |
| 18 | Lead assignment overrides | **Частичный** | Нет eligible targets, explicit override action, bulk receipt и outcome lookup |
| 19 | SLA/routing/availability context | **Частичный** | Нет selected-Case clocks, current routing reason/reservation и live load projection |
| 20 | Sensitive inspector tabs | Нет прямого; наследует 16 | Нужные profile/event/activity reads опубликованы; Case mutations ждут 16 |
| 21 | Viewers/typing/collision | **Полный** | Нет operator watch/viewer/typing TTL/generation contract |
| 22 | Internal-note composer | **Частичный** | Нет Case-scoped note actions, reason catalog и typed conflict/lifecycle errors |
| 23 | Public/note attachments | **Полный** | Нет upload/scan/grant/attachment-send контрактов |
| 24 | Support Macros | **Частичный** | Нет полного preview/history/rollback и typed failure/provenance read contract |
| 25 | Support Internal Knowledge | **Частичный** | Нет document revision rollback и отдельного Knowledge retention/rollout contract |
| 26 | Lead Control | **Частичный** | Capacity/routing недоступны; owner/assignment target catalogs и drill-down search отсутствуют |
| 27 | Browser notification settings | **Полный** | Нет browser preference/subscription/device/deep-link API в main |
| 28 | Legacy entry-point cutover | **Частичный, транзитивный** | Core cutover ждёт незакрытые backend gaps 10–19; нет project shell rollout contract |
| 29 | Pilot/rollback hardening | **Частичный, транзитивный** | Pilot ждёт core cutover и typed project rollout/admission |
| 30 | JSM/HelpDesk contract sync | **Полный** | External Work существует только как нормативная спека, API отсутствует |
| 31 | Integration Settings/External Work | **Полный** | Нет connection/catalog/mapping/inbox/receipt APIs |
| 32 | Case External Work actions | **Полный** | Нет Case link/create/comment/unlink/lookup APIs |
| 33 | Support Quality/Analytics | **Полный** | Нет QA/IAM/scorecard/analytics metric contracts |

## По каждой задаче

### 01 — Синхронизировать workspace и messaging-контракты

**Статус: нет backend-блокера.**

Backend публикует `SupportWorkspace_read`, `AdminMessaging_send`,
`AdminConversations_listMessages`, message ordinal/author snapshot и
`AdminMessageDeliveryResponseDto`. Сам ticket является контрактным аудитом и должен фиксировать
неопубликованные функции, а не реализовывать их.

Что может frontend сейчас: повторно pin OpenAPI с main, перегенерировать client и обновить fixtures.
Отсутствующие lookup/read-state contracts относятся к задачам 13–15, а не блокируют честное
завершение задачи 01.

Evidence: `src/composition/support-workspace/support-workspace.controller.ts`,
`src/modules/chat/admin-messaging.controller.ts`,
`docs/specs/support-platform/03-durable-conversation-delivery.ru.md` на backend commit выше.

### 02 — Синхронизировать inbox, Case и workforce-контракты

**Статус: нет backend-блокера.**

Опубликованы workspace modes, Case operations, workforce, assignment, queues, routing, SLA и
availability. Capability matrix может и должна пометить неполные slices как `NOT_PUBLISHED`.

Что может frontend сейчас: обновить pin, generated client, contract fixtures и перечислить exact
gaps задач 10–11 и 16–19.

Evidence: `SupportWorkspace_read`, `EndUserCases_*`, `SupportWorkforce_*`,
`SupportCaseAssignment_*`, `SupportQueue_*`, `SupportRouting*`, `SupportSla*`,
`SupportOperatorAvailability_*`.

### 03 — Синхронизировать content, Lead Control и notification-контракты

**Статус: нет backend-блокера у sync-ticket.**

Notes, Macros, Internal Knowledge, Lead и Alerts опубликованы. Personal browser notifications в
main не опубликованы, но задача 03 может завершиться с честным `NOT_PUBLISHED` marker.

Что может frontend сейчас: синхронизировать опубликованные content/lead schemas и оставить browser
vertical выключенной до задачи 27.

Evidence: `SupportInternalNote_*`, `SupportMacro_*`, `SupportInternalKnowledge_*`,
`SupportLead_*`, `SupportOperationalAlert_*`; browser spec —
`docs/specs/support-platform/20-personal-browser-notifications.ru.md`, статус самой backend-задачи —
`.scratch/support-platform/issues/20a-support-personal-browser-notifications-backend.md`
(`ready-for-agent`, не published API).

### 04 — Общий Conversation Surface

**Статус: нет backend-блокера.** Это frontend module/interface work. Published message history,
translation and composer capabilities достаточны для shared adapter boundary.

Что может frontend сейчас: реализовать и тестировать общий renderer/composer без нового endpoint.

### 05 — Миграция Users chat

**Статус: нет backend-блокера.** Опубликованы `AdminConversations_list/get/listMessages`,
Conversation Translation, Reply Translation Draft и Conversation AI Suspension.

Что может frontend сейчас: полностью перевести Users на shared surface.

### 06 — Миграция Support chat

**Статус: нет backend-блокера.** `SupportWorkspace_read(SELECTION)` возвращает Conversation,
messages, capabilities, action revisions и checkpoint; `AdminMessaging_send` даёт durable send.

Что может frontend сейчас: полностью подключить Support adapter. Unknown-outcome lookup остаётся
отдельным ограничением задачи 13.

### 07 — Удаление legacy renderer/composer/translation

**Статус: нет backend-блокера.** Это expand-contract cleanup frontend-кода.

Что может frontend сейчас: удалить duplicates после shared behavior proof.

### 08 — Full-tab shell

**Статус: нет backend-блокера.** Viewport, inert background, focus, animation и safe areas —
frontend presentation concerns.

Что может frontend сейчас: полностью реализовать и проверить shell.

### 09 — Единый Case/Conversation inbox

**Статус: нет backend-блокера.** `SupportWorkspace_read` имеет typed modes `CASES`,
`ALL_CONVERSATIONS`, `SELECTION`, cursor pages и canonical IDs.

Что может frontend сейчас: полностью реализовать два режима inbox и deep links. Нельзя добавлять в
row отсутствующие unread/SLA/assignment fields, но они не нужны для уже зафиксированного safe-row
acceptance задачи 09.

Evidence: `SupportWorkspaceCasesPageResponseDto`,
`SupportWorkspaceConversationsPageResponseDto`, `SupportWorkspaceSelectionResponseDto`.

### 10 — Server search, filters и sort

**Статус: полный backend-блокер.**

Не хватает:

- response schemas у `SupportSearch_cases`, `SupportSearch_conversations`,
  `SupportSearch_messages` — в OpenAPI есть только description, generated client получает `void`;
- `SupportSearch_users` или эквивалентной permission-safe Users projection;
- closed Case filter/sort grammar, необходимой ticket; текущий `SupportSearchQueryDto` содержит
  phrase, IDs, time range, roles и languages, но не status/priority/assignment/SLA sort;
- typed freshness/degraded/validation/not-found-or-forbidden results и cursor binding к
  нормализованному query.

Что может frontend сейчас: сделать URL normalization и disabled/loading shell под feature gate,
но нельзя показывать результаты, локально фильтровать одну inbox page или использовать profile list
как замену Support user search.

Evidence: `src/composition/support-workspace/support-search.controller.ts`, операции
`SupportSearch_cases/conversations/messages`; в свежем OpenAPI у всех трёх `200` без
`content.application/json.schema`, пути `/support/search/users` нет.

### 11 — Saved Views

**Статус: полный backend-блокер.**

У `SavedSupportView_catalog/create/replace/publish/archive/query` и
`SupportViewPreset_query` отсутствуют success response schemas. Поэтому нет опубликованных view ID,
scope, owner/permission, revision/ETag receipt, normalized query, count, freshness и authoritative
query page. Также нет typed catalog системных presets и закрытой draft grammar.

Что может frontend сейчас: только navigation placeholder/feature gate. Нельзя хранить
Project-scoped Saved View truth в local storage или выдумывать System Views.

Evidence: `src/composition/support-workspace/saved-support-view.controller.ts`; свежий OpenAPI:
success responses указанных операций не имеют schema.

### 12 — Tablet/mobile route stack

**Статус: нет backend-блокера.** Canonical Case/Conversation IDs уже опубликованы; route stack,
Back, focus, scroll/draft anchor и responsive layout принадлежат frontend.

Что может frontend сейчас: полностью завершить ticket.

### 13 — Durable send и idempotency recovery

**Актуальный статус: backend-блокер снят, frontend завершён.**

Backend `3791c37` публикует `AdminMessaging_lookupOutcome` по исходному
`Idempotency-Key` с actor/Project/End User scope, persisted Message, актуальным
delivery receipt и typed `200/400/403/404`. `AdminMessaging_send` сохраняет
Message независимо от online-session, дедуплицирует тот же body/key и возвращает
typed `409 IDEMPOTENCY_KEY_REUSED` при конфликтующем body.

Frontend закрепил этот контракт на pin
`sha256:dda53093e2be430610e308265d490f77d5869ac1947e489a1cc2572d6a8c43b7`:
stable key и исходный request сохраняются до terminal outcome, transport timeout
сначала вызывает lookup, только authoritative `404` разрешает replay тем же
body/key, а draft переживает reload, revoke и conflict.

Evidence: `AdminMessaging_lookupOutcome`, `AdminMessaging_send`,
`SendAdminMessageResponseDto`, frontend Task 13 unit/component/e2e proof.

### 14 — Read/unread и first-unread

**Статус: backend-блокер снят; готово, можно проверять и брать в frontend-разработку.**

Backend `main` `75739a1` публикует reader-scoped durable `readState` в Project inbox и
authoritative Support Workspace: `lastReadOrdinal`, `highestOrdinal`, `firstUnreadOrdinal`, общий и
customer-originated unread counts. `GET/POST .../read-position` дают REST reconcile и monotonic
high-water ACK; out-of-order ACK не уменьшает позицию, ACK выше server high-water возвращает typed
`409` с `error.details.highestOrdinal`.

Первая bounded history page содержит first-unread anchor. Подписанные `nextCursor` и
`newerCursor` сохраняют доступность старой и новой части истории даже при unread backlog больше
page limit. Reader identity берётся только из IAM; read и ACK используют ту же повторно проверенную
authorization-bound transaction. Ответы помечены `no-store`.

Проверено: unit/OpenAPI tests, clean build, 53/53 architecture gate, PostgreSQL workspace proof,
index-backed load gate на 20k Conversations и 10k Messages, локальный production start/health и
повторные spec/standards/architecture/security/scalability review без P0/P1.

### 15 — Delivery и reconnect reconciliation

**Статус: backend-блокер снят; готово, можно проверять и брать в frontend-разработку.**

Backend `main` `0f5404f` публикует authoritative delivery receipt с `generation`, `version`,
`errorCode`, `retryEligible` и `allowedActions` в history/send/lookup/workspace. Статусы
`PENDING`, `DELIVERING`, `DELIVERED`, `READ`, `FAILED` и `CANCELLED` принадлежат server projection;
HTTP success не означает `DELIVERED`.

Безопасный retry выполняется через `AdminMessaging_retryFailedDelivery` с `Idempotency-Key`, точными
`expectedGeneration/expectedVersion`, actor/tenant scope и permission `project.conversations.reply`.
Неизвестный outcome не становится retryable; stale, ambiguous и idempotency-conflict ответы typed.

`SupportRealtime_deliveryContract` публикует event names и OpenAPI schema refs для Message upsert,
Translation upsert, Delivery upsert и Delivery revoke. Delivery merge key —
`(generation, version, operationPrecedence)`; revoke побеждает upsert при равном ключе.
`eventSequence` scoped на Conversation и используется только как gap hint. Любой gap/reconnect
запускает bounded `SupportWorkspace_read`, а REST всегда побеждает realtime.

Outbox commit-atomic, lease/fence-safe и bounded: 12 publish attempts, dead lifecycle, health sample
до 100 000 и суммарный purge не более 500 transport hints за проход. Retention: published 7 дней,
dead 30 дней; Message, delivery receipt и audit evidence не удаляются.

Проверено: полный suite 3848/3848, focused 65/65, build/typecheck/Prisma/architecture, чистая БД со
всеми 533 migrations, lifecycle proof и нагрузочные планы по 20 000 pending, published и dead
outbox rows без `Sort`, production startup/health в двух IAM profiles и повторные
spec/standards/architecture/security/scalability review без P0/P1.

Frontend перед реализацией должен обновить pinned OpenAPI/generated client из backend `0f5404f`.

### 16 — Case workflow и классификация

**Статус: backend-блокер снят (`2113c99`). Готово, можно проверять и брать в разработку.**

`EndUserCases_detail`, `EndUserCases_workflow` и `EndUserCases_classification` теперь публикуют
server-owned allowed actions, canonical classification с confidence/evidence, effective priority
floor с bounded reasons и обязательным immutable policy pin. Priority override проверяется и
аудируется на сервере; trusted Platform floors применяются атомарно при create/attach/reopen.

Typed `400/403/404/409` возвращают актуальный Case projection. Timeline больше не раскрывает
arbitrary payload: actor, reason, previous/next и server timestamp проецируются из append-only
revision lineage. Merge/split/router используют общий advisory Case lock и стабильный порядок
захвата; merged read-only Cases исключены из фоновой обработки.

Проверено: полный suite 3864 теста, 0 failures; architecture 53/53; Prisma и build; 534 clean
migrations; PostgreSQL upgrade/serialization; 20k Cases и 100 конкурентных detail/timeline reads
(p95 385,8/83,9 мс при лимите 500 мс); production bootstrap и `/health` 200; повторные
spec/standards/security/architecture/scalability review без P0/P1.

### 17 — Действия оператора с назначением

**Статус: частичный backend-блокер.**

Готово: typed `SupportCaseAssignment_claim/assign/release/transfer`, Case/assignment OCC,
idempotency, reason codes, typed assignment errors; own offer list и accept/decline success receipt.

Не хватает Case-scoped authoritative eligible Team/operator catalog для claim/transfer. Общий
Workforce config и legacy assignees list не доказывают eligibility конкретного Case. Offer
accept/decline также не публикуют typed expiry/conflict error bodies.

Что может frontend сейчас: release current assignment, показать own offers и принять/отклонить их;
manual claim/transfer picker нельзя строить из browser data.

Evidence: `src/composition/support-workspace/support-case-assignment.controller.ts`,
`src/composition/support-workspace/support-routing-offer.controller.ts`,
`ClaimSupportCaseAssignmentDto`, `TransferSupportCaseAssignmentDto`.

### 18 — Назначение и override для лида

**Статус: частичный backend-блокер.**

Готово: single-Case assign/transfer/release commands и operator availability override command.

Не хватает:

- eligible Team/operator targets с Case-specific target authority;
- отдельного allowed action для обхода availability/capacity;
- bulk assignment command с per-item success/failure receipt;
- lookup неизвестного outcome bulk/single command;
- безопасного target catalog для alert owner/Lead drill-down.

Что может frontend сейчас: общий command/reconcile layer и существующий assignment read/release.
Production lead picker, override confirmation и bulk result screen полностью закрыть нельзя.

### 19 — SLA, routing и availability context

**Статус: частичный backend-блокер.**

Готово: queue catalog/cases, sparse `SupportQueueEntryResponseDto.slaDueAt`, routing policy/decision
admin reads, own offers, availability reads/mutations и SLA settings/human correction commands.

Не хватает:

- selected-Case response/resolution clocks, pause/resume/breach state и action ETag;
- current Case routing reason, queue decision, candidates, offer/reservation/fallback projection;
- live current load/capacity/eligibility projection для Case desk;
- production capacity risks: `SupportLeadCapacityRisksDataDto.state` сейчас только `UNAVAILABLE`,
  `items.maxItems=0`;
- routing facts в Case investigation не опубликованы как данные:
  `SupportLeadInvestigationDataDto.routingFactsState` имеет единственное значение
  `UNAVAILABLE` и не связан typed identity с selection.

Что может frontend сейчас: own availability, queue/admin routing surfaces, own offers и sparse queue
deadline. Полный Case inspector и SLA signal в unified inbox сделать нельзя.

Evidence: `SupportQueueEntryResponseDto`, `SupportOperatorAvailabilityResponseDto`,
`SupportLeadCapacityRisksDataDto`, `SupportRoutingDecision*`, `SupportSla*`.

### 20 — Permission-gated inspector tabs

**Статус: нет backend-блокера для точного ticket.**

Опубликованы safe workspace identity, `EndUserCases_detail/timeline`,
`AdminEndUserProfiles_profile` с field-level `access`, `availability`, `classification`, provenance и
freshness, bounded `AdminEventLogs_list`, operational state reads и exact-subject
`SupportLead_activity`.

Что может frontend сейчас: лениво загрузить Case/User/Data/Events/Activity по effective permissions,
держать отдельные cache/generation guards и purge DOM/cache при `403`/project switch. Knowledge и
Integrations относятся к отдельным tickets 25 и 31. Зависимость ticket 20 от ticket 16 остаётся
транзитивной для mutating Case desk, но отдельного backend gap у read-only inspector tabs нет.

Evidence: `ProfileProjectionResponseDto`, `ProfileProjectionFieldResponseDto`,
`EventLogPageResponseDto`, `EndUserCaseTimelineResponseDto`, `SupportActivityResponseDto`.

### 21 — Viewers, typing и collision warning

**Статус: полный backend-блокер.**

Нет опубликованного operator Conversation watch/viewers/typing API или realtime contract с actor
scope, TTL, generation, renew/unwatch и revoke. `Presence_list` показывает active End Users и не
является operator collaboration/assignment authority. Backend master spec описывает intent, но не
публикует transport.

Что может frontend сейчас: только disabled UI/contract seam; нельзя отправлять draft/body в
presence или выводить viewers из socket connections.

Evidence: в OpenAPI нет schemas/operations с typing/viewer/watcher/collision; docs-only intent —
`docs/specs/support-platform/01-backend.ru.md`.

### 22 — Internal-note composer mode

**Статус: частичный backend-блокер.**

Готово: `SupportInternalNote_list/revisions/create/correction/tombstone`, separate permissions,
idempotency и `If-Match` для versioned mutations.

Не хватает:

- Case-scoped `internalNotes.create/correct/tombstone` allowed actions в workspace selection;
- закрытого reason-code catalog либо явного typed free-form validation contract;
- typed 4xx/409/410 bodies (часть responses description-only);
- опубликованного note realtime watch payload/admission.

Что может frontend сейчас: полноценная read-only note timeline и отдельные public/note draft keys.
Mutation controls нельзя показывать только по project permission.

Evidence: `src/modules/support-operations/api/support-internal-note.controller.ts`,
`SupportWorkspaceCapabilitiesResponseDto` не содержит note actions.

### 23 — Attachments в public reply и note

**Статус: полный backend-блокер.**

Нет Conversation/Internal Note attachment upload session, scan states, public/internal visibility,
download grants, attachment-only Message и attachment IDs в `SendAdminMessageDto` или
`CreateSupportInternalNoteDto`. Existing Chat compatibility endpoint явно отклоняет attachments;
Internal Knowledge file upload принадлежит другому corpus и не может быть заменой.

Что может frontend сейчас: только composer extension seam и disabled attach action. Нельзя хранить
file object/URL как локальную production truth.

Evidence: `SendAdminMessageDto`, `CreateSupportInternalNoteDto`,
`src/modules/chat/compatibility-messenger.controller.ts`; OpenAPI не содержит Support Message/Note
attachment schemas.

### 24 — Support Macros

**Статус: частичный backend-блокер.**

Готово: typed catalog/detail/create/draft/publish/archive, variables/compiled draft, reply-draft
create/read/edit и atomic `macroReplyDraftId` consumption в `AdminMessaging_send`.

Не хватает полного authoring lifecycle, заявленного ticket:

- отдельного preview/validation receipt;
- revision history и rollback operation;
- typed 4xx/409/503 error bodies у macro authoring;
- typed Message read projection macro/revision provenance: send принимает draft ID, но
  `AdminConversationMessageResponseDto` не публикует macro provenance.

Что может frontend сейчас: catalog search, create/edit/publish/archive и вставка редактируемого
macro reply draft. Полный settings/version rollback и provenance history закрыть нельзя.

Evidence: `src/modules/support-operations/api/support-macro.controller.ts`,
`SupportMacroResponseDto`, `SupportMacroReplyDraftResponseDto`, `SendAdminMessageDto`,
`AdminConversationMessageResponseDto`.

### 25 — Support Internal Knowledge

**Статус: частичный backend-блокер.**

Готово: отдельный `/support/knowledge/*` corpus, typed search/open/download/manage, text revisions,
file upload/complete/scan, publish/archive и emergency admission rollback.

Не хватает:

- document revision rollback к выбранной опубликованной revision;
- отдельного Knowledge retention contract: опубликованный Support retention API относится только
  к `internal-notes`;
- отдельного Knowledge rollout/admission read contract: общий content-rollout перечисляет Macros,
  Notes и Content Panel, но не публикует независимую Knowledge capability;
- Case-scoped allowed actions для manage/download/insert, если UI должен заранее показывать именно
  target authority, а не только project permission и последующий fail-closed endpoint check;
- полного набора typed conflict/revoked/scan/download errors и unknown-outcome lookup;
- typed content-panel items: aggregate panel `items` остаются arbitrary objects, поэтому надо
  использовать explicit search/read endpoints.

Что может frontend сейчас: search/open/download, management list/detail, text/file draft,
scan/publish/archive. Нельзя заявить полный lifecycle с document rollback.

Evidence: `src/composition/support-workspace/support-internal-knowledge.controller.ts`,
`SupportKnowledgeSearchPageResponseDto`, `SupportKnowledgeManagedDocumentDetailResponseDto`,
`SupportContentPanelKnowledgeDto`.

### 26 — Lead Control

**Статус: частичный backend-блокер.**

Готово: typed summary, Case risks, investigation, Activity, alert list/detail и versioned
acknowledge/resolve/change-owner commands.

Не хватает:

- реальных capacity risk rows — contract возвращает только `UNAVAILABLE`;
- current routing/reservation facts в investigation;
- search/Saved View responses для canonical filtered drill-down;
- eligible operator/Team catalog для assign/reassign/override и alert owner;
- bulk partial receipt/outcome lookup;
- отдельного project rollout/admission contract для Lead Control.

Что может frontend сейчас: summary, Case risks, causal facts, Activity, alerts read и
acknowledge/resolve. Capacity tables, safe owner/assignment picker и complete drill-down заблокированы.

Evidence: `src/modules/support-operations/api/support-lead.controller.ts`,
`support-operational-alert*.controller.ts`, `SupportLeadCapacityRisksDataDto`.

### 27 — Browser notification settings

**Статус: полный backend-блокер на `origin/main`.**

В fresh OpenAPI отсутствуют:

- `GET/PATCH /admin/projects/:projectId/support/notification-preferences`;
- `POST/DELETE /auth/me/browser-push-subscriptions` и device list/status;
- topics `SUPPORT_CASE_ATTENTION`, `SUPPORT_CASE_ASSIGNED_TO_ME`;
- safe signed Support deep-link payload/resolve contract;
- project rollout/admission и typed preference/subscription revisions.

В main есть policy/intent-writer код и tests, а нормативная спека описывает будущий interface, но
backend task 20a остаётся `ready-for-agent`; controller и OpenAPI отсутствуют. Legacy email
preferences и `NotificationDestination_*` не являются заменой.

Что может frontend сейчас: только локально определить browser capability/permission для будущего
UI; нельзя показывать enabled, devices или регистрировать service worker subscription как server
accepted.

Evidence: `docs/specs/support-platform/20-personal-browser-notifications.ru.md`,
`.scratch/support-platform/issues/20a-support-personal-browser-notifications-backend.md`,
`src/modules/notifications/personal/*`; в OpenAPI browser Push paths = 0.

### 28 — Cutover legacy entry points

**Статус: частичный транзитивный backend-блокер.**

Сам redirect/deep-link adapter является frontend work. Но production core cutover по dependency
list ticket ждёт полноту 10–20. Backend gaps задач 10, 11, 13, 14, 15, 16, 17, 18 и 19 поэтому
блокируют завершение 28. Задачи 21–27 и 30–33 по принятому scope core cutover не блокируют.

Дополнительно не опубликован typed project-level rollout/admission
`support_workspace_shell`; `Project.settings` arbitrary object и deployment `VITE_*` switch не
являются server-owned per-project contract.

Что может frontend сейчас: legacy URL adapters, canonical route guards, read-only migration и
deployment-wide rollback flag. Нельзя объявлять writable core cutover завершённым.

### 29 — Hardening, pilot и rollback core Support

**Статус: частичный транзитивный backend-блокер.**

Visual, keyboard, axe, route and read-only dogfood можно выполнять. Write pilot ждёт задачу 28 и её
backend gaps. Для безопасного one-project rollout по-прежнему нет typed project shell
rollout/admission projection; backend environment flags отдельных modules не равны frontend
project capability.

Что может frontend сейчас: вся не зависящая от недостающих commands тестовая матрица, read-only
dogfood, runbook и deployment rollback rehearsal. Нельзя завершить one-project write pilot и
accuracy proof unread/delivery/assignment/SLA.

Evidence: frontend `docs/specs/support-workspace-frontend/08-backend-contract-gaps.ru.md`; fresh
OpenAPI не публикует whole-workspace rollout operation/schema.

### 30 — Синхронизация JSM/HelpDesk-контрактов

**Статус: полный backend-блокер.**

В `origin/main` нет ни одного `/support/external-work` path, ни одной External Work/JSM/HelpDesk
schema и нет implementation slice в `src`/Prisma — только нормативная документация. Backend master
прямо помечает Ticket 21 как `not implemented` и перечисляет будущие foundation/provider slices.

Не хватает connection/OAuth state, provider catalog, mapping revision, Case link, async command
receipt, idempotency lookup, timeline, failure/reconcile inbox, permissions и typed error models.

Что может frontend сейчас: только capability matrix и fixtures с `NOT_PUBLISHED`; generated client
создать не из чего.

Evidence: `docs/specs/support-platform/00-master.ru.md`,
`docs/specs/support-external-work/00-master.ru.md`,
`docs/specs/support-external-work/01-backend.ru.md`; OpenAPI external-work paths = 0.

### 31 — Integration Settings и External Work inbox

**Статус: полный backend-блокер.**

Отсутствуют connection lifecycle, multi-site tenant selection, test connection, provider catalog,
mapping draft/preview/publish/rollback, last successful sync и External Work queue/detail/retry
operations.

Что может frontend сейчас: только статический route/prototype за выключенным feature flag; нельзя
создавать local DTO или хранить credentials/settings в browser.

Evidence: будущий interface описан в
`docs/specs/support-external-work/01-backend.ru.md` и
`02-cms-frontend.ru.md`, но ни одной операции нет в fresh OpenAPI.

### 32 — External Work actions в Case inspector

**Статус: полный backend-блокер.**

Отсутствуют Case-scoped links, server allowed actions, safe-context preview, link existing/create,
public/internal comment, unlink, async receipt/status, attempt history и outcome lookup/retry.

Что может frontend сейчас: только extension slot в inspector. Нельзя считать HTTP `202` success,
копировать чат provider-у или реализовывать vendor API прямо из browser.

Evidence: нормативные, но не реализованные contracts в
`docs/specs/support-external-work/01-backend.ru.md`; OpenAPI external-work paths/schemas = 0.

### 33 — Support Quality и Analytics

**Статус: полный backend/IAM-блокер.**

Не опубликованы:

- permissions `project.support.quality.*` и `project.support.analytics.*`;
- immutable review snapshot и evidence grants;
- versioned scorecard, submit/feedback/dispute/calibration workflow;
- server metric catalog, definitions, timezone/cohort/freshness/no-data semantics;
- authority-checked drill-down, export/share и независимые rollout flags.

Существующий `AIReview_*` относится к review AI-функций и не является Support QA workflow.
`SupportLead_summary/risks` — operational control, не employee quality analytics.

Что может frontend сейчас: только documentation/proposed IA; production routes, permission strings
и client-computed employee/project metrics добавлять нельзя.

Evidence: в backend source и OpenAPI нет `project.support.quality.*`,
`project.support.analytics.*`, `/support/quality`, `/support/analytics`, scorecard/calibration/dispute
schemas.

## Что backend должен опубликовать в первую очередь

Это не новая декомпозиция задач, а порядок, который снимает максимум frontend-блокировок:

1. **Search/Saved Views transport closure** — typed result/mutation schemas, Users search,
   filter/sort grammar, system preset catalog. Разблокирует 10, 11, часть 26 и core cutover.
2. **Messaging recovery/read state** — idempotency outcome lookup, reader high-water/unread/first
   unread, delivery lookup/retry, typed realtime admission. Разблокирует 13–15.
3. **Case desk authority** — workflow/classification закрыты в `2113c99`; остаются eligible
   assignment targets, bulk receipts, selected-Case SLA/routing/load projection. Разблокирует
   17–19 и оставшуюся часть 26.
4. **Collaboration/files/content completion** — typing/viewers contract, Message/Note attachments,
   note actions, Macro/Knowledge missing lifecycle/error/provenance contracts. Разблокирует 21–25.
5. **Project rollout** — typed Support Workspace/Lead Control admission для 28–29.
6. **Browser notifications** — полностью выполнить backend Ticket 20a и повторно экспортировать
   OpenAPI. Разблокирует 27.
7. **External Work** — foundation + JSM/HelpDesk adapters и typed API. Разблокирует 30–32.
8. **Support QA/Analytics + IAM handoff** — отдельные domain/API/permission contracts. Разблокирует
   33.

До публикации этих slices frontend может продолжать задачи без backend-блокеров и независимые части
partial tickets, но не должен компенсировать gaps локальными DTO, N+1 reads, socket inference или
browser-owned business truth.
