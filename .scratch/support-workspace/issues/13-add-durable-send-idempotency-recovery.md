# 13 — Добавить durable send и idempotency recovery

**What to build:** Оператор отправляет публичный ответ независимо от текущего socket-соединения пользователя и безопасно узнаёт результат после timeout.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** completed

**Backend gate (audit 2026-08-07):** снят backend commit `3791c37`.
`AdminMessaging_lookupOutcome` опубликован и закреплён frontend pin
`sha256:dda53093e2be430610e308265d490f77d5869ac1947e489a1cc2572d6a8c43b7`.
См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#13--durable-send-и-idempotency-recovery).

- [x] Send сохраняет Message на backend и не требует active online session.
- [x] Каждая попытка имеет stable idempotency key до получения terminal outcome.
- [x] Timeout переводит action в `Проверяем результат`, затем выполняет lookup вместо немедленного retry.
- [x] Accepted original receipt объединяется с ранним realtime event без дубля.
- [x] `409`, revoke и unknown outcome сохраняют draft; attachment draft не затрагивается (сам upload/send остаётся Task 23).
- [x] Offline recipient/reconnect e2e подтверждает один Message после повторной загрузки.

**Frontend proof:** repository adapter использует generated
`AdminMessaging_lookupOutcome`; pending attempt хранится tab-scoped и очищается
при logout/terminal receipt; общий Conversation Surface показывает компактные
`CHECKING_OUTCOME`, `RETRYABLE` и `BLOCKED` состояния. Unit/component suite и
browser e2e фиксируют lookup-before-retry и отсутствие дубля после reload.
