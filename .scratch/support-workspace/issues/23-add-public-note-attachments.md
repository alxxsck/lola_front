# 23 — Добавить attachments в reply и note

**What to build:** Оператор отправляет изображения и документы в публичном ответе или внутренней заметке с явной visibility и восстановлением после ошибок.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 13 — Добавить durable send и idempotency recovery; 22 — Встроить internal-note composer mode.

**Status:** frontend-complete

**Backend gate:** закрыт backend `eea7cf1`; pinned frontend OpenAPI синхронизирован с этим
коммитом. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#23--attachments-в-public-reply-и-note).

- [x] Upload tray показывает queued/uploading/scanning/ready/rejected/failed/revoked states.
- [x] Public и note attachments имеют разные draft keys, permissions и download grants.
- [x] Composer поддерживает multi-file и attachment-only Message.
- [x] Reconnect/retry возвращает upload в правильный draft без повторной отправки.
- [x] Image/document cards доступны keyboard/screen reader и не ломают history anchor.
- [x] Internal attachment никогда не появляется в End User projection или public signed URL scope.

**Frontend evidence (2026-08-09):** controller/unit/contract suites, full Vitest, build,
lint/architecture, desktop/mobile Playwright и axe проходят. Живые UI-скриншоты находятся в
`artifacts/support-workspace/ticket-23/`.
