# 34 — Синхронизировать Case Intelligence contracts и settings foundation

**What to build:** После backend handoff закрепить в pinned OpenAPI доступные
closed DTO для Case Detection, Human Escalation, Safety, budget и immutable
Decision; создать frontend repository/controller seams и постоянный
route-level settings shell без legacy JSON как второго source of truth.

**Backend basis:** локальный завершённый backend commit `e9650e8e` (Tickets
31–32). Новые server-owned поля подключаются последующими contract sync без
временных frontend моделей.

**Status:** implemented-current-scope — backend-contract-follow-up

**Completed against:** backend `e9650e8e8d2831232eeabf09f88960fac1f52f6d1`
and pinned OpenAPI
`sha256:cf4da961270d5946a3b1f1fd81afef0960ed57169d7ecd3bc2e0b2db6caed18f`.
Новые server-owned projections подключаются последующим additive contract sync;
этот foundation не подменяет их временными браузерными моделями. Известный
backend follow-up: OpenAPI пока публикует `routerContext.maxSignals <= 20`, тогда
как pinned compiler принимает `<= 8`, и не публикует верхние границы 365 дней
для attach/reopen windows и часть compiler-ограничений stable codes/scalars.
Frontend валидирует фактические ограничения pinned compiler, но не объявляет
этот разрыв закрытым typed contract до исправления backend OpenAPI.

**Normative spec:**
[16-case-intelligence-detection-escalation.ru.md](../../../docs/specs/support-workspace-frontend/16-case-intelligence-detection-escalation.ru.md).

- [ ] Pinned OpenAPI содержит все доступные versioned Detection/Escalation/
      Safety/budget DTO, revisions, allowedActions и exact permissions; UI не
      выдумывает отсутствующие model, confidence или error projections.
      **Backend follow-up:** выровнять schema bounds с compiler для
      `maxSignals`, attach/reopen windows, stable codes и scalar collections.
- [x] Decision различает conversation class, Case decision, review disposition,
      handoff action, Safety decision и independent stage
      states; frontend не вычисляет их из Messages.
- [x] Atomic release bundle pin-ит Detection/Escalation/Safety/model/calibrator/
      dataset/routing overlay; UI не собирает effective tuple из latest частей.
- [x] Mandatory Safety hotfix имеет read-only `SAFETY_RECONCILING`/replacement
      state, не требует Project approval и не допускает rollback ниже floor.
- [x] Safety pending/failure и Assistant release gate имеют closed states и
      fail-safe fixtures, а не общий зелёный/красный `analysisState`.
- [x] Repository скрывает ETag/version, idempotency/lookup, authority и
      permission-safe projections за одним глубоким модулем.
- [x] `/support/settings/case-intelligence` имеет overview и вложенные deep
      links, desktop/tablet/mobile route stack и всегда доступен при наличии
      server-owned permission.
- [x] Missing permission удаляет section, labels/counts и cached data из DOM.
- [x] Legacy `/cases/settings` удалён как самостоятельная поверхность и ведёт
      на canonical Case Intelligence settings без второго JSON editor.
- [x] Ни route, ни navigation, ни data source не используют frontend feature
      flag, `VITE_*`/env toggle или staged rollout state.
- [x] Contract, controller, router и permission-revoke tests проходят.
