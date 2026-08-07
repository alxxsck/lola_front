# 06 — Перевести Support chat на Conversation Surface

**What to build:** Заменить самостоятельную ленту Support тем же Conversation Surface, который используется в Users, сохранив Support capabilities.

**Blocked by:** 04 — Ввести общий Conversation Surface рядом со старым UI.

**Status:** ready-for-agent

- [ ] Support selection передаёт общему Surface authoritative Conversation и capabilities.
- [ ] Translation toggle и rendering совпадают с Users визуально и семантически.
- [ ] Durable reply, delivery, AI Suspension и note extensions подключаются через typed capabilities.
- [ ] Selection/reconcile не создаёт вторую копию message state.
- [ ] Shared behavior suite проходит через Support adapter.
- [ ] Support adapter не копирует message bubbles, translation UI или composer frame.
