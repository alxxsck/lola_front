# 20 — Добавить permission-gated inspector tabs

**What to build:** Оператор получает Case, пользовательский и продуктовый контекст рядом с перепиской, не открывая старые страницы и не загружая недоступные данные.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** dependency-blocked-by-16

**Backend gate (audit 2026-08-07):** прямого backend-блокера у inspector tabs нет — profile,
state, events и activity reads опубликованы. Полное выполнение ждёт незаблокированную часть 16 по
явной dependency. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#20--permission-gated-inspector-tabs).

- [ ] Tabs `Обращение`, `Пользователь`, `Данные`, `События`, `Активность` имеют независимые loading/error/empty states.
- [ ] Sensitive fields загружаются лениво только после permission check.
- [ ] Revoke/project switch удаляют закрытые данные из DOM, cache и watches.
- [ ] Activity использует server causal timeline, а не синтетический websocket log.
- [ ] Inspector tab сохраняется для оператора только пока остаётся разрешённым.
- [ ] Tablet drawer и mobile route возвращают focus и сохраняют Conversation state.
