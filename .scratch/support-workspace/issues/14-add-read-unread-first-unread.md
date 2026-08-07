# 14 — Реализовать read/unread и first-unread

**What to build:** Каждый оператор видит личную durable позицию чтения и открывает историю с первого непрочитанного сообщения.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** ready-for-frontend

**Backend gate (готово 2026-08-08):** backend `main` `75739a1` публикует reader-scoped durable
read state/counts, first-unread anchor, signed older/newer history cursors и monotonic ACK внутри
authorization-bound IAM transaction. Готово, можно проверять и брать в frontend-разработку. См.
[аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#14--readunread-и-first-unread).

- [ ] Inbox показывает authoritative unread state/count без локального таймера.
- [ ] History ставит разделитель first-unread и сохраняет anchor при догрузке старых страниц.
- [ ] Read ACK отправляется high-water только после фактической видимости сообщения.
- [ ] Out-of-order ACK/realtime event не уменьшает read position.
- [ ] New-message pill не перетаскивает читающего оператора в конец автоматически.
- [ ] Reload/reconnect восстанавливает ту же read position.
