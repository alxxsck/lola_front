# 32 — Добавить JSM/HelpDesk actions в Case inspector

**What to build:** Оператор связывает или создаёт внешний объект из Case, контролируя отправляемый контекст и видя фактический async outcome.

**Blocked by:** 16 — Завершить Case workflow и классификацию; 30 — Синхронизировать JSM/HelpDesk-контракты; 31 — Реализовать Integration Settings и External Work.

**Status:** blocked-by-backend

**Backend gate (audit 2026-08-07):** полный blocker — Case-scoped link/create/comment/unlink,
async receipt и lookup/retry APIs отсутствуют. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#32--external-work-actions-в-case-inspector).

- [ ] Inspector поддерживает link existing, create, comment и unlink только по server allowed actions.
- [ ] Перед create показывается редактируемый safe-context preview; история чата не копируется автоматически.
- [ ] Internal/public external comments имеют разные permissions и явное подтверждение.
- [ ] UI различает queued/sending/created/attention/unknown outcome; `202` не считается success.
- [ ] Retry использует receipt/idempotency lookup и не создаёт дубль.
- [ ] Remote text копируется только в редактируемый chat draft и не отправляется пользователю автоматически.
