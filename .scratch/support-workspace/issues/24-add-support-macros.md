# 24 — Подключить Support Macros от настройки до draft

**What to build:** Администратор публикует versioned macro, а оператор находит его в composer и получает обычный редактируемый draft.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 22 — Встроить internal-note composer mode.

**Status:** ready-for-agent

- [ ] Settings поддерживает create/draft/preview/publish/version/rollback/archive по permissions.
- [ ] Macro catalog ищется из composer с category/scope/freshness states.
- [ ] Variables валидируются серверным compiler contract и не подставляются из скрытых client данных.
- [ ] Выбор macro создаёт редактируемый public или note draft и ничего не отправляет автоматически.
- [ ] Message сохраняет macro/revision provenance после отправки.
- [ ] Stale/revoked macro не применяется и предлагает безопасное обновление catalog.
