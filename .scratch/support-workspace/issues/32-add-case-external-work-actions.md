# 32 — Добавить JSM/HelpDesk actions в Case inspector

**What to build:** Оператор связывает или создаёт внешний объект из Case, контролируя отправляемый контекст и видя фактический async outcome.

**Blocked by:** 16 — Завершить Case workflow и классификацию; 30 — Синхронизировать JSM/HelpDesk-контракты; 31 — Реализовать Integration Settings и External Work.

**Status:** ready-for-agent

- [ ] Inspector поддерживает link existing, create, comment и unlink только по server allowed actions.
- [ ] Перед create показывается редактируемый safe-context preview; история чата не копируется автоматически.
- [ ] Internal/public external comments имеют разные permissions и явное подтверждение.
- [ ] UI различает queued/sending/created/attention/unknown outcome; `202` не считается success.
- [ ] Retry использует receipt/idempotency lookup и не создаёт дубль.
- [ ] Remote text копируется только в редактируемый chat draft и не отправляется пользователю автоматически.
