# 05 — Перевести Users chat на Conversation Surface

**What to build:** Сохранить полноценный чат пользователя, но сделать его adapter общего Conversation Surface вместо самостоятельной реализации.

**Blocked by:** 04 — Ввести общий Conversation Surface рядом со старым UI.

**Status:** ready-for-agent

- [ ] Users launcher показывает тот же список, выбранный диалог, сообщения и composer через общий Surface.
- [ ] Существующий toggle перевода, bulk progress, reply preview и AI Suspension работают без регрессий.
- [ ] Draft, selected Conversation и history anchor сохраняются при profile/chat transitions.
- [ ] Permission revoke и project/user switch очищают чувствительное состояние.
- [ ] Shared behavior suite проходит через Users adapter.
- [ ] Adapter не содержит собственной message bubble/composer разметки.
