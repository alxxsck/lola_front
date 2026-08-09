# 27 — Реализовать browser notification settings

**What to build:** Оператор управляет типами уведомлений и зарегистрированными устройствами, а безопасный click возвращает его в точный разрешённый Support context.

**Blocked by:** снято backend `8758358e`; frontend использует canonical inbox из 09.

**Status:** frontend-complete

**Backend gate (validated 2026-08-09):** backend `8758358e` публикует personal
preferences/admission, versioned browser subscriptions и actor-bound одноразовый
Support deep link. Контракт синхронизирован в pinned OpenAPI.

- [x] Browser permission, backend preference и registered subscription/device показываются как разные состояния.
- [x] UI не показывает delivery active, когда permission/subscription/backend registration или rollout не подтверждены.
- [x] Operator управляет двумя опубликованными notification types и удаляет устройство по permissions.
- [x] `SUPPORT_CASE_CREATED` не подменяется текущими topics: Project-wide scope/editor остаётся Task 38/backend 35.
- [x] Payload содержит только generic безопасный текст без PII/message body/internal note.
- [x] Capability передаётся во fragment, удаляется до auth redirect и после login/project restore открывает exact permitted Case.
- [x] Expired/revoked/rotated subscription имеет audit-safe recovery, versioned revoke и logout cleanup.

## Финальная валидация frontend (2026-08-09)

- Critical live regression исправлен: browser association теперь реактивна в текущем controller и
  сохраняется через reload; ACTIVE backend device распознаётся как точный текущий browser.
- Logout/connect races закрыты общей serialized browser lifecycle queue, actor-scoped receipt
  recovery и deadline-bounded best-effort unsubscribe/revoke.
- Focused notification/controller/router/component/contract проверки зелёные.
- Полный Vitest: `398 files / 2576 tests PASS`.
- Playwright: `6/6 PASS` в `chromium` и `mobile-chromium`, включая connect, reload, revoke,
  reconnect и authenticated/expired-session deep link.
- `api:check`, `typecheck`, `lint + architecture`, `test:scripts`, `build` и
  `git diff --check` зелёные.
- Независимые Standards/architecture/security и Spec/acceptance reviews: P0/P1 PASS.

## Отложенный P2

- Привести notification settings panels к общему Support Workspace visual system: radius `14px`
  и quiet borders/tonal shifts без декоративного `shadow-sm`. Текущая компоновка и доступность
  проверены и не блокируют Ticket 27.
