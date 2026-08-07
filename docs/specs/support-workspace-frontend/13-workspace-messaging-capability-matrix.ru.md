# W0: capability matrix рабочего места и переписки

Статус: normative baseline для frontend Task 01
Версия: 2
Дата: 7 августа 2026 года
Backend source: `3791c37bf7c3f70f1114b16682ef643fc62107af`
Pinned contract: `sha256:dda53093e2be430610e308265d490f77d5869ac1947e489a1cc2572d6a8c43b7`

Этот документ отделяет опубликованный production contract от backend intent.
`READY` означает, что операция есть в pinned OpenAPI. `RELEASE_GATED` означает,
что contract опубликован, но rollout ещё имеет внешний gate. `NOT_PUBLISHED`
нельзя реализовывать локальным DTO, таймером или socket inference.

## 1. Матрица операций

| Capability | Published operation / contract | Session permission | Target authority / allowed action | Revision, ETag, checkpoint | Idempotency | Fixture | Flag / status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Case/Conversation selection | `GET SupportWorkspace_read`, `mode=SELECTION` | `project.cases.read` **или** `project.conversations.read` | Boolean `capabilities` текущей projection; это не универсальный `allowedActions` | `actionRevisions` — preconditions; `capabilitiesRevision` — evidence; `checkpoint` — recovery token | нет | `minimalSelectionSuccess`, `fullSelectionSuccess`, `forbiddenSelection`, `concealedSelection` | `support_workspace_shell`; `READY`, rollout source пока deployment-wide |
| Conversation history в workspace | `GET SupportWorkspace_read`, `messageCursor`, `messageLimit≤100` | как у selection | read authority выбранной projection | opaque cursor не равен checkpoint; canonical order задаёт Message `ordinal` | нет | `historyNextPage` | `support_workspace_shell`; `READY` |
| Legacy exact-conversation history | `GET AdminConversations_listMessages`, `cursor`, `limit≤200` | `project.conversations.read` | exact End User + Conversation scope | opaque cursor, Message `ordinal` | нет | pinned OpenAPI + mutation tests | `READY`; мигрируется в общий Surface, не расширяется |
| Durable public send | `POST AdminMessaging_send` | `project.conversations.reply` | selection `capabilities.reply`; translation override требует отдельной capability | отдельного expected revision/ETag в этой операции нет | обязательный `Idempotency-Key` | `sendConflict`, `unknownSendOutcome` | `support_durable_delivery`; `RELEASE_GATED` до SDK ACK/load gate |
| Idempotent replay | тот же `AdminMessaging_send` с тем же body/key; response `duplicate=true` | как у send | как у send | authoritative stored Message + delivery receipt | повтор использует **тот же** key | `unknownSendOutcome` | `RELEASE_GATED` |
| Lookup попытки после timeout | `GET AdminMessaging_lookupOutcome` | `project.conversations.reply` | actor + Project + End User scope; чужой receipt concealed | persisted Message + актуальный delivery receipt | обязательный исходный `Idempotency-Key` | `unknownSendOutcome.lookupOperation=AdminMessaging_lookupOutcome` | `READY`; frontend Task 13 complete |
| Durable CMS read position / first unread | операции и projection нет | не опубликовано | reader-scoped authority нет | monotonic ordinal ACK не опубликован | не применимо | gap фиксируется только в matrix | `NOT_PUBLISHED`; frontend Task 14 blocked |
| Message delivery | `AdminMessageDeliveryResponseDto` внутри history/send/lookup: `id`, `channel`, `commandIds`, `interactionSessionId`, `status`, `acceptedAt` | read/reply permission родительской операции | server receipt; HTTP success не равен `DELIVERED` | merge authority — server status; checkpoint только запускает reconcile | command identity и исходный lookup key сохраняются до terminal outcome | `fullSelectionSuccess`, `unknownSendOutcome` | `support_durable_delivery`; `RELEASE_GATED` |
| Realtime invalidation | `conversation.watch.v1`, `conversation.message.upserted.v1`, `conversation.translation.upserted.v1`, `conversation.delivery.upserted.v1` вне OpenAPI | `project.conversations.read` при watch | hint не даёт ownership/action authority | duplicate/reorder/loss → bounded REST reconcile; revoke → unwatch + purge | не применимо | typed public payload отсутствует | `DOCS_ONLY_NOT_PUBLISHED`; REST остаётся authority |

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
| `support_workspace_shell` | временный `VITE_SUPPORT_WORKSPACE_ENABLED`; typed per-project flag не опубликован | backend rollout contract + frontend route smoke |
| `support_project_inbox` | отдельный typed flag не опубликован | Task 02 + backend inbox handoff |
| `support_durable_delivery` | backend contract готов, Task 13 complete; rollout gated | backend SDK ACK/load proof + frontend Task 15 |
| Idempotency lookup | опубликован и подключён | backend `3791c37` + frontend Task 13 tests/e2e |
| Read position / first unread | отсутствует | backend conversation owner |
| Typed realtime payload/checkpoint | отсутствует | backend realtime owner |

Task 01 не реализует send state machine, unread UI или delivery reconcile. Он
фиксирует проверяемую границу, от которой блокерами вперёд работают Tasks
13–15.
