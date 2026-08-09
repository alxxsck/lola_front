# W0: capability matrix content, Lead Control и browser notifications

Статус: normative baseline для frontend Task 03

Версия: 1

Дата: 7 августа 2026 года

Pinned contract: `sha256:0dd3e0813d772df946354c2a64ecbffbb07e6ef2eff8b9a0b977ca4696718c8c`

Backend docs/source review: `8758358e`

Frontend реализует только то, что опубликовано в pinned OpenAPI. Personal browser
notification controllers и admission опубликованы backend `8758358e`.
`READY` означает typed transport и достаточную authority. `RELEASE_GATED`
требует server rollout/admission. `PARTIAL` означает, что часть projection или
ошибок не типизирована. Нельзя подменять пробел локальным DTO или legacy
notification API.

## 1. Internal Notes и content governance

| Capability            | Published operation / schema                           | Authority / revision                                                        | Status                                                                     |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Note list             | `SupportInternalNote_list`, limit ≤ 100, cursor ≤ 1024 | `project.support.internal_notes.read`; повторная Case authority             | `READY` для выбранного Case                                                |
| Note revision history | `SupportInternalNote_revisions`                        | одновременно `internal_notes.read` + `history_read`; revision number/author | `READY` read contract                                                      |
| Create                | `SupportInternalNote_create`                           | `internal_notes.write`, `Idempotency-Key`                                   | `PARTIAL`: нет Case-scoped create allowed action и typed 4xx               |
| Correct               | `SupportInternalNote_correction`                       | write, `sin1` If-Match, idempotency, append-only revision                   | `PARTIAL`: `reasonCode` — свободная строка, 409/410 без schema             |
| Tombstone             | `SupportInternalNote_tombstone`                        | `internal_notes.redact`, `sin1` If-Match, idempotency                       | `PARTIAL`: server lifecycle есть, action capability/error body нет         |
| Redacted/purged read  | `SupportInternalNoteResponseDto.lifecycle`             | `ACTIVE / TOMBSTONED / PURGED`, nullable body, unavailable references       | `READY`; UI не восстанавливает body из cache                               |
| Content panel         | `SupportContentPanel_read`                             | macro read; независимые macro/knowledge states                              | `PARTIAL`: `items` обеих секций остаются arbitrary object                  |
| Content rollout       | `SupportContentGovernance_rollout/updateRollout`       | version, `scr1` ETag, idempotency, hardOff                                  | `READY` как content rollout root, не project shell flag                    |
| Retention             | read/replace/publish/preview operations                | exact `content_retention.manage`, `scp1` ETag                               | `PARTIAL`: draft/revision — arbitrary object; только bounded purge preview |
| Legal hold            | list/create/release                                    | exact `content_legal_hold.manage`, version/action ETag                      | `READY` для hold lifecycle; purge apply остаётся maintenance-only          |

Published content rollout capabilities: `MACRO_AUTHORING`, `MACRO_DRAFT`,
`MACRO_SEND`, `INTERNAL_NOTES`, `CONTENT_PANEL`. Note body, creator details,
references и signed URLs не попадают в inbox/realtime/telemetry fixtures.
Physical purge не является пользовательской delete-командой.

## 2. Support Macros

| Capability     | Operation                                 | Permission / OCC                                                                                     | Status                                                                               |
| -------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Catalog/detail | catalog/read + authoring catalog/read     | `project.support.macros.read/manage`; opaque cursor, freshness generation                            | `READY`; stale catalog has closed 409                                                |
| Authoring      | create/replaceDraft/preview/publish/archive/revisions/rollback | manage; idempotency; existing root uses `sm1` If-Match                         | `READY`; local edits survive OCC reconcile                                           |
| Reply/note draft | reply/note draft create/read/edit       | target reply/note authority + macro read/use; `smd1` If-Match                                        | `READY`; editable server-owned draft, never auto-sends                               |
| Provenance     | Message `macroProvenance`                 | CMS projections only; immutable macro revision identity                                               | `READY`; End User projection remains clean                                           |

Macro `read`, `use` и `manage` зарегистрированы как независимые frontend
permissions. Published revision не меняет immutable Message author. Unknown
send outcome должен проходить messaging reconciliation из Task 13, а не
повторное применение Macro.

## 3. Support Internal Knowledge

Это отдельный `/support/knowledge/*` corpus и permissions
`project.support.knowledge.read/manage`. Он не переиспользует существующий AI
`/knowledge`.

| Capability           | Operation / provenance                                                                | Status                                                                    |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Search               | `SupportInternalKnowledge_search`; required Case, q 1–240, cursor ≤ 2000, limit ≤ 100 | `READY`; item содержит document/revision/title/safe snippet               |
| Open/download        | exact `open`; create/exchange one-shot grant; required Case/revision                   | `READY`; concealed revoke and source change typed                         |
| Manage               | page/detail, text drafts/revisions, file upload/complete/scan, publish/archive        | `RELEASE_GATED`; exact document/revision state и idempotency опубликованы |
| Scan/revision        | `SupportKnowledgeManagedRevisionResponseDto`                                          | `EDITING / QUARANTINED / SCANNING / PUBLISHABLE / PUBLISHED / REJECTED`   |
| Citation/provenance  | create/read/update Citation Draft; Message `knowledgeProvenance`                      | `READY`; durable send, CMS-only body-free provenance                      |
| Emergency revoke     | governance + `rollbackAdmission` → `REVOKED` receipt                                  | `READY`; terminal hard-off                                                |
| Retention            | append-only policy + governance                                                       | `READY`; legal hold/purge остаются maintenance-only                       |

Operator surface готов. Admin `setCapabilities`, `setRetentionPolicy` и
`resolveProblemReport` остаются release-gated до actor-bound unknown-outcome recovery.

## 4. Lead Control и operational alerts

| Capability                | Operation                                    | Provenance / status                                                                     |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Summary                   | `SupportLead_summary`                        | generation, checkpoint, sourceHighWater, computedAt, freshness; `READY`                 |
| Case risks                | `SupportLead_caseRisks`                      | required risk type, Case/assignment/SLA/delivery versions; `READY`                      |
| Capacity risks            | `SupportLead_capacityRisks`                  | data state только `UNAVAILABLE`; UI обязан показывать недоступность                     |
| Investigation             | `SupportLead_investigation`                  | pinned policy revisions, action tokens, causal facts; routing facts пока `UNAVAILABLE`  |
| Support Activity          | `SupportLead_activity`                       | отдельный `project.support.activity.read`; bounded safe facts                           |
| Alert list/detail         | `SupportOperationalAlert_list/detail`        | `alerts.read`, owner/count/version, materialization checkpoint/freshness                |
| Alert acknowledge/resolve | versioned commands                           | `alerts.manage`, numeric If-Match, idempotency, closed reasons, authoritative receipt   |
| Alert change owner        | `SupportOperationalAlertCommand_changeOwner` | command опубликована и audited; eligible owner catalog/target authority `NOT_PUBLISHED` |

Lead freshness: `BUILDING / READY / STALE / DEGRADED`. Alert lifecycle в
contract: `NEW / ACKNOWLEDGED / RESOLVED`; тексты старых документов
`OPEN/CLOSED` не являются API enum. Assignment, priority и availability
override используют отдельные команды из Task 02; Lead frontend не создаёт
свои mutation endpoints. Bulk/partial receipts отсутствуют.

## 5. Browser notifications — published personal vertical

| Capability | Published contract / frontend rule | Status |
| --- | --- | --- |
| Admission | Project rollout, per-topic capability, VAPID key revision, active device count | `READY`; читается до effective delivery state |
| Preferences | Project-scoped GET/PATCH, version, Idempotency-Key | `READY`; только Attention и Assigned-to-me |
| Devices | self-scoped list/register/revoke, write-only secrets, version/OCC | `READY`; local subscription не считается server registration |
| Rotation/logout | endpoint + VAPID revision reconciliation, old-device revoke, logout cleanup | `READY`; local authority purged immediately |
| Deep link | opaque 43-char single-use capability, backend re-authorization | `READY`; fragment-only handoff, scrub до login redirect |
| Push copy | closed payload version/topics, generic title/body | `READY`; Case/Message/Note content не принимается |

### Planned New Case policy

Уведомление о каждом новом обычном Case — отдельный backend/frontend contract,
а не переименование `SUPPORT_CASE_ATTENTION`. Backend Ticket 35 должен
опубликовать Project policy и topic `SUPPORT_CASE_CREATED`; frontend Task 38
добавляет Lead-managed scope/effective window и personal preference. До этого
UI не показывает toggle «Все новые обращения».

## 6. Flags, owners и blockers

| Slice                      | Published rollout / deployment control                                                | Owner / next task                              |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Macros/Notes/content panel | typed Content Rollout root; backend global hard-off                                   | Support Operations Content → Tasks 22/24       |
| Internal Knowledge         | Project admission; docs flags `SUPPORT_INTERNAL_KNOWLEDGE_*`                          | Knowledge/Content → Task 25                    |
| Lead Control               | typed disabled/not-ready errors; отдельный project rollout contract отсутствует       | Lead projection/rollout → Task 26              |
| Operational Alerts         | command/read errors + worker hard-off; eligible owner target отсутствует              | Alerts/IAM → Task 26                           |
| Browser notifications      | typed personal admission/preferences/devices/deep-link; server rollout              | `READY` → Task 27 complete                    |
| New Case notification      | нет Project policy/topic `SUPPORT_CASE_CREATED`                                       | Backend 35 → Frontend 38                       |
| Whole Support shell        | временный `VITE_SUPPORT_WORKSPACE_ENABLED`                                            | backend rollout → cutover tasks                |

Backend environment flag не равен frontend feature flag. UI читает только
typed server rollout/admission либо остаётся выключенным.

## 7. Executable fixtures и recovery boundary

Corpus:
`src/shared/api/repository/fixtures/support-content-lead-notification-contract-fixtures.ts`.
Published fixtures валидируются Ajv напрямую по pinned schemas: tombstoned и
purged Note, Macro Reply Draft revision, Knowledge search, partial content
panel, stale Lead summary, degraded alerts, alert receipt, typed Lead 403 и
alert timeout 503.

Content 403 и revoked/rotated browser subscription проверяются fail-closed.
Bulk/partial Lead result и общий command outcome lookup не выдумываются frontend.

Task 03 не реализует UI. Визуальные и screenshot acceptance начинаются в
Tasks 22, 24–27.
