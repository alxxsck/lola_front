# 21 — Добавить viewers, typing и collision warning

**What to build:** Операторы видят параллельную работу до отправки ответа, не принимая краткоживущий presence за назначение.

**Blocked by:** 01 — Синхронизировать workspace и messaging-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** done

**Backend gate:** разблокирован в backend `df62f44`; frontend pin синхронизирован
из этого committed checkout. PostgreSQL gate: 541 миграция, 100 операторов,
100 чтений при concurrency 10, p95 94.3 мс.

- [x] Watch lifecycle ограничен project/Conversation/actor и закрывается при route switch/revoke.
- [x] Viewers и typing используют TTL/generation и исчезают после reconnect/expiry.
- [x] Старое typing-stop событие не сбрасывает новую generation.
- [x] Collision warning появляется, когда другой оператор печатает или уже отправил ответ.
- [x] Presence не меняет assignment, claimant, availability или delivery.
- [x] Draft/body никогда не отправляются в presence payload или telemetry.
