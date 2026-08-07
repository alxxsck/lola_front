# 15 — Завершить delivery и reconnect reconciliation

**What to build:** Оператор видит серверные состояния доставки каждого исходящего сообщения, а reconnect восстанавливает пропущенные изменения без дублей.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 13 — Добавить durable send и idempotency recovery.

**Status:** partially-blocked-by-backend

**Backend gate (audit 2026-08-07):** REST delivery/reconcile можно реализовать, но ticket
нельзя закрыть без delivery/outcome lookup-retry и typed realtime contract. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#15--delivery-и-reconnect-reconciliation).

- [ ] `Accepted / Delivered / Read / Failed` показываются только для релевантного исходящего Message.
- [ ] Delivery state не откатывается назад из-за out-of-order события.
- [ ] Checkpoint gap запускает bounded REST reconcile.
- [ ] Realtime остаётся hint, а REST projection побеждает конфликтующее событие.
- [ ] Selection/project generation guards игнорируют устаревший response.
- [ ] Ошибка доставки остаётся рядом с Message и предлагает безопасный lookup/retry path.
