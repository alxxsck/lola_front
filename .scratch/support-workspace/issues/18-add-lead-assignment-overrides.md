# 18 — Добавить назначение и override для лида

**What to build:** Lead назначает и переназначает Case оператору или команде из Control и inspector через общий audited assignment flow.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 16 — Завершить Case workflow и классификацию; 17 — Завершить действия оператора с назначением.

**Status:** partially-blocked-by-backend

**Backend gate (audit 2026-08-07):** single-Case commands существуют; eligible targets,
explicit override action и bulk per-item receipt отсутствуют. См. [аудит 01–33](../../../docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md#18--назначение-и-override-для-лида).

- [ ] Lead может assign/reassign/unassign Case оператору или команде по отдельным permissions.
- [ ] Override availability/capacity требует отдельного allowed action и обязательной причины.
- [ ] Command использует revision/OCC и показывает conflict без потери текущего контекста.
- [ ] Bulk assignment возвращает per-item success/failure и не скрывает partial outcome.
- [ ] Действие доступно из Lead Control drill-down и Case inspector через один use case.
- [ ] Audit timeline фиксирует actor, reason, target, override и command outcome.
