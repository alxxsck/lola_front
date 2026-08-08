# 14 — Реализовать read/unread и first-unread

**What to build:** Каждый оператор видит личную durable позицию чтения и открывает историю с первого непрочитанного сообщения.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** complete

**Backend gate (готово 2026-08-08):** backend `main` `75739a1` публикует reader-scoped durable
read state/counts, first-unread anchor, signed older/newer history cursors и monotonic ACK внутри
authorization-bound IAM transaction. Готово, можно проверять и брать в frontend-разработку. См.
[аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#14--readunread-и-first-unread).

- [x] Inbox показывает authoritative unread state/count без локального таймера.
- [x] History ставит разделитель first-unread и сохраняет anchor при догрузке старых страниц.
- [x] Read ACK отправляется high-water только после фактической видимости сообщения.
- [x] Out-of-order ACK/realtime event не уменьшает read position.
- [x] New-message pill не перетаскивает читающего оператора в конец автоматически.
- [x] Reload/reconnect восстанавливает ту же read position.

**Frontend proof (2026-08-08):** pinned OpenAPI синхронизирован с backend `2113c995`;
controller и общий Conversation Surface покрывают first-unread, older/newer pagination,
visibility high-water ACK, Case/Conversation target isolation и reconnect reconciliation.
Проверены desktop `1440×1000` и mobile `390×844`: без horizontal overflow,
mobile scroll lock активен, интерактивные элементы composer имеют высоту `44px`.
