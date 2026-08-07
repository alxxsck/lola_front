# 05 — Перевести Users chat на Conversation Surface

**What to build:** Сохранить полноценный чат пользователя, но сделать его adapter общего Conversation Surface вместо самостоятельной реализации.

**Blocked by:** 04 — Ввести общий Conversation Surface рядом со старым UI.

**Status:** completed

- [x] Users launcher показывает тот же список, выбранный диалог, сообщения и composer через общий Surface.
- [x] Существующий toggle перевода, bulk progress, reply preview и AI Suspension работают без регрессий.
- [x] Draft, selected Conversation и history anchor сохраняются при profile/chat transitions.
- [x] Permission revoke и project/user switch очищают чувствительное состояние.
- [x] Shared behavior suite проходит через Users adapter.
- [x] Adapter не содержит собственной message bubble/composer разметки.
