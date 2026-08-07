# 01 — Синхронизировать workspace и messaging-контракты

**What to build:** Зафиксировать во frontend актуальный опубликованный контракт рабочего места и переписки, чтобы следующие задачи не угадывали ordering, authority, delivery или recovery semantics.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Pinned OpenAPI соответствует последнему merged backend contract и проходит drift/check/generation проверки.
- [ ] Workspace selection, history, durable send, idempotency lookup, read position, delivery и realtime hints перечислены в capability matrix.
- [ ] Для каждой операции зафиксированы permissions, `allowedActions`, revision/etag и idempotency requirements.
- [ ] Domain mapping сохраняет message ordinal, immutable author snapshot, delivery, checkpoint и capabilities revision.
- [ ] Fixtures покрывают minimal/full success, forbidden/hidden, conflict, stale revision, pagination и unknown outcome.
- [ ] Contract tests падают при потере обязательного поля или несовместимом enum.
