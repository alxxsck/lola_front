# 04 — Ввести общий Conversation Surface рядом со старым UI

**What to build:** Создать один переиспользуемый модуль переписки, который можно подключить к Users и Support без изменения существующего пользовательского поведения.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Общий Surface владеет message log, author/time/status, history pagination и scroll anchor.
- [x] Toggle `Оригинал / Перевод`, translation progress и reply preview являются частью одного поведения.
- [x] Composer contract сохраняет scoped draft и допускает typed capabilities без альтернативного renderer через slots.
- [x] Characterization suite фиксирует текущее поведение Users chat до миграции adapters.
- [x] Surface не знает route layout, Case policy, backend role names или конкретный launcher.
- [x] Старые call sites продолжают работать до отдельных migrate-задач.
