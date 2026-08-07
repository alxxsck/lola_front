# 27 — Реализовать browser notification settings

**What to build:** Оператор управляет типами уведомлений и зарегистрированными устройствами, а безопасный click возвращает его в точный разрешённый Support context.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** ready-for-agent

- [ ] Browser permission, backend preference и registered subscription/device показываются как разные состояния.
- [ ] UI не показывает enabled, когда permission denied/revoked или subscription не подтверждена backend.
- [ ] Operator управляет notification types и удаляет потерянное устройство по permissions.
- [ ] Payload содержит generic безопасный текст без PII/message body/internal note.
- [ ] Click после login/project restore открывает exact permitted Case/view deep link.
- [ ] Expired/revoked subscription имеет понятный recovery flow и audit-safe error.
