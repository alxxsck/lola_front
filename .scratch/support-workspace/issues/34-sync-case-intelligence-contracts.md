# 34 — Синхронизировать Case Intelligence contracts и settings foundation

**What to build:** После backend handoff закрепить в pinned OpenAPI closed DTO
для Case Detection, Human Escalation, Safety overlay, model/budget и immutable
Decision; создать frontend repository/controller seams и route-level settings
shell без legacy JSON как второго source of truth.

**Blocked by:** backend 31 — Case Intelligence policy/runtime contracts.

**Status:** blocked-by-backend

**Normative spec:**
[16-case-intelligence-detection-escalation.ru.md](../../../docs/specs/support-workspace-frontend/16-case-intelligence-detection-escalation.ru.md).

- [ ] Pinned OpenAPI содержит versioned Detection/Escalation/Safety/model DTO,
      revisions, allowedActions, exact permissions и safe errors.
- [ ] Decision различает conversation class, Case decision, review disposition,
      handoff action, Safety decision и independent stage
      states; frontend не вычисляет их из Messages.
- [ ] Atomic release bundle pin-ит Detection/Escalation/Safety/model/calibrator/
      dataset/routing overlay; UI не собирает effective tuple из latest частей.
- [ ] Mandatory Safety hotfix имеет read-only `SAFETY_RECONCILING`/replacement
      state, не требует Project approval и не допускает rollback ниже floor.
- [ ] Safety pending/failure и Assistant release gate имеют closed states и
      fail-safe fixtures, а не общий зелёный/красный `analysisState`.
- [ ] Repository скрывает ETag/version, idempotency/lookup, authority и
      permission-safe projections за одним глубоким модулем.
- [ ] `/support/settings/case-intelligence` имеет overview и вложенные deep
      links, feature gate, desktop/tablet/mobile route stack.
- [ ] Missing permission удаляет section, labels/counts и cached data из DOM.
- [ ] Legacy `/cases/settings` помечен compatibility-only и не получает новые
      поля/commands.
- [ ] Contract, controller, router и permission-revoke tests проходят.
