# 15 — Завершить delivery и reconnect reconciliation

**What to build:** Оператор видит серверные состояния доставки каждого исходящего сообщения, а reconnect восстанавливает пропущенные изменения без дублей.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 13 — Добавить durable send и idempotency recovery.

**Status:** ready-for-agent

- [ ] `Accepted / Delivered / Read / Failed` показываются только для релевантного исходящего Message.
- [ ] Delivery state не откатывается назад из-за out-of-order события.
- [ ] Checkpoint gap запускает bounded REST reconcile.
- [ ] Realtime остаётся hint, а REST projection побеждает конфликтующее событие.
- [ ] Selection/project generation guards игнорируют устаревший response.
- [ ] Ошибка доставки остаётся рядом с Message и предлагает безопасный lookup/retry path.
