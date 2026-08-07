# 06 — Перевести Support chat на Conversation Surface

**What to build:** Заменить самостоятельную ленту Support тем же Conversation Surface, который используется в Users, сохранив Support capabilities.

**Blocked by:** 04 — Ввести общий Conversation Surface рядом со старым UI.

**Status:** completed

- [x] Support selection передаёт общему Surface authoritative Conversation и capabilities.
- [x] Translation toggle и rendering совпадают с Users визуально и семантически.
- [x] Durable reply, delivery, AI Suspension и note extensions подключаются через typed capabilities.
- [x] Selection/reconcile не создаёт вторую копию message state.
- [x] Shared behavior suite проходит через Support adapter.
- [x] Support adapter не копирует message bubbles, translation UI или composer frame.
