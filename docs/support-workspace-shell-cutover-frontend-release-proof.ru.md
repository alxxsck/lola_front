# Support Workspace shell cutover — frontend release proof

Дата: 9 августа 2026 года  
Frontend Ticket: 28  
Backend: `4d82b6bd` + `9f36796b477d34fcac2a9a46844bbd78863df6e1`  
Pinned OpenAPI: `sha256:2f4da7559279192a20fd77bf07e72c377d9a031724a0d77a21a81aecd521ee44`

## Authority и безопасная деградация

- `/users`, `/live` и `/cases` остаются только launcher/deep-link adapters.
- Решение о canonical Support принимает `SupportWorkspace_readAdmission` для
  текущих actor и Project; arbitrary `project.settings` и deployment `VITE_*`
  не участвуют.
- `ENABLED + CANONICAL_SUPPORT + LAUNCHER_ONLY` и exact AVAILABLE capability
  открывают Support. Любая ошибка, неизвестная или неполная комбинация fail
  closed в legacy launcher.
- Admission cache scoped по actor, Project и effective permissions. Смена scope
  отменяет запрос; stale response не может открыть маршрут.
- Rollback меняет только будущую route admission. Уже принятые backend commands
  не откатываются и не повторяются.

## Route mapping

| Legacy intent | Canonical route | Rollback route |
| --- | --- | --- |
| Cases list/detail | `/support/inbox?mode=cases`, `/support/inbox/cases/:caseId` | `/cases`, `/cases/:caseId` |
| User conversation | `/support/inbox/conversations/:conversationId` | `/users?conversationId=…` |
| Users end user | `/support/inbox?entry=users&endUserId=…` | `/users/:endUserId` |
| Live end user | `/support/inbox?entry=live&endUserId=…` | `/live?endUserId=…` |

Разрешённые `projectId`, selection и inbox query сохраняются; fragment и
произвольные bearer/capability значения не переносятся.

## Исполняемый proof

- Contract mutation gate проверяет admission operation, permissions, exact
  enums/capabilities, rollout fields, `If-Match` и `Idempotency-Key`.
- Unit tests проверяют canonical predicate, mapping и fail-closed combinations.
- Router tests проверяют permission/project restore и обе стороны cutover.
- `e2e/support-workspace-cutover.spec.ts` проверяет legacy → canonical,
  anonymous login restore, Back/Forward, shell rollback и emergency hard-off в
  desktop и mobile Chromium.
- Визуальные evidence: `docs/evidence/support-workspace/ticket-28-cutover-*`,
  `ticket-28-cutover-skeleton-*` и `ticket-28-rollback-launcher-*`; проверены
  загруженный workspace, geometry-matched skeleton и read-only launcher на
  desktop/390 px.

## Rollback rehearsal

1. Release owner меняет только Project rollout root через typed backend command.
2. При `shellEnabled=false` direct Support links возвращаются в launcher.
3. При `hardOff=true` результат тот же, даже если root `enabled=true`.
4. После reload navigation не показывает canonical Support до нового exact
   authoritative admission.
5. Принятые reply/note/assignment commands не компенсируются и не переигрываются.
