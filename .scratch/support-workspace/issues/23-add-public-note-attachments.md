# 23 — Добавить attachments в reply и note

**What to build:** Оператор отправляет изображения и документы в публичном ответе или внутренней заметке с явной visibility и восстановлением после ошибок.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 13 — Добавить durable send и idempotency recovery; 22 — Встроить internal-note composer mode.

**Status:** blocked-by-backend

**Backend gate (audit 2026-08-07):** полный blocker — upload/scan/grants и attachment send
для public reply/internal note отсутствуют. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#23--attachments-в-public-reply-и-note).

- [ ] Upload tray показывает queued/uploading/scanning/ready/rejected/failed/revoked states.
- [ ] Public и note attachments имеют разные draft keys, permissions и download grants.
- [ ] Composer поддерживает multi-file и attachment-only Message.
- [ ] Reconnect/retry возвращает upload в правильный draft без повторной отправки.
- [ ] Image/document cards доступны keyboard/screen reader и не ломают history anchor.
- [ ] Internal attachment никогда не появляется в End User projection или public signed URL scope.
