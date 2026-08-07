# 20 — Добавить permission-gated inspector tabs

**What to build:** Оператор получает Case, пользовательский и продуктовый контекст рядом с перепиской, не открывая старые страницы и не загружая недоступные данные.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** ready-for-agent

- [ ] Tabs `Обращение`, `Пользователь`, `Данные`, `События`, `Активность` имеют независимые loading/error/empty states.
- [ ] Sensitive fields загружаются лениво только после permission check.
- [ ] Revoke/project switch удаляют закрытые данные из DOM, cache и watches.
- [ ] Activity использует server causal timeline, а не синтетический websocket log.
- [ ] Inspector tab сохраняется для оператора только пока остаётся разрешённым.
- [ ] Tablet drawer и mobile route возвращают focus и сохраняют Conversation state.
