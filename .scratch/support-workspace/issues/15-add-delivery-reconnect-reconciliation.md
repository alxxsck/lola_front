# 15 — Завершить delivery и reconnect reconciliation

**What to build:** Оператор видит серверные состояния доставки каждого исходящего сообщения, а reconnect восстанавливает пропущенные изменения без дублей.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 13 — Добавить durable send и idempotency recovery.

**Status:** ready-for-frontend

**Backend gate (проверено 2026-08-08):** снят backend `main` `0f5404f`. Опубликованы
authoritative delivery receipt, безопасный lookup/retry, полный typed realtime contract и bounded
REST reconciliation contract. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#15--delivery-и-reconnect-reconciliation).

- [x] `Accepted / Delivered / Read / Failed` показываются только для релевантного исходящего Message.
- [x] Delivery state не откатывается назад из-за out-of-order события.
- [x] Checkpoint gap запускает bounded REST reconcile.
- [x] Realtime остаётся hint, а REST projection побеждает конфликтующее событие.
- [x] Selection/project generation guards игнорируют устаревший response.
- [x] Ошибка доставки остаётся рядом с Message и предлагает безопасный lookup/retry path.
