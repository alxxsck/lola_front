# 07 — Удалить legacy renderer, composer и перевод

**What to build:** Завершить expand–contract миграцию и оставить одну production-реализацию полноценного чата.

**Blocked by:** 05 — Перевести Users chat на Conversation Surface; 06 — Перевести Support chat на Conversation Surface.

**Status:** ready-for-agent

- [ ] Старые full-chat renderer и composer orchestration удалены после parity proof.
- [ ] Case detail не рисует самостоятельную переписку; evidence открывает общий Surface.
- [ ] В production source отсутствует второй translation toggle и копия message CSS.
- [ ] Users и Support используют один public root Conversation component.
- [ ] Characterization и shared behavior suites остаются зелёными после удаления.
- [ ] Поиск запрещённых legacy selectors/components добавлен в cutover verification.
