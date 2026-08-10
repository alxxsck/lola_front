# W0: capability matrix inbox, Case и workforce

Статус: normative baseline для frontend Task 02
Версия: 1
Дата: 7 августа 2026 года
Backend source: `442d185dfb6cd6c9ac9902b7cfbb167291d249b6`
Assignment contract update: `bdf8116`
SLA/routing context update: `442d185`
Pinned contract: `sha256:947ab0cb385be59df088076579d339d236cdc4c8bf4888fcebf7677915921d01`

Документ отделяет опубликованный transport contract от возможности построить
безопасный UI. `READY` означает полный typed contract, доступный по IAM и
доменной конфигурации. `REQUEST_ONLY` означает, что endpoint и request описаны,
но response остаётся `void`. `NOT_PUBLISHED` нельзя компенсировать локальным
DTO, N+1-запросами или вычислением в браузере.

## 1. Inbox, поиск и Saved Views

| Capability                             | Operation / bounds                                                                             | Permission                                            | Authority / revision                                                | Status                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Cases inbox                            | `SupportWorkspace_read`, `mode=CASES`, cursor ≤ 2048, limit ≤ 100                              | `project.cases.read` или `project.conversations.read` | bounded Case row + typed most-important `slaSignal` одним batch-read | `READY`; SLA freshness и semantic state server-owned                            |
| Conversations inbox                    | `SupportWorkspace_read`, `mode=ALL_CONVERSATIONS`, cursor ≤ 2048, limit ≤ 100                  | как у workspace                                       | bounded Conversation metadata                                       | `READY`                                                                         |
| Расширенный Case list                  | `EndUserCases_list`, cursor ≤ 2048, limit ≤ 100                                                | `project.cases.read`                                  | server filters и sort                                               | `READY`, независимая Case projection                                            |
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

| Capability                   | Operation / contract                       | Permission                   | OCC / audit                                                     | Status                                   |
| ---------------------------- | ------------------------------------------ | ---------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Case detail                  | `EndUserCases_detail`                      | `project.cases.read`         | Case `version`; server `availableStatuses`                      | `READY`                                  |
| Workflow correction          | `EndUserCases_workflow`                    | `project.cases.manage`       | `expectedVersion`, UUID `idempotencyKey`, обязательный `reason` | `READY`; typed `400/403/404/409`         |
| Classification correction    | `EndUserCases_classification`              | `project.cases.manage`       | те же preconditions; type/group/impact/urgency/priority         | `READY`; server проверяет floor/override |
| Workflow allowed transitions | `EndUserCaseResponseDto.availableStatuses` | read authority Case          | server-owned список переходов                                   | `READY` только для workflow              |
| Case action authority        | `EndUserCaseResponseDto.allowedActions`    | effective project permission | server-owned workflow/classification/priority actions           | `READY`                                  |
| Priority floor               | Case detail classification policy          | read authority Case          | effective floor, bounded reasons, immutable policy pin          | `READY`                                  |

Frontend не вычисляет priority floor и разрешения локально: использует effective floor,
`allowedActions` и policy pin из Case projection. Backend gate Task 16 закрыт в `2113c99`.

## 3. Assignment и routing offers

| Capability           | Operation                                    | Permission / allowed action                                         | OCC / idempotency                                               | Status                                                 |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Claim                | `SupportCaseAssignment_claim`                | `project.support.assignments.self_manage` + server candidate action | Case version/read token + обязательный `Idempotency-Key`        | `READY`; Case target authority server-owned            |
| Lead assign          | `SupportCaseAssignment_assign`               | `project.support.assignments.override` + server candidate action    | Case version/read token, reason code, idempotency               | `READY`; picker targets server-owned                   |
| Release              | `SupportCaseAssignment_release`              | self-manage/override + selection `releaseAssignment`                | assignment version, `sa1` ETag, reason, idempotency             | `READY`                                                |
| Transfer             | `SupportCaseAssignment_transfer`             | override + server candidate action                                  | assignment version, `sa1` ETag, reason, idempotency             | `READY`; eligible targets server-owned                 |
| Lead force assign    | `SupportCaseAssignment_assignWithOverride`   | override + force-assign + server force action                       | Case version/read token, explicit bypasses, reason, idempotency | `READY` (`9a93282`)                                    |
| Lead force transfer  | `SupportCaseAssignment_transferWithOverride` | override + force-assign + server force action                       | assignment version, `sa1` ETag, explicit bypasses, reason       | `READY` (`9a93282`)                                    |
| Own offers           | `SupportRoutingOffer_list`                   | `project.support.assignments.self_manage`                           | offer expiry, fencing/version, opaque token, `so1` ETag         | `READY`                                                |
| Accept/decline offer | `SupportRoutingOffer_accept/decline`         | self-manage                                                         | `If-Match`, `Idempotency-Key`, expected assignment version      | canonical typed success/expiry/conflict errors `READY` |
| Bulk assignment      | `SupportCaseAssignmentBatch_execute/outcome` | override; CMS actor only                                            | 1..50, durable per-item receipt, actor-scoped recovery          | `READY` (`9a93282`)                                    |
| Single outcome       | `SupportCaseAssignment_commandOutcome`       | self-manage/override                                                | исходный `Idempotency-Key`, Project+actor+Case scope            | `READY` (`9a93282`)                                    |
| Lead target catalog  | `SupportLeadTarget_list`                     | assignment override                                                 | purpose, bounded 500, opaque IDs/actions                        | `READY` (`9a93282`)                                    |

Assignment mutations публикуют typed `400/403/404/409` с current version/ETag,
capacity и drift evidence. Reason enums закреплены contract gate. Case-specific
`SupportCaseAssignment_candidatesForCase` — единственный target authority; Workforce config,
role-shaped assignee list, inbox и presence не используются как кандидаты.

## 4. Availability, teams, skills и capacity

| Capability             | Operation                                              | Permission        | Provenance                                               | Status                                                       |
| ---------------------- | ------------------------------------------------------ | ----------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Own/read availability  | `SupportOperatorAvailability_read/setOwn/heartbeatOwn` | read/self-manage  | declared/effective state, lease, source, numeric version | `READY`; typed errors остаются contract gap                  |
| Lead override          | `SupportOperatorAvailability_overrideOperator`         | override          | `If-Match`, idempotency, audited reason                  | command published; eligible operator catalog `NOT_PUBLISHED` |
| Teams/skills/workforce | `SupportWorkforce_getWorkforce/listTeams/listSkills`   | teams read/manage | root version, `sw1` ETag, immutable published revision   | `READY`                                                      |
| Capacity configuration | Workforce operator `maxCapacityUnits`                  | teams manage      | versioned configuration                                  | `READY` как config, не live utilization                      |
| Case-desk workload     | `SupportLead_read`, `view=CAPACITY_RISKS`              | Lead Control read | current causal gap, immutable snapshot, signed cursor    | `READY` для Team/Queue gap; skill/language честно unavailable |

Availability никогда не выводится из socket online или browser presence.
Ручной declared state не сбрасывается при скрытии, навигации или закрытии вкладки;
heartbeat остаётся только совместимым transport-механизмом и не владеет готовностью оператора.

## 5. Queues, routing и SLA

| Capability                              | Operation                                         | Permission                    | Provenance                                                       | Status                                                        |
| --------------------------------------- | ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Queue catalog/cases                     | `SupportQueue_list/cases`                         | queues read/manage            | queue revision/generation, freshness, high-water, bounded cursor | `READY`                                                       |
| Queue SLA signal                        | `SupportQueueEntryResponseDto.slaDueAt`           | queue authority               | nullable deadline без clock explanation                          | `READY` только как sparse queue signal                        |
| Routing investigation                   | `SupportLead_read(INVESTIGATION)`                  | Lead Control read             | current typed routing facts + bounded evidence                    | `READY`; FULL Lead visibility                                  |
| Current-Case routing reason/reservation | `SupportWorkspace_read`, `mode=SELECTION`          | routing read/manage или own receive | causal Decision, Queue, eligibility, offer/reservation/fallback | `READY`; privacy scopes `FULL \| OWN \| NONE`                 |
| SLA settings                            | `SupportSlaConfiguration_read`                    | SLA read/manage               | root version, `ssla1` ETag, published SLA Configuration, checkpoint | `READY`; опубликованная SLA Configuration действует сразу     |
| SLA correction                          | `SupportSlaHumanCommand_correctClock`             | `project.support.sla.correct` | `sslah1` ETag, idempotency, typed conflicts                      | command published                                             |
| Selected-Case SLA clocks                | `SupportWorkspace_read`, `mode=SELECTION`          | SLA read + Case authority     | response/resolution clocks, waiting/pause/breach, action ETag    | `READY`; unconfigured/degraded состояние server-owned          |

Queue freshness values: `READY`, `BUILDING`, `DEGRADED`. Routing `outcome`
пока просто string; неизвестное значение нельзя превращать в success.
Если SLA Configuration не опубликована, UI показывает `UNCONFIGURED`; при проблеме
проекции — `REBUILDING` или `DEGRADED`. Эти состояния не скрывают сам модуль.

## 6. Fixtures, errors и ownership

Исполняемый corpus:
`src/shared/api/repository/fixtures/support-inbox-case-workforce-contract-fixtures.ts`.
Published fixtures валидируются напрямую schemas pinned OpenAPI через Ajv.
Unpublished forbidden/stale/expired-offer сценарии имеют явный marker `NOT_PUBLISHED`. Bulk,
force и unknown-outcome fixtures могут переходить на published contracts `9a93282`. Additive unknown enum хранится отдельно и в
будущем обязан обрабатываться adapter-ом fail-closed.

| Gap                                                         | Следующий owner                     |
| ----------------------------------------------------------- | ----------------------------------- |
| typed search/Saved View responses и закрытая filter grammar | backend search + Task 11            |

Task 02 не реализует inbox UI, Case actions или settings. Он фиксирует границу,
после которой Tasks 09–11 и 16–19 могут работать без client-derived truth.
