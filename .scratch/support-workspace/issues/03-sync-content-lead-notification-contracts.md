# 03 — Синхронизировать content, Lead Control и notification-контракты

**What to build:** Подготовить проверенные frontend-контракты для внутренней работы, контроля лида и браузерных уведомлений.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Capability matrix содержит internal notes, macros и Support Internal Knowledge с отдельными permissions и revisions.
- [x] Lead summary, risks, alerts, investigation, drill-down и audited commands привязаны к published operations.
- [x] Notification preferences, browser subscriptions, devices и deep-link payloads зафиксированы отдельно.
- [x] Sensitive content, masking, retention и purge requirements отражены в contracts/fixtures.
- [x] Fixtures покрывают denied permission, revoked subscription, stale projection, partial action и unknown outcome.
- [x] Feature flags и backend owners указаны для каждого capability gap.

Backend `origin/main` содержит внутренние notification policy/intent slices, но
не публикует browser preference, subscription/device или safe deep-link
controllers в OpenAPI. Они остаются `NOT_PUBLISHED`; legacy email preferences и
Notification Destinations не используются как замена.

**Повторная проверка 2026-08-07:** backend `origin/main`
`0ca33c93e52d689de388187091e6aa2f6c05639b`; fresh export семантически совпал с
pinned artifact, source revision обновлена, contract fixtures и generation зелёные.
