# 21 — Добавить viewers, typing и collision warning

**What to build:** Операторы видят параллельную работу до отправки ответа, не принимая краткоживущий presence за назначение.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** blocked-by-backend

**Backend gate (audit 2026-08-07):** полный blocker — operator viewers/typing contract с
TTL, generation, renew/unwatch и revoke не опубликован. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#21--viewers-typing-и-collision-warning).

- [ ] Watch lifecycle ограничен project/Conversation/actor и закрывается при route switch/revoke.
- [ ] Viewers и typing используют TTL/generation и исчезают после reconnect/expiry.
- [ ] Старое typing-stop событие не сбрасывает новую generation.
- [ ] Collision warning появляется, когда другой оператор печатает или уже отправил ответ.
- [ ] Presence не меняет assignment, claimant, availability или delivery.
- [ ] Draft/body никогда не отправляются в presence payload или telemetry.
