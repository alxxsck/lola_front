# 25 — Подключить Support Internal Knowledge

**What to build:** Администратор управляет отдельным внутренним corpus, а оператор ищет, читает и цитирует материал, не покидая Conversation.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 20 — Добавить permission-gated inspector tabs.

**Status:** operator-complete-admin-recovery-blocked

**Backend gate (re-audit 2026-08-09, backend `f9ef8e42`):** operator search/open/download,
Citation Draft, provenance, lifecycle, revision rollback, governance, retention и rollout
опубликованы. Полный admin UI остаётся заблокирован durable recovery для
`setCapabilities`, `setRetentionPolicy` и `resolveProblemReport`.

- [ ] Internal Knowledge имеет отдельные routes, permissions, revisions, retention и rollout от пользовательского AI Knowledge.
- [ ] Text/file lifecycle поддерживает draft/upload/scan/preview/publish/archive/rollback.
- [x] Inspector search показывает source, revision, freshness и permission-safe snippets.
- [x] Operator может открыть материал, вставить quote/link в draft и отредактировать его до отправки.
- [x] Download grants scoped по actor/project/document и очищаются при revoke.
- [x] Ни один internal document не попадает в public AI corpus или End User projection.
