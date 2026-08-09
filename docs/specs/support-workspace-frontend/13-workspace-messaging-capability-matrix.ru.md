# W0: capability matrix рабочего места и переписки

Статус: normative baseline для frontend Task 01
Версия: 4
Дата: 8 августа 2026 года
Backend source: `9f36796b477d34fcac2a9a46844bbd78863df6e1`
Pinned contract: `sha256:2f4da7559279192a20fd77bf07e72c377d9a031724a0d77a21a81aecd521ee44`

Этот документ отделяет опубликованный production contract от backend intent.
`READY` означает, что операция есть в pinned OpenAPI. `RELEASE_GATED` означает,
что contract опубликован, но rollout ещё имеет внешний gate. `NOT_PUBLISHED`
нельзя реализовывать локальным DTO, таймером или socket inference.

## 1. Матрица операций

| Capability | Published operation / contract | Session permission | Target authority / allowed action | Revision, ETag, checkpoint | Idempotency | Fixture | Flag / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Case/Conversation selection | `GET SupportWorkspace_read`, `mode=SELECTION` | `project.cases.read` **или** `project.conversations.read` | Boolean `capabilities` текущей projection; это не универсальный `allowedActions` | `actionRevisions` — preconditions; `capabilitiesRevision` — evidence; `checkpoint` — recovery token | нет | `minimalSelectionSuccess`, `fullSelectionSuccess`, `forbiddenSelection`, `concealedSelection` | `support_workspace_shell`; `READY`, admission per Project |
| Conversation history в workspace | `GET SupportWorkspace_read`, `messageCursor`, `messageLimit≤100` | как у selection | read authority выбранной projection | opaque cursor не равен checkpoint; canonical order задаёт Message `ordinal` | нет | `historyNextPage` | `support_workspace_shell`; `READY` |
| Legacy exact-conversation history | `GET AdminConversations_listMessages`, `cursor`, `limit≤200` | `project.conversations.read` | exact End User + Conversation scope | opaque cursor, Message `ordinal` | нет | pinned OpenAPI + mutation tests | `READY`; мигрируется в общий Surface, не расширяется |
| Durable public send | `POST AdminMessaging_send` | `project.conversations.reply` | selection `capabilities.reply`; translation override требует отдельной capability | отдельного expected revision/ETag в этой операции нет | обязательный `Idempotency-Key` | `sendConflict`, `unknownSendOutcome` | `support_durable_delivery`; `RELEASE_GATED` до SDK ACK/load gate |
| Idempotent replay | тот же `AdminMessaging_send` с тем же body/key; response `duplicate=true` | как у send | как у send | authoritative stored Message + delivery receipt | повтор использует **тот же** key | `unknownSendOutcome` | `RELEASE_GATED` |
| Lookup попытки после timeout | `GET AdminMessaging_lookupOutcome` | `project.conversations.reply` | actor + Project + End User scope; чужой receipt concealed | persisted Message + актуальный delivery receipt | обязательный исходный `Idempotency-Key` | `unknownSendOutcome.lookupOperation=AdminMessaging_lookupOutcome` | `READY`; frontend Task 13 complete |
| Durable CMS read position / first unread | `GET/POST .../read-position`; inbox/workspace `readState`; history `anchorOrdinal`, `nextCursor`, `newerCursor` | `project.conversations.read` | CMS reader из текущего IAM context; read/ACK в authorization-bound transaction | monotonic ordinal ACK; REST reconcile после reload/reconnect; signed direction-bound cursors | ACK idempotent и не уменьшает high-water | backend `75739a1`; unit/OpenAPI/PostgreSQL/load proofs | `READY`; frontend Task 14 можно брать в разработку |
| Message delivery | `AdminMessageDeliveryResponseDto` внутри history/send/lookup/workspace: `status`, `generation`, `version`, `errorCode`, `retryEligible`, `allowedActions` | read/reply permission родительской операции | server receipt; HTTP success не равен `DELIVERED` | merge authority — server generation/version; REST побеждает hint | command identity и исходный lookup key сохраняются до terminal outcome | backend `0f5404f`; REST/OpenAPI/PostgreSQL proofs | `READY`; frontend Task 15 complete |
| Safe failed-delivery retry | `POST AdminMessaging_retryFailedDelivery` | `project.conversations.reply` | только доказанный `KNOWN_NOT_DELIVERED`; ambiguous/foreign/stale fail closed | обязательны точные `expectedGeneration/expectedVersion` | обязательный actor-scoped `Idempotency-Key` | typed `409/422` с актуальным receipt | `READY`; frontend Task 15 complete |
| Realtime invalidation | `GET SupportRealtime_deliveryContract`: `conversation.message.upserted.v1`, `conversation.message.translation.upserted.v1`, delivery upsert/revoke и schema refs | `project.conversations.read` при watch и чтении contract | hint не даёт ownership/action authority | per-Conversation sequence gap → bounded `SupportWorkspace_read`; REST wins; Delivery revoke wins equal key | eventId + monotonic Delivery key | public OpenAPI DTO для всех четырёх payloads | `READY`; frontend Task 15 complete |

## 2. Семантика workspace projection

- Published modes: `CASES`, `ALL_CONVERSATIONS`, `SELECTION`.
- `SELECTION` принимает Case, Conversation или доказанную связанную пару.
  Conversation без Case валидна. Ответ может вернуть bounded related lists и
  `related*Truncated`.
- `messageCursor` и inbox `cursor` opaque и scoped; их нельзя собирать или
  сравнивать на клиенте. `checkpoint` — не cursor и не mutation precondition.
- История сортируется только по server `ordinal`. Timestamp используется лишь
  для presentation.
- `author` — immutable snapshot момента acceptance. `null` означает server
  actor без опубликованного human snapshot; frontend не восстанавливает имя из
  текущего профиля.
- Delivery сохраняется целиком. Неизвестный additive delivery enum нельзя
  переводить в `DELIVERED`; до обновления mapper он fail-closed/reconcile.

## 3. Error и fixture policy

Runtime corpus находится в
`src/shared/api/repository/fixtures/support-workspace-contract-fixtures.ts`.
OpenAPI workspace read сейчас типизирует только `200`, поэтому `403`, concealed
`404` и stale `409` помечены `NOT_PUBLISHED`: это сценарии приёмки и backend
gaps, а не выдуманный wire contract. `AdminMessaging_send` публикует
`400/403/404/409/410/422`; transport timeout не имеет response body и сначала
приводит к `AdminMessaging_lookupOutcome` с тем же idempotency key. Только
authoritative `404` разрешает повторить исходный body с исходным key.

Contract mutation tests обязаны падать при удалении operation, permission,
обязательного header/field или известного enum value. Additive enum value
разрешён contract gate, но runtime adapter обязан обработать его fail-closed.

## 4. Release gates и ownership

| Gate | Текущее состояние | Owner / proof |
| --- | --- | --- |
| `support_workspace_shell` | typed `SupportWorkspace_readAdmission`; exact `rolloutState`, `entryPointMode`, `legacyAdapterMode` и per-surface capabilities | backend `4d82b6bd`/`9f36796b` + frontend route/E2E proof |
| `support_project_inbox` | отдельный typed flag не опубликован | Task 02 + backend inbox handoff |
| `support_durable_delivery` | backend contract и release proof готовы; frontend Tasks 13–15 разблокированы | backend `0f5404f`; SDK ACK + 60k outbox load proof |
| Idempotency lookup | опубликован и подключён | backend `3791c37` + frontend Task 13 tests/e2e |
| Read position / first unread | опубликован | backend `75739a1` |
| Typed realtime payload/reconcile | опубликован | backend `0f5404f` |

Task 01 не реализует send state machine, unread UI или delivery reconcile. Он
фиксирует проверяемую границу, от которой блокерами вперёд работают Tasks
13–15.
