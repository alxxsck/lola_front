# 02 — Синхронизировать inbox, Case и workforce-контракты

**What to build:** Зафиксировать опубликованные контракты очередей и работы с Case, чтобы inbox, назначения, SLA и routing использовали серверную истину.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Capability matrix содержит Cases/Conversations inbox, cursor, search, filters, sort и Saved Views.
- [ ] Зафиксированы Case workflow, classification correction, priority floor и server-provided allowed actions.
- [ ] Зафиксированы claim/assign/transfer/release, assignment offers, version conflicts и audited reason requirements.
- [ ] Зафиксированы availability, teams, skills, capacity, queues, routing reason/reservation и SLA clocks.
- [ ] Fixtures покрывают empty/stale/degraded/forbidden/conflict/partial outcomes и неизвестные enum.
- [ ] Pinned client и contract tests проходят без ручных DTO assertions.
