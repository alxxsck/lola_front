# 36 — Построить Human Escalation и Safety editor с simulator

**What to build:** Lead настраивает, когда предложить человека, один раз
уточнить причину или немедленно создать Human Escalation, не смешивая это с
Case detection, routing или неизменяемыми platform safety rules.

**Blocked by:** 34 — синхронизировать Case Intelligence contracts; backend
31–33 — policy foundation и stateful escalation evaluator.

**Status:** blocked-by-backend

**Delivery invariant:** canonical settings работают постоянно по server-owned
permissions. Frontend feature flags, env toggles, staged rollout, shadow/canary
и legacy editor не допускаются.

- [ ] Explicit-human-request terms по locale и semantic guidance представлены
      раздельно: confirmed request всегда `ESCALATE`, ambiguous term/scenario
      может выбрать `OFFER/ASK_REASON_ONCE/ESCALATE`.
- [ ] Scenario editor использует stable codes и trusted outcomes
      `NO_ANSWER/KNOWLEDGE_INSUFFICIENT/TOOL_FAILED/UNRESOLVED` для counters.
- [ ] Clarification/failure/repeat/no-match thresholds не выводятся из числа
      сообщений в браузере и проходят server dry-run.
- [ ] Simulator показывает transition table по attempt/outcome: replay,
      precedence, increment/reset/freeze, accept/decline, timeout и policy switch.
- [ ] Urgency, reason, data-to-collect и Routing Policy reference разделены;
      конкретный assignee не задаётся свободным текстом guidance.
- [ ] Platform Safety detection показан locked и не отключается budget/pause;
      Project меняет только разрешённый queue/SLA/channel overlay.
- [ ] Closed safety classes/severity/consequences видимы; pending/failure
      блокирует ordinary reply и показывает retry/safe fallback/alert state.
- [ ] Simulator показывает последовательность turns, counters, review/handoff/
      Safety results и момент committed Escalation, включая direct request.
- [ ] Ordinary monitored Case не создаёт Human Attention. Optional New Case
      topic остаётся отдельной policy/задачей и не меняет handoff semantics.
- [ ] После Escalation UI различает routing admission и не обещает подключение
      до `ROUTABLE`; out-of-hours/no-team/degraded имеют approved copy.
- [ ] Permission/revoke, conflict, unknown outcome, keyboard/axe и responsive
      tests проходят.
