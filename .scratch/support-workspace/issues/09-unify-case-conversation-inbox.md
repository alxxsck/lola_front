# 09 — Объединить Cases и Conversations в одном inbox

**What to build:** Оператор переключается между обращениями и всеми чатами внутри одного рабочего места и открывает точную рабочую единицу по URL.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** done

- [x] Inbox имеет режимы `Обращения` и `Все чаты` с server-owned cursor pages.
- [x] Case и Conversation остаются разными domain objects и имеют разные canonical routes.
- [x] Selection кодируется в URL и восстанавливается после reload/Back/Forward.
- [x] Row показывает только опубликованные безопасные signals без client inference: Case status/waiting, priority, group и attention; Conversation status/count/activity. Unread, draft, assignment и SLA отсутствуют в pinned row contract и намеренно не вычисляются на клиенте.
- [x] Empty/loading/error/forbidden/conflict состояния не схлопывают workspace; `403/404` очищают projection fail-closed. Server freshness/stale projection пока не опубликована и не имитируется локальным timestamp.
- [x] Conversation без Case остаётся доступной и не получает фиктивное обращение; Case без Conversation также остаётся отдельным рабочим объектом.

**Evidence:** `docs/evidence/ticket-09-conversations-desktop.png`, `ticket-09-cases-desktop.png`, `ticket-09-case-without-conversation.png`, `ticket-09-cases-tablet-1024.png`, `ticket-09-cases-mobile-390.png`.
