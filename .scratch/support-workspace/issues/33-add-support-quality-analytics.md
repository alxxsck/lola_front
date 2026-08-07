# 33 — Реализовать Support Quality и Analytics после contract handoff

**What to build:** После публикации отдельных IAM/API-контрактов QA reviewer получает versioned review workflow, а разрешённые пользователи — server-owned аналитику с безопасным drill-down.

**Blocked by:** 29 — Провести hardening, pilot и rollback core Support; published backend/IAM handoff for QA and analytics.

**Status:** blocked-by-backend-and-iam

**Backend gate (audit 2026-08-07):** полный blocker — Support QA IAM, immutable review,
scorecard workflow и server analytics metric contracts отсутствуют. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#33--support-quality-и-analytics).

- [ ] QA использует immutable review snapshot, versioned scorecard, evidence и submit/feedback/dispute/calibration flow.
- [ ] QA permissions не раскрывают лишние PII, internal notes или текущие mutable данные вне snapshot.
- [ ] Analytics использует server metric catalog, definition, timezone/cohort/freshness и no-data semantics.
- [ ] Drill-down повторно проверяет authority; export/share выполняются на сервере по отдельным permissions.
- [ ] Браузер не считает employee score или project metrics из загруженных Messages.
- [ ] Legacy gaps/incomplete coverage обозначены явно; QA и analytics имеют независимые rollout flags.
