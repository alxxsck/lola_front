# 07 — Удалить legacy renderer, composer и перевод

**What to build:** Завершить expand–contract миграцию и оставить одну production-реализацию полноценного чата.

**Blocked by:** 05 — Перевести Users chat на Conversation Surface; 06 — Перевести Support chat на Conversation Surface.

**Status:** completed

- [x] Старые full-chat renderer и composer orchestration удалены после parity proof.
- [x] Case detail не рисует самостоятельную переписку; evidence открывает общий Surface.
- [x] В production source отсутствует второй translation toggle и копия message CSS.
- [x] Users и Support используют один public root Conversation component.
- [x] Characterization и shared behavior suites остаются зелёными после удаления.
- [x] Поиск запрещённых legacy selectors/components добавлен в cutover verification.

**Visual QA:**

- `artifacts/support-workspace/ticket-07/conversation-surface-desktop.jpg`
- `artifacts/support-workspace/ticket-07/conversation-surface-mobile-390x844.jpg`
- `artifacts/support-workspace/ticket-07/case-evidence-desktop.jpg`
- `artifacts/support-workspace/ticket-07/case-evidence-mobile-390x844.jpg`
