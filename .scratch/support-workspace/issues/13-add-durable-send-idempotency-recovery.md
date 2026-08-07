# 13 — Добавить durable send и idempotency recovery

**What to build:** Оператор отправляет публичный ответ независимо от текущего socket-соединения пользователя и безопасно узнаёт результат после timeout.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** ready-for-agent

- [ ] Send сохраняет Message на backend и не требует active online session.
- [ ] Каждая попытка имеет stable idempotency key до получения terminal outcome.
- [ ] Timeout переводит action в `Проверяем результат`, затем выполняет lookup вместо немедленного retry.
- [ ] Accepted original receipt объединяется с ранним realtime event без дубля.
- [ ] `409`, revoke и unknown outcome сохраняют draft и разрешённые attachments.
- [ ] Offline recipient/reconnect e2e подтверждает один Message после повторной загрузки.
