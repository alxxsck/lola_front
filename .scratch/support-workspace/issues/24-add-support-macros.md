# 24 — Подключить Support Macros от настройки до draft

**What to build:** Администратор публикует versioned macro, а оператор находит его в composer и получает обычный редактируемый draft.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 22 — Встроить internal-note composer mode.

**Status:** partially-blocked-by-backend

**Backend gate (audit 2026-08-07):** catalog/draft/send доступны; version history,
rollback и typed Message provenance не опубликованы. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#24--support-macros).

- [ ] Settings поддерживает create/draft/preview/publish/version/rollback/archive по permissions.
- [ ] Macro catalog ищется из composer с category/scope/freshness states.
- [ ] Variables валидируются серверным compiler contract и не подставляются из скрытых client данных.
- [ ] Выбор macro создаёт редактируемый public или note draft и ничего не отправляет автоматически.
- [ ] Message сохраняет macro/revision provenance после отправки.
- [ ] Stale/revoked macro не применяется и предлагает безопасное обновление catalog.
