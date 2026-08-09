# 24 — Подключить Support Macros от настройки до draft

**What to build:** Администратор публикует versioned macro, а оператор находит его в composer и получает обычный редактируемый draft.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 22 — Встроить internal-note composer mode.

**Status:** frontend-complete

**Backend gate (re-audit 2026-08-09):** снят backend commit
`565762c42654ba789470648d76d26d3d5747d294`: опубликованы preview, revision
history, rollback, closed failures и CMS-only Message provenance.

- [x] Settings поддерживает create/draft/preview/publish/version/rollback/archive по permissions.
- [x] Macro catalog ищется из composer с category/scope/freshness states.
- [x] Variables валидируются серверным compiler contract и не подставляются из скрытых client данных.
- [x] Выбор macro создаёт редактируемый public или note draft и ничего не отправляет автоматически.
- [x] Message сохраняет macro/revision provenance после отправки.
- [x] Stale/revoked macro не применяется и предлагает безопасное обновление catalog.
