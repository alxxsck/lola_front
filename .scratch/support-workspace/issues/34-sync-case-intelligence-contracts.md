# 34 — Синхронизировать Case Intelligence contracts и settings foundation

**What to build:** После backend handoff закрепить в pinned OpenAPI доступные
closed DTO для Case Detection, Human Escalation, Safety, budget и immutable
Decision; создать frontend repository/controller seams и постоянный
route-level settings shell без legacy JSON как второго source of truth.

**Backend basis:** локальные завершённые backend commits `13c67cf2` (Ticket 34)
и `b26be183` (Ticket 35). Они добавляют название категории, точные ограничения
компилятора, каталог моделей, адресную проверку полей, безопасный прогон диалога,
калибровку и Project-readable состояние обязательной защиты.

**Status:** frontend-complete — production integration awaits backend merge

**Completed against:** составной pinned OpenAPI
`sha256:89e5ca742adb3f39649fc893fc50109b098a77cfbbc343b67ebae48403e3f90e`:
актуальная серверная база `4603a03944c6cec9751fd95eb8ce2133783fd07f` и
Case Intelligence `b26be183a6e1ab5c32c143ee6bab34c8fe16d00b`. Это честный
временный артефакт для сборки фронта: локальные SP-34/35 ещё не объединены с
актуальным backend `origin/main`, поэтому production-кандидат должен сначала
содержать обе линии изменений в одном проверенном серверном commit.

**Normative spec:**
[16-case-intelligence-detection-escalation.ru.md](../../../docs/specs/support-workspace-frontend/16-case-intelligence-detection-escalation.ru.md).

- [ ] Pinned OpenAPI содержит доступные versioned Detection/Escalation/
      Safety/budget DTO, revisions, allowedActions и exact permissions; UI не
      выдумывает model, confidence или error projections. До production backend
      должен допубликовать точные compiler bounds: OpenAPI разрешает
      `maxSignals=20`, тогда как compiler принимает не больше `8`, а верхние
      границы attach/reopen и часть stable-code/scalar правил пока описаны только
      в compiler. Фронт уже применяет более строгие фактические ограничения.
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
