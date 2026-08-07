# 02 — Синхронизировать inbox, Case и workforce-контракты

**What to build:** Зафиксировать опубликованные контракты очередей и работы с Case, чтобы inbox, назначения, SLA и routing использовали серверную истину.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Capability matrix содержит Cases/Conversations inbox, cursor, search, filters, sort и Saved Views.
- [x] Зафиксированы Case workflow, classification correction, priority floor и server-provided allowed actions.
- [x] Зафиксированы claim/assign/transfer/release, assignment offers, version conflicts и audited reason requirements.
- [x] Зафиксированы availability, teams, skills, capacity, queues, routing reason/reservation и SLA clocks.
- [x] Fixtures покрывают empty/stale/degraded/forbidden/conflict/partial outcomes и неизвестные enum.
- [x] Pinned client и contract tests проходят без ручных DTO assertions.

Search/Saved Views responses, priority floor, Case action authority, eligible
assignment targets, offer/availability errors, current-Case routing/SLA,
bulk partial receipt и unknown-outcome lookup помечены `NOT_PUBLISHED` и не
подменены frontend DTO.
