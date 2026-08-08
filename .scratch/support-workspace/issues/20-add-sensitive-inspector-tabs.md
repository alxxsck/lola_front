# 20 — Добавить permission-gated inspector tabs

**What to build:** Оператор получает Case, пользовательский и продуктовый контекст рядом с перепиской, не открывая старые страницы и не загружая недоступные данные.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию.

**Status:** frontend-complete

**Backend gate (resolved 2026-08-08):** backend `main` `05bbbbd` публикует permission-safe
Profile, bounded Events recipe и server causal Activity. Pinned OpenAPI синхронизирован с этим
чистым committed checkout; зависимость 16 закрыта. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#20--permission-gated-inspector-tabs).

- [x] Tabs `Обращение`, `Пользователь`, `Данные`, `События`, `Активность` имеют независимые loading/error/empty states.
- [x] Sensitive fields загружаются лениво только после permission check.
- [x] Revoke/project switch удаляют закрытые данные из DOM, cache и watches.
- [x] Activity использует server causal timeline, а не синтетический websocket log.
- [x] Inspector tab сохраняется для оператора только пока остаётся разрешённым.
- [x] Tablet drawer и mobile route возвращают focus и сохраняют Conversation state.

## Frontend evidence (2026-08-08)

- Единый Inspector controller владеет тремя независимыми lazy-проекциями: Product Profile,
  bounded Case Events и server causal Activity; старый отдельный Support profile controller удалён.
- Точный permission loss, 403/404, смена Project, End User, Case или CMS-оператора синхронно
  abort/purge закрытые данные и не позволяют запоздалому ответу вернуться в DOM/cache.
- Events используют отдельное 30-дневное окно, Activity — backend-совместимое окно 7 дней;
  восстановление вкладки привязано к оператору и не оживляет отозванный доступ.
- Product external IDs удалены из Support, Case и Profile UI вместе с серверным query; restricted
  поля отображаются только по серверному `ALLOWED | REDACTED | FORBIDDEN` решению. Новые поля
  по умолчанию `HIDDEN`, а редактор явно сохраняет `HIDDEN | BASE | RESTRICTED`.
- Desktop, tablet drawer и mobile route проверены на 1440×1000, 1024×768 и 390×844; background
  scroll заблокирован, горизонтального overflow и перекрытия tab labels нет, черновик Conversation
  и focus return сохранены; tabs поддерживают roving focus и Arrow/Home/End.
- Vitest 2339/2339, script/contract tests 50/50, Support Workspace Playwright 27/27, TypeScript,
  lint/architecture и production build прошли. Финальные architecture/security, Standards и Spec
  review: PASS, P0/P1 не осталось; P2 отложены по договорённости.
