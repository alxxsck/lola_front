# 36 — Построить Human Escalation и Safety editor с simulator

**What to build:** Lead настраивает, когда предложить человека, один раз
уточнить причину или немедленно создать Human Escalation, не смешивая это с
Case detection, routing или неизменяемыми platform safety rules.

**Разблокировано:** backend
`2996e7f3b20f68c325bf852391c7abd396e244ec` — полный контракт правил передачи,
обязательной безопасности и проверки сценариев.

**Status:** frontend-complete

**Delivery invariant:** canonical settings работают постоянно по server-owned
permissions. Frontend feature flags, env toggles, staged rollout, shadow/canary
и legacy editor не допускаются.

- [x] Explicit-human-request terms по locale и semantic guidance представлены
      раздельно: confirmed request всегда `ESCALATE`, ambiguous term/scenario
      может выбрать `OFFER/ASK_REASON_ONCE/ESCALATE`.
- [x] Scenario editor использует stable codes и trusted outcomes
      `NO_ANSWER/KNOWLEDGE_INSUFFICIENT/TOOL_FAILED/UNRESOLVED` для counters.
- [x] Clarification/failure/repeat/no-match thresholds не выводятся из числа
      сообщений в браузере и проходят server dry-run.
- [x] Simulator показывает transition table по attempt/outcome: replay,
      precedence, increment/reset/freeze, accept/decline, timeout и policy switch.
- [x] Urgency, reason, data-to-collect и Routing Policy reference разделены;
      конкретный assignee не задаётся свободным текстом guidance.
- [x] Platform Safety detection показан locked и не отключается budget/pause;
      Project меняет только разрешённый queue/SLA/channel overlay.
- [x] Closed safety classes/severity/consequences видимы; pending/failure
      блокирует ordinary reply и показывает retry/safe fallback/alert state.
- [x] Simulator показывает последовательность turns, counters, review/handoff/
      Safety results и момент committed Escalation, включая direct request.
- [x] Ordinary monitored Case не создаёт Human Attention. Optional New Case
      topic остаётся отдельной policy/задачей и не меняет handoff semantics.
- [x] После Escalation UI различает routing admission и не обещает подключение
      до `ROUTABLE`; out-of-hours/no-team/degraded имеют approved copy.
- [x] Permission/revoke, conflict, unknown outcome, keyboard/axe и responsive
      tests проходят.
