# 25 — Подключить Support Internal Knowledge

**What to build:** Администратор управляет отдельным внутренним corpus, а оператор ищет, читает и цитирует материал, не покидая Conversation.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 20 — Добавить permission-gated inspector tabs.

**Status:** ready-for-agent

- [ ] Internal Knowledge имеет отдельные routes, permissions, revisions, retention и rollout от пользовательского AI Knowledge.
- [ ] Text/file lifecycle поддерживает draft/upload/scan/preview/publish/archive/rollback.
- [ ] Inspector search показывает source, revision, freshness и permission-safe snippets.
- [ ] Operator может открыть материал, вставить quote/link в draft и отредактировать его до отправки.
- [ ] Download grants scoped по actor/project/document и очищаются при revoke.
- [ ] Ни один internal document не попадает в public AI corpus или End User projection.
