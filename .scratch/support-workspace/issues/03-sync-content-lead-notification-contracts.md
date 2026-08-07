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

Browser notification preferences, subscriptions, devices и safe deep-link
contracts присутствуют в текущем backend source, но отсутствуют в pinned
OpenAPI/generated client. До повторного pin/generate они остаются
`NOT_PUBLISHED`; legacy email preferences и Notification Destinations не
используются как замена.
