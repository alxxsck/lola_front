# 37 — Добавить evaluation, Decision log, cost и rollout

**What to build:** Lead сравнивает candidate policy с published revision,
понимает качество, стоимость и queue impact, затем безопасно запускает shadow,
canary, publish, pause или rollback; оператор видит permissioned объяснение
конкретного Case/Escalation.

**Blocked by:** 34–36; backend 34 — evaluation/observability/release contracts.

**Status:** blocked-by-backend

- [ ] Evaluation показывает dataset revision/distribution, candidate vs
      published, confusion/error buckets, precision/recall/F1, critical recall,
      attach/reopen и escalation accuracy.
- [ ] Safety coverage/gates видны per risk class × locale × channel, включая
      sentinel failures и canary stop conditions; aggregate не скрывает gap.
- [ ] Confidence calibration показывает calibrator/dataset revision, coverage
      и interval; model revision нельзя сравнивать старым threshold.
- [ ] Cost показывает tokens/cache/latency и cost на 1k signals, accepted Case,
      Escalation и resolved Case с policy/model revisions.
- [ ] Funnel различает product conversation, monitored Case, offered handoff,
      committed Escalation, accepted work и outcome; frontend его не пересчитывает.
- [ ] Decision log показывает stage, reason/rule, confidence, evidence refs,
      policy/model/compiler pins и consequence без raw prompt/CoT/PII.
- [ ] Correction хранит original decision и reviewed label отдельно; edit поля
      не «обучает модель» автоматически.
- [ ] Activation закрыта joint schema/overlap/calibration/safety/quality/cost/
      capacity admission атомарного release bundle; shadow/canary и queue impact видимы.
- [ ] Rollback создаёт новую immutable release revision; `409` и unknown outcome имеют
      expected version, idempotency lookup и authoritative reconcile.
- [ ] Fleet-forced Safety rebundle показывает progress/failure/fail-safe state;
      Project controls не могут удержать или откатить mandatory revision.
- [ ] Visual/keyboard/axe/E2E матрица проверяет overview, evaluation, versions,
      decision log и Case-scoped explain на desktop/tablet/mobile.
