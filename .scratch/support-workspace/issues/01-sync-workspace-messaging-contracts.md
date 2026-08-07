# 01 — Синхронизировать workspace и messaging-контракты

**What to build:** Зафиксировать во frontend актуальный опубликованный контракт рабочего места и переписки, чтобы следующие задачи не угадывали ordering, authority, delivery или recovery semantics.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Pinned OpenAPI соответствует последнему merged backend contract и проходит drift/check/generation проверки.
- [x] Workspace selection, history, durable send, idempotency lookup, read position, delivery и realtime hints перечислены в capability matrix.
- [x] Для каждой операции зафиксированы permissions, `allowedActions`, revision/etag и idempotency requirements.
- [x] Domain mapping сохраняет message ordinal, immutable author snapshot, delivery, checkpoint и capabilities revision.
- [x] Fixtures покрывают minimal/full success, forbidden/hidden, conflict, stale revision, pagination и unknown outcome.
- [x] Contract tests падают при потере обязательного поля или несовместимом enum.

`Idempotency lookup`, durable CMS read position и typed realtime payload честно
помечены `NOT_PUBLISHED`; Task 01 не подменяет backend gaps клиентской логикой.

**Повторная проверка 2026-08-07:** backend `origin/main`
`0ca33c93e52d689de388187091e6aa2f6c05639b`; fresh export семантически совпал с
pinned artifact после canonical ordering, source revision обновлена, drift/check/generation зелёные.
