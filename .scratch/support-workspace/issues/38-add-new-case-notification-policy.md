# 38 — Добавить Project notifications о новых Cases

**What to build:** Support Lead временно или постоянно включает уведомления о
каждом admitted CREATE/REOPEN Case, выбирает scope и видит impact, не смешивая
обычные обращения с Human Escalation и не управляя чужими browser devices.

**Blocked by:** 27 — personal browser settings/device lifecycle; 34 — typed
Case Intelligence decision; backend 35 — New Case Notification Policy.

**Status:** complete

**Delivery invariant:** после появления backend contract это постоянная
permission-gated capability. Frontend feature flags, env toggles, staged
rollout и legacy notification editor не допускаются.

- [x] Project control виден только с
      `project.support.notification_policy.manage`; role name не используется.
- [x] Editor поддерживает `OFF/IMMEDIATE/DIGEST`, CREATE/REOPEN, product
      classes/topics/priority, eligible subscribers/Teams и effective-from/to.
- [x] Preview показывает estimated events/recipients/delivery volume и safe
      examples до publish; expiry виден заранее.
- [x] Personal toggles разделяют `Новые обращения`, `Требует человека` и
      `Назначено мне`; browser permission и registered device остаются отдельно.
- [x] Project enable не выглядит active personal push без subscription/device и
      не позволяет Lead менять чужие preferences.
- [x] CREATE и последующая Escalation показывают две разные deliveries/topics;
      ordinary Message/ATTACH/correction не создаёт повторный New Case push.
- [x] Generic body/deep link не раскрывают PII; click после login/project
      restore повторно авторизует exact Case.
- [x] Draft/publish/disable/restore сохраняют expected version, idempotency,
      unknown-outcome lookup и permission-revoke purge.
- [x] Component, keyboard/axe, desktop/mobile и E2E tests покрывают immediate,
      digest, expiry, denied browser permission и separate escalation delivery.
