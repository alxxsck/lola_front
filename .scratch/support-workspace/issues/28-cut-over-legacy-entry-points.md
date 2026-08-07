# 28 — Перевести legacy entry points на Support

**What to build:** Ежедневный операторский flow открывается через канонический Support Workspace, а старые Users/Live/Cases входы больше не создают параллельную рабочую поверхность.

**Blocked by:** 07 — Удалить legacy renderer, composer и перевод; 08 — Реализовать общий full-tab presentation shell; 09 — Объединить Cases и Conversations в одном inbox; 10 — Добавить server search, filters и sort; 11 — Подключить Saved Views; 12 — Завершить tablet/mobile route stack; 13 — Добавить durable send и idempotency recovery; 14 — Реализовать read/unread и first-unread; 15 — Завершить delivery и reconnect reconciliation; 16 — Завершить Case workflow и классификацию; 17 — Завершить действия оператора с назначением; 18 — Добавить назначение и override для лида; 19 — Добавить SLA, routing и availability context; 20 — Добавить permission-gated inspector tabs.

**Status:** transitively-blocked-by-backend

**Backend gate (audit 2026-08-07):** frontend redirects можно делать, но writable core
cutover ждёт backend gaps 10–19 и project-level Support rollout contract. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#28--cutover-legacy-entry-points).

- [ ] Legacy links открывают canonical Support Case/Conversation URL и сохраняют разрешённый selection context.
- [ ] Старые Case/chat actions не остаются второй writable surface.
- [ ] Feature flag отключает новый route без отката уже принятых backend commands.
- [ ] Direct reload, Back/Forward, login и project restore проходят route/permission guards.
- [ ] Core cutover не заблокирован задачами 21–27 или 30–33.
- [ ] Rollback path и оставшийся legacy adapter явно ограничены launcher/deep-link поведением.
