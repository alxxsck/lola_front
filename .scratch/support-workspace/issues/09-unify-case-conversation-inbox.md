# 09 — Объединить Cases и Conversations в одном inbox

**What to build:** Оператор переключается между обращениями и всеми чатами внутри одного рабочего места и открывает точную рабочую единицу по URL.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** ready-for-agent

- [ ] Inbox имеет режимы `Обращения` и `Все чаты` с server-owned cursor pages.
- [ ] Case и Conversation остаются разными domain objects и имеют разные canonical routes.
- [ ] Selection кодируется в URL и восстанавливается после reload/Back/Forward.
- [ ] Row показывает безопасные unread/draft/assignment/priority/SLA/waiting signals без client inference.
- [ ] Empty/loading/error/forbidden/stale состояния не схлопывают workspace.
- [ ] Conversation без Case остаётся доступной и не получает фиктивное обращение.
