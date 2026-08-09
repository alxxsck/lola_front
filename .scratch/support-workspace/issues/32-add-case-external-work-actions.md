# 32 — Добавить JSM/HelpDesk actions в Case inspector

**What to build:** Оператор связывает или создаёт внешний объект из Case, контролируя отправляемый контекст и видя фактический async outcome.

**Blocked by:** — (16, 30 и 31 завершены; backend contract опубликован в `4a96a2a7`.)

**Status:** completed

**Frontend contract:** OpenAPI
`sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.

**Backend gate:** resolved backend commit
`4a96a2a7f0216614ce126da2e0e83a7f728fb5a5` публикует Case-scoped
link/create/comment/refresh/unlink, command receipt/read/retry/evidence/resolve и
exact permission/OCC contracts. Аудит 2026-08-07 остаётся исторической точкой
до публикации этих операций.

- [x] Inspector поддерживает link existing, create, comment и unlink только по server allowed actions.
- [x] Перед create показывается редактируемый safe-context preview; история чата не копируется автоматически.
- [x] Internal/public external comments имеют разные permissions и явное подтверждение.
- [x] UI различает queued/sending/created/attention/unknown outcome; `202` не считается success.
- [x] Retry использует receipt/idempotency lookup и не создаёт дубль.
- [x] Remote text копируется только в редактируемый chat draft и не отправляется пользователю автоматически.
