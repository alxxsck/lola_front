# W0: capability matrix inbox, Case и workforce

Статус: normative baseline для frontend Task 02
Версия: 1
Дата: 7 августа 2026 года
Backend source: `2113c9950367caa02db6826c7c489a8b9c278319`
Pinned contract: `sha256:4372b9e8b3bd8acce78d3a3b1a6df99f0c9c5246640a290b55647719a948aa0e`

Документ отделяет опубликованный transport contract от возможности построить
безопасный UI. `READY` означает полный typed contract. `RELEASE_GATED` требует
backend rollout gate. `REQUEST_ONLY` означает, что endpoint и request описаны,
но response остаётся `void`. `NOT_PUBLISHED` нельзя компенсировать локальным
DTO, N+1-запросами или вычислением в браузере.

## 1. Inbox, поиск и Saved Views

| Capability                             | Operation / bounds                                                                             | Permission                                            | Authority / revision                                                | Status                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Cases inbox                            | `SupportWorkspace_read`, `mode=CASES`, cursor ≤ 2048, limit ≤ 100                              | `project.cases.read` или `project.conversations.read` | только bounded Case row: state, priority, group, attention, version | `READY`; row не содержит assignment, unread, waiting или SLA                    |
| Conversations inbox                    | `SupportWorkspace_read`, `mode=ALL_CONVERSATIONS`, cursor ≤ 2048, limit ≤ 100                  | как у workspace                                       | bounded Conversation metadata                                       | `READY`                                                                         |
| Расширенный Case list                  | `EndUserCases_list`, cursor ≤ 2048, limit ≤ 100                                                | `project.cases.read`                                  | server filters и sort                                               | `READY`, legacy read projection                                                 |
| Conversation list                      | `AdminProjectConversations_list`, cursor ≤ 1024, limit ≤ 100                                   | `project.conversations.read`                          | status и exact End User filters                                     | `READY`, без Case/SLA semantics                                                 |
| Case/Conversation search               | `SupportSearch_cases`, `SupportSearch_conversations`; phrase 2–256, cursor ≤ 2048, limit ≤ 100 | `project.support.search.read`                         | request grammar опубликована                                        | `REQUEST_ONLY`: response schema отсутствует, generated client возвращает `void` |
| Saved Views catalog/query              | `SavedSupportView_catalog/query`, `SupportViewPreset_query`                                    | saved-view read + `project.support.search.read`       | typed result, count/freshness и query result отсутствуют            | `REQUEST_ONLY`                                                                  |
| Saved View create/edit/publish/archive | `SavedSupportView_create/replace/publish/archive`                                              | `self_manage` или `manage`                            | `Idempotency-Key`; versioned actions используют `If-Match`          | `REQUEST_ONLY`; response schema и закрытая draft grammar не опубликованы        |

Опубликованный Case sort: `ATTENTION_FIRST`, `LAST_ACTIVITY`, `OLDEST_OPEN`,
`PRIORITY`, `RECENTLY_RESOLVED`. Фильтры включают state, priority,
classification, assignee, language/channel, attention, stale/degraded и time
range. Это не делает Saved Views готовыми: клиент не имеет typed server result.
Отдельный typed flag `support_project_inbox` также не опубликован.

## 2. Case workflow и классификация

| Capability                   | Operation / contract                       | Permission                      | OCC / audit                                                     | Status                                                    |
| ---------------------------- | ------------------------------------------ | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Case detail                  | `EndUserCases_detail`                      | `project.cases.read`            | Case `version`; server `availableStatuses`                      | `READY`                                                   |
| Workflow correction          | `EndUserCases_workflow`                    | `project.cases.manage`          | `expectedVersion`, UUID `idempotencyKey`, обязательный `reason` | `READY`; typed `400/403/404/409`                           |
| Classification correction    | `EndUserCases_classification`              | `project.cases.manage`          | те же preconditions; type/group/impact/urgency/priority         | `READY`; server проверяет floor/override                   |
| Workflow allowed transitions | `EndUserCaseResponseDto.availableStatuses` | read authority Case             | server-owned список переходов                                   | `READY` только для workflow                               |
| Case action authority        | `EndUserCaseResponseDto.allowedActions`    | effective project permission    | server-owned workflow/classification/priority actions            | `READY`                                                   |
| Priority floor               | Case detail classification policy          | read authority Case             | effective floor, bounded reasons, immutable policy pin           | `READY`                                                   |

Frontend не вычисляет priority floor и разрешения локально: использует effective floor,
`allowedActions` и policy pin из Case projection. Backend gate Task 16 закрыт в `2113c99`.

## 3. Assignment и routing offers

| Capability           | Operation                            | Permission / allowed action                                             | OCC / idempotency                                          | Status                                                    |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Claim                | `SupportCaseAssignment_claim`        | `project.support.assignments.self_manage` + selection `claimAssignment` | Case version + обязательный `Idempotency-Key`              | `RELEASE_GATED`                                           |
| Lead assign          | `SupportCaseAssignment_assign`       | `project.support.assignments.override` + selection `assignCase`         | Case version, reason code, idempotency                     | command `RELEASE_GATED`; picker targets `NOT_PUBLISHED`   |
| Release              | `SupportCaseAssignment_release`      | self-manage/override + selection `releaseAssignment`                    | assignment version, `sa1` ETag, reason, idempotency        | `RELEASE_GATED`                                           |
| Transfer             | `SupportCaseAssignment_transfer`     | override + selection `transferAssignment`                               | assignment version, `sa1` ETag, reason, idempotency        | command `RELEASE_GATED`; eligible targets `NOT_PUBLISHED` |
| Own offers           | `SupportRoutingOffer_list`           | `project.support.assignments.self_manage`                               | offer expiry, fencing/version, opaque token, `so1` ETag    | `RELEASE_GATED`                                           |
| Accept/decline offer | `SupportRoutingOffer_accept/decline` | self-manage                                                             | `If-Match`, `Idempotency-Key`, expected assignment version | success typed; expiry/conflict errors `NOT_PUBLISHED`     |
| Bulk assignment      | операции нет                         | не опубликовано                                                         | нет per-item receipt                                       | `NOT_PUBLISHED`                                           |

Assignment mutations публикуют typed `400/403/404/409` с current version/ETag,
capacity и drift evidence. Reason enums закреплены contract gate. Общего
Case-specific каталога eligible Team/operator нет: Workforce config и legacy
assignee list не являются target authority.

Backend gates: `SUPPORT_PLATFORM_WORKFORCE_API_ENABLED` и
`SUPPORT_PLATFORM_ASSIGNMENT_API_ENABLED`, плюс project cutover predicate.

## 4. Availability, teams, skills и capacity

| Capability             | Operation                                              | Permission        | Provenance                                               | Status                                                       |
| ---------------------- | ------------------------------------------------------ | ----------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Own/read availability  | `SupportOperatorAvailability_read/setOwn/heartbeatOwn` | read/self-manage  | declared/effective state, lease, source, numeric version | `RELEASE_GATED`; typed errors отсутствуют                    |
| Lead override          | `SupportOperatorAvailability_overrideOperator`         | override          | `If-Match`, idempotency, audited reason                  | command published; eligible operator catalog `NOT_PUBLISHED` |
| Teams/skills/workforce | `SupportWorkforce_getWorkforce/listTeams/listSkills`   | teams read/manage | root version, `sw1` ETag, immutable published revision   | `RELEASE_GATED`                                              |
| Capacity configuration | Workforce operator `maxCapacityUnits`                  | teams manage      | versioned configuration                                  | `READY` как config, не live utilization                      |
| Case-desk workload     | операции нет                                           | не опубликовано   | live load/capacity evidence отсутствует                  | `NOT_PUBLISHED`                                              |

Availability никогда не выводится из socket online или browser presence.

## 5. Queues, routing и SLA

| Capability                              | Operation                                         | Permission                    | Provenance                                                       | Status                                                        |
| --------------------------------------- | ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Queue catalog/cases                     | `SupportQueue_list/cases`                         | queues read/manage            | queue revision/generation, freshness, high-water, bounded cursor | `RELEASE_GATED`                                               |
| Queue SLA signal                        | `SupportQueueEntryResponseDto.slaDueAt`           | queue authority               | nullable deadline без clock explanation                          | `READY` только как sparse queue signal                        |
| Routing investigation                   | `SupportRoutingRuntime_decisionDetail/activation` | routing read/manage           | queue/policy/workforce revisions, hashes, algorithm revision     | `RELEASE_GATED`; candidate details частично arbitrary objects |
| Current-Case routing reason/reservation | projection отсутствует                            | не опубликовано               | Case не связан с typed decision/reservation                      | `NOT_PUBLISHED`                                               |
| SLA settings                            | `SupportSlaConfiguration_read`                    | SLA read/manage               | root version, `ssla1` ETag, rollout, checkpoint                  | `READY` для settings                                          |
| SLA correction                          | `SupportSlaHumanCommand_correctClock`             | `project.support.sla.correct` | `sslah1` ETag, idempotency, typed conflicts                      | command published                                             |
| Selected-Case SLA clocks                | workspace DTO / read operation отсутствуют        | не опубликовано               | clock/action ETag не доступен generated client                   | `NOT_PUBLISHED`                                               |

Queue freshness values: `READY`, `BUILDING`, `DEGRADED`. Routing `outcome`
пока просто string; неизвестное значение нельзя превращать в success.
SLA rollout публикует только `DISABLED` и `SHADOW`, поэтому shadow/degraded
данные не подписываются в UI как contractual SLA.

## 6. Fixtures, errors и ownership

Исполняемый corpus:
`src/shared/api/repository/fixtures/support-inbox-case-workforce-contract-fixtures.ts`.
Published fixtures валидируются напрямую schemas pinned OpenAPI через Ajv.
Unpublished forbidden/stale/expired-offer/bulk/unknown-outcome сценарии имеют
явный marker `NOT_PUBLISHED`. Additive unknown enum хранится отдельно и в
будущем обязан обрабатываться adapter-ом fail-closed.

| Gap                                                         | Следующий owner                     |
| ----------------------------------------------------------- | ----------------------------------- |
| typed search/Saved View responses и закрытая filter grammar | backend search + Task 11            |
| eligible assignment targets и offer errors                  | backend assignment + Tasks 17–18    |
| live capacity, current routing reason/reservation           | backend workforce/routing + Task 19 |
| selected-Case SLA clock projection/action ETag              | backend SLA/workspace + Task 19     |
| bulk partial receipt и unknown-outcome lookup               | backend assignment + Task 18        |

Task 02 не реализует inbox UI, Case actions или settings. Он фиксирует границу,
после которой Tasks 09–11 и 16–19 могут работать без client-derived truth.
