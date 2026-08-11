# 37 — Добавить evaluation, Decision log, cost и публикацию

**What to build:** Lead сравнивает candidate policy с published revision,
понимает качество, стоимость и queue impact, затем валидирует и публикует
единственную active revision либо создаёт новую revision из прежней; оператор
видит permissioned объяснение конкретного Case/Escalation.

**Blocked by:** 34–36; backend 34 — evaluation/observability/release contracts.

**Status:** complete

**Backend contract:** `5b81a6826d1af91b86feb2d3fe1575957fc0c5fb`.
Составной OpenAPI закреплён хешем
`sha256:3f57fb00dfafb91c41fdfdd949ce9d6fd84ad4219c93c37c905557f68113d097`.

**Delivery invariant:** функциональность постоянная и permission-gated. Нет
frontend feature flags, env toggles, staged rollout, shadow/canary surface или
параллельного legacy режима.

- [x] Evaluation показывает dataset revision/distribution, candidate vs
      published, confusion/error buckets, precision/recall/F1, critical recall,
      attach/reopen и escalation accuracy.
- [x] Safety coverage/gates видны per risk class × locale × channel, включая
      sentinel failures и publish blockers; aggregate не скрывает gap.
- [x] Confidence calibration показывает calibrator/dataset revision, coverage
      и interval; model revision нельзя сравнивать старым threshold.
- [x] Cost показывает tokens/cache/latency и cost на 1k signals, accepted Case,
      Escalation и resolved Case с policy/model revisions.
- [x] Funnel различает product conversation, monitored Case, offered handoff,
      committed Escalation, accepted work и outcome; frontend его не пересчитывает.
- [x] Decision log показывает stage, reason/rule, confidence, evidence refs,
      policy/model/compiler pins и consequence без raw prompt/CoT/PII.
- [x] Correction хранит original decision и reviewed label отдельно; edit поля
      не «обучает модель» автоматически.
- [x] Publish закрыт joint schema/overlap/calibration/safety/quality/cost/
      capacity admission атомарного bundle; queue impact видим до подтверждения.
- [x] Rollback создаёт новую immutable release revision; `409` и unknown outcome имеют
      expected version, idempotency lookup и authoritative reconcile.
- [x] Fleet-forced Safety rebundle показывает progress/failure/fail-safe state;
      Project controls не могут удержать или откатить mandatory revision.
- [x] Visual/keyboard/axe/E2E матрица проверяет overview, evaluation, versions,
      decision log и Case-scoped explain на desktop/tablet/mobile.
