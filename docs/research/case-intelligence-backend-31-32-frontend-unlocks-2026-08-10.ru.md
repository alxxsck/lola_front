# Case Intelligence backend 31–32: что реально разблокировано для frontend

Дата аудита: 10 августа 2026 года
Frontend: `/Users/alxxsck/Documents/Lola_front`
Backend: `/Users/alxxsck/Documents/Lola_backend`

## Короткий вывод

**Да, классификации в backend 31 есть**, но в точном смысле `Detection Policy topics`, а не как готовый frontend-редактор и не как законченная административная модель категорий. Backend публикует stable `code`, `description`, positive/negative examples, правила определения Case, draft/publish lifecycle и deterministic dry-run. Runtime использует эти topics как допустимые Case `groupCode`: неизвестный код нормализуется в `UNMAPPED` ([router validation](../../../Lola_backend/src/modules/end-user-cases/router/end-user-case-router-validation.ts#L163-L221)).

После backend Tickets 31–32 frontend получил достаточно контрактов, чтобы:

1. начать Ticket 34 — синхронизацию OpenAPI, repository/controller seams и settings shell;
2. частично начать Ticket 35 — основной Detection form, rules, draft/compile/discard и простой deterministic test;
3. частично начать Ticket 36 — только Escalation Policy form, без настоящего multi-turn simulator и Project Safety overlay;
4. частично начать Ticket 37 — current overview, decision log, Case explain, corrections и cost/backlog slice, но не evaluation/publishing целиком;
5. не начинать функциональную реализацию Ticket 38: New Case Notification Policy backend 35 отсутствует.

Главная оговорка: это **контрактный и authoring unblock, не production-LIVE unblock**. Ticket 32 прямо фиксирует, что `LIVE` остаётся закрыт до независимой exact-signal Safety lane Ticket 33 ([Ticket 32, строки 8–10](../../../Lola_backend/.scratch/support-platform/issues/32-cheap-case-intelligence-router-budget.md#L8-L10)); backend дополнительно возвращает `CASE_INTELLIGENCE_SAFETY_LANE_NOT_READY` при `LIVE` ([service fence](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L2508-L2513), [test](../../../Lola_backend/test/case-intelligence-policy-contract.test.ts#L531-L579)).

Frontend delivery decision после аудита: Case Intelligence поставляется как
постоянная permission-gated capability без frontend flags, env toggles,
shadow/canary UI и legacy JSON fallback. Backend staged-operation enums ниже
зафиксированы как факт доступного контракта, но не становятся режимами
frontend-продукта.

## 1. На какой исходной базе сделан вывод

### 1.1. Это Support Platform tickets, а не GitHub Issues `#31/#32`

Проверяемые задания находятся в backend repo:

- [`.scratch/support-platform/issues/31-case-intelligence-policy-runtime-contract.md`](../../../Lola_backend/.scratch/support-platform/issues/31-case-intelligence-policy-runtime-contract.md#L1-L53);
- [`.scratch/support-platform/issues/32-cheap-case-intelligence-router-budget.md`](../../../Lola_backend/.scratch/support-platform/issues/32-cheap-case-intelligence-router-budget.md#L1-L29).

Их нельзя отождествлять с одноимёнными номерами GitHub Issues: канонический первичный источник именно эти Support Platform delivery tickets и указанные в них commits.

### 1.2. Фактический статус commits и remote

| Scope | Commit | Факт |
| --- | --- | --- |
| Ticket 31 | `d881b4de7cb6f24435da96caeaaeb4903cae0c80` — `SP-31 Complete Case Intelligence policy and runtime foundation` | Полный foundation commit существует и входит в `origin/main`. Delivery ticket отмечает completed и приводит release gates ([строки 8–9, 38–53](../../../Lola_backend/.scratch/support-platform/issues/31-case-intelligence-policy-runtime-contract.md#L8-L53)). |
| Ticket 32 frontend HTTP controls | `0263dda5f9ce8c7b2ce0a671de0e502d74624c0b` — `Improve case intelligence controls and SLA reliability` | Budget draft/publish, platform circuit и cost summary уже входят в `origin/main`. |
| Ticket 32 closure/hardening | `e9650e8e8d2831232eeabf09f88960fac1f52f6d` — `SP-32 Complete Case Intelligence router hardening` | Есть только в локальной истории backend; ни один remote ref его сейчас не содержит. Поэтому полный Ticket 32 нельзя считать опубликованным handoff, хотя нужные frontend HTTP controls уже находятся в remote. |

На момент аудита backend checkout не является чистым release source: локальный `main` разошёлся с `origin/main`, поверх Ticket 32 есть SP-33 WIP и незакоммиченные изменения. Поэтому frontend нельзя pin-ить на «текущий dirty HEAD». Для contract sync нужен чистый backend worktree и явный commit SHA.

### 1.3. Frontend ещё не потребил новые контракты

Pinned frontend contract всё ещё ссылается на backend revision `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`, то есть на commit до Ticket 31 ([contract metadata](../../openapi/retenive-backend.contract.json#L1-L10)). В `openapi/retenive-backend.json` нет `/case-intelligence` paths и соответствующих generated models.

Единственный похожий generated вызов — старый `GET .../end-user-cases/summary/cost` ([generated client](../../src/shared/api/generated/retenive-backend.ts#L3009-L3020)); pinned OpenAPI всё ещё защищает его старым permission `project.ai_usage.read` ([snapshot](../../openapi/retenive-backend.json#L72214-L72250)). Новый backend contract использует `project.case_intelligence.cost.read` ([controller](../../../Lola_backend/src/modules/end-user-cases/api/end-user-cases.controller.ts#L114-L121)). Это contract drift, а не готовая интеграция.

Старый `/cases/settings` по-прежнему редактирует legacy `groups`/`priorityRules` как JSON и проверяет старый `project.ai_usage.read` ([page, permission и JSON shape](../../src/pages/EndUserCaseSettingsPage.vue#L25-L31), [editor](../../src/pages/EndUserCaseSettingsPage.vue#L73-L99), [save/publish](../../src/pages/EndUserCaseSettingsPage.vue#L156-L218)). Он не использует Case Intelligence Detection DTO и не считается реализацией Tickets 34–35.

## 2. Что именно реализовали backend 31 и 32

### Ticket 31: policy/runtime contract foundation

Delivery ticket заявляет и код подтверждает:

- immutable Detection, Escalation и platform Safety revisions;
- atomic release tuple с Detection/Escalation/Safety/model/calibrator/dataset/routing/compiler pins;
- runtime states и Safety floor/reconciliation;
- immutable Decision и отдельную correction;
- IAM, `allowedActions`, `ETag`, expected version, idempotency lookup, `no-store`, concealed tenant errors и typed success OpenAPI;
- compiler normalization, boundaries, quote/negation semantics и `DEFER` conflict.

Сводка scope находится в [Ticket 31, строки 14–36](../../../Lola_backend/.scratch/support-platform/issues/31-case-intelligence-policy-runtime-contract.md#L14-L36). Проверяемый OpenAPI manifest перечисляет 21 исходную операцию и ещё 5 операций Ticket 32, проверяет permission metadata, typed `200/201`, `ETag`, any-permission lookup и strong-auth mutations ([validator, строки 7–129](../../../Lola_backend/scripts/validate-case-intelligence-openapi.mjs#L7-L129)).

### Ticket 32: cheap Router, model/calibration и budgets

Ticket 32 добавил runtime cascade, но для frontend особенно важны пять HTTP additions:

- Project budget draft;
- Project budget publish;
- platform circuit read;
- platform circuit publish;
- Project Case Intelligence cost/backlog summary.

Runtime code также действительно содержит approved `MODEL_PROFILE` resolution с provider/model/reasoning/output/fallback metadata ([model resolver](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L2191-L2244)) и per-decision/locale/channel calibrated confidence с interval/coverage checks ([confidence contract](../../../Lola_backend/src/modules/end-user-cases/router/case-intelligence-confidence.ts#L6-L23), [coverage and auto-apply](../../../Lola_backend/src/modules/end-user-cases/router/case-intelligence-confidence.ts#L122-L163)). Но эти богатые runtime structures пока не опубликованы frontend в отдельном model-profile/catalog DTO или в полном Decision confidence DTO.

Ticket 32 completion criteria находятся в [строках 12–29](../../../Lola_backend/.scratch/support-platform/issues/32-cheap-case-intelligence-router-budget.md#L12-L29).

## 3. Реальные HTTP operations сейчас

Ниже — 26 strict operations, подтверждённые backend OpenAPI validator ([единый список](../../../Lola_backend/scripts/validate-case-intelligence-openapi.mjs#L7-L63)). Все Project Case Intelligence routes ставят `no-store`, проходят IAM guard и скрывают существование чужого Project ([controller metadata](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L61-L66)).

### 3.1. Project policy/runtime: Ticket 31

| Method и path | Permission | Success DTO / назначение |
| --- | --- | --- |
| `GET /api/v1/admin/projects/{projectId}/case-intelligence` | `project.case_intelligence.read` | `CaseIntelligenceCurrentResponseDto`; current published/draft projections, runtime, release, Safety floor, `allowedActions`; отдаёт `ETag` runtime version ([controller](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L73-L102)). |
| `POST .../detection/compile` | `project.case_intelligence.preview` | `CaseIntelligenceDetectionCompileResponseDto`; closed compile и bounded router input ([строки 104–113](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L104-L113)). |
| `POST .../detection/dry-run` | `project.case_intelligence.preview` | `CaseIntelligenceDryRunResponseDto`; deterministic one-string evaluation ([строки 115–124](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L115-L124)). |
| `PUT .../detection/draft` | `project.case_intelligence.detection.manage` | save/replace immutable draft revision; expected version + idempotency ([строки 126–142](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L126-L142)). |
| `DELETE .../detection/draft` | тот же | discard draft с expected version/idempotency/reason ([строки 267–283](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L267-L283)). |
| `POST .../detection/publish` | `project.case_intelligence.release.manage` + fresh strong auth | publish exact draft revision ([строки 144–162](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L144-L162)). |
| `POST .../escalation/compile` | `project.case_intelligence.preview` | `CaseIntelligenceEscalationCompileResponseDto` ([строки 164–173](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L164-L173)). |
| `PUT .../escalation/draft` | `project.case_intelligence.escalation.manage` | save Escalation draft ([строки 175–191](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L175-L191)). |
| `DELETE .../escalation/draft` | тот же | discard Escalation draft ([строки 285–301](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L285-L301)). |
| `POST .../escalation/publish` | `project.case_intelligence.release.manage` + strong auth | publish exact Escalation revision ([строки 193–211](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L193-L211)). |
| `POST .../releases/activate` | `project.case_intelligence.release.manage` + strong auth | create atomic release revision with target `SHADOW/CANARY/LIVE` ([строки 247–265](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L247-L265)); `LIVE` пока server-fenced. |
| `POST .../releases/pause` | тот же + strong auth | immutable pause transition ([строки 303–317](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L303-L317)). |
| `POST .../releases/rollback` | тот же + strong auth | new immutable release from a prior tuple, not history rewrite ([строки 319–337](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L319-L337)). |
| `GET .../commands/{idempotencyKey}` | любое из Detection manage / Escalation manage / release manage / labels review | authoritative unknown-outcome lookup; result заново permission-filtered ([строки 339–365](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L339-L365)). |
| `GET .../releases/{releaseId}` | `project.case_intelligence.read` | exact release revision ([строки 367–381](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L367-L381)). |
| `GET .../decisions` | `project.case_intelligence.decisions.read` | cursor-paged Decision log ([строки 383–403](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L383-L403)). |
| `GET .../cases/{caseId}/explain` | тот же | Case-scoped Decision page ([строки 405–427](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L405-L427)). |
| `POST .../decisions/{decisionId}/corrections` | `project.case_intelligence.labels.review` | append-only correction с reason/notes/corrected outputs ([строки 429–449](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L429-L449)). |

### 3.2. Platform Safety contract: Ticket 31

| Method и path | Permission | Назначение |
| --- | --- | --- |
| `GET /api/v1/admin/platform/case-intelligence/safety` | `platform.case_intelligence.safety.manage` | platform Safety state/minimum revision/reconciliation state. |
| `POST .../safety/revisions` | тот же + strong auth | publish mandatory platform Safety revision. |
| `GET .../safety/commands/{idempotencyKey}` | тот же | Safety command lookup. |

Все три route и guards видны в [Safety controller](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence-safety.controller.ts#L28-L71). Это **platform operator API**, а не Project Lead read projection.

### 3.3. Ticket 32 frontend additions

| Method и path | Permission | Success DTO / назначение |
| --- | --- | --- |
| `PUT .../case-intelligence/budget/draft` | `project.case_intelligence.release.manage` | `CaseIntelligenceBudgetRevisionResponseDto`; save Project budget draft ([controller](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L213-L229)). |
| `POST .../case-intelligence/budget/publish` | тот же + strong auth | publish budget revision ([строки 231–245](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence.controller.ts#L231-L245)). |
| `GET /api/v1/admin/platform/case-intelligence/circuit` | `platform.case_intelligence.safety.manage` | current platform circuit revision. |
| `POST .../circuit/revisions` | тот же + strong auth | publish circuit revision ([circuit controller](../../../Lola_backend/src/modules/end-user-cases/api/case-intelligence-circuit.controller.ts#L17-L46)). |
| `GET /api/v1/admin/projects/{projectId}/end-user-cases/summary/cost` | `project.case_intelligence.cost.read` | cost/token/cache/quality/backlog/budget summary ([controller](../../../Lola_backend/src/modules/end-user-cases/api/end-user-cases.controller.ts#L114-L121)). |

## 4. DTO, permissions и states, которые frontend может считать server-owned

### 4.1. Detection Policy — классификации действительно здесь

`CaseIntelligenceTopicDto` содержит:

- stable `code`;
- `description`;
- `positiveExamples[]`;
- `negativeExamples[]`.

Точный DTO: [строки 25–42](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L25-L42). `CaseIntelligenceDetectionPolicyDto` добавляет Project scope, locales/channels/fallback, audience include/exclude, topics, rules, attach/reopen windows, candidate limit, confidence tiers, ambiguity action, router context/runtime limits, debounce и pinned model profile ID ([строки 178–243](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L178-L243)).

Rule builder contract закрыт типами `EXACT | PHRASE | ATTRIBUTE | SEMANTIC_STATEMENT`, actions `NO_CASE | CREATE | ATTACH | REOPEN | DEFER`, priority, locale и typed attribute operators ([строки 44–91](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L44-L91)). Compiler реально делает NFKC/locale folding/punctuation normalization ([compiler](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence-policy-compiler.ts#L147-L161)); tests подтверждают boundaries, quote/negation и same-priority `DEFER` ([tests](../../../Lola_backend/test/case-intelligence-policy-contract.test.ts#L20-L109)).

Но есть важный UX gap: topic **не имеет отдельного `label/name`**. Runtime временно использует `description` и как label, и как description ([mapping](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L2522-L2553)). Поэтому Ticket 35 не должен выдумывать frontend-only название категории как второй source of truth.

### 4.2. Compile и dry-run

Compile response возвращает compiled policy/hash/compiler и bounded `routerInput {scope, topics, context}` ([response DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence-response.dto.ts#L41-L103)).

Dry-run принимает только один `input` до 4000 символов и locale ([request](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L442-L449)); response содержит только `caseDecision`, `reasonCode`, `matchedRuleCodes` ([response](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence-response.dto.ts#L154-L159)). Это не spec-level bounded dialog simulator: нет calibrated confidence, cost, candidates, Escalation/Safety results или per-stage trace.

### 4.3. Escalation Policy

DTO уже даёт отдельные explicit/ambiguous rules, ambiguous action, trusted outcomes, scenario code/action/urgency/reason/data-to-collect, clarification/failure/no-match/repeat limits, routing policy revision и do-not-escalate rules ([DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L245-L348)).

Это разблокирует form authoring. Оно **не разблокирует Ticket 36 simulator**: 31–32 не публикуют multi-turn transition/dry-run API и не создают committed Human Escalation lane. Эта часть принадлежит backend Ticket 33, что прямо указано в backend delivery plan ([backend spec](../../../Lola_backend/docs/specs/support-platform/31-case-intelligence-detection-escalation.ru.md#L334-L339)).

### 4.4. Runtime и atomic release

Current response содержит published/draft Detection, Escalation и Budget, runtime, current release, `minimumSafetyRevisionId` и `allowedActions` ([DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence-response.dto.ts#L226-L331)). Runtime states закрыты:

`SHADOW | CANARY | LIVE | PAUSED | ROLLED_BACK | DEGRADED | SAFETY_RECONCILING`.

Release revision pin-ит Detection, Escalation, Safety, model profile, calibrator, dataset, routing overlay, compiler и admission receipt ([release DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence-response.dto.ts#L197-L224)). Activation command принимает тот же tuple ([request DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L379-L408)).

Backend скрывает drafts при отсутствии соответствующего manage permission и budget без cost/release authority ([current projection](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L900-L965), [split helpers](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L1969-L2005)). `allowedActions` server-side выводится из exact permissions ([mapping](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L2125-L2135)).

### 4.5. Budget, circuit и cost

Project budget DTO содержит token/cost soft/hard caps, concurrency, max run cost, estimated token ceiling и pricing rate ([DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L461-L505)). Platform circuit добавляет emergency pause, global hard caps, concurrency и failure window/sample/rate threshold ([строки 507–553](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L507-L553)).

Cost response содержит input/output/cache read/cache write tokens, latency, billed/estimated cost completeness, accepted/reviewed/corrected counts, cost per accepted/correct decision, budget revision, circuit revision, backlog, oldest pending, degraded reasons, retries и dead count ([DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/end-user-case-activity-response.dto.ts#L122-L173)). Query действительно считает эти значения только по `CASE_INTELLIGENCE` usage и возвращает budget/backlog projection ([query](../../../Lola_backend/src/modules/end-user-cases/application/end-user-case-cost-query.service.ts#L55-L159), [presentation](../../../Lola_backend/src/modules/end-user-cases/application/end-user-case-cost-query.service.ts#L160-L233)).

### 4.6. Decision log и corrections

Decision log item публикует:

- singular `signalId`, End User/Conversation/Case refs;
- `conversationClass`, `caseDecision`, `reviewDisposition`, `handoffAction`, `safetyDecision`;
- independent `detectionState`, `escalationState`, `safetyState`;
- Assistant release gate;
- reason/rule/evidence refs;
- scalar confidence;
- all release/component pins;
- analysis/usage run IDs;
- legacy marker и append-only corrections.

Точный DTO: [строки 383–468](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence-response.dto.ts#L383-L468). Corrections хранятся отдельно от original decision ([write path](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L1343-L1384)). Cursor подписан и привязан к Project, authorization и query ([cursor](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence-cursor.ts#L13-L72)).

## 5. Что ещё не хватает относительно frontend spec

Frontend normative proposal требует более богатый Decision и полный Settings IA ([Decision contract](../specs/support-workspace-frontend/16-case-intelligence-detection-escalation.ru.md#L180-L230), [IA](../specs/support-workspace-frontend/16-case-intelligence-detection-escalation.ru.md#L232-L317)). Backend 31–32 закрывает foundation, но не весь proposal.

### P0/P1 contract gaps для frontend

1. **Frontend pinned OpenAPI не обновлён.** Пока generated client не знает ни одной Case Intelligence operation/model.
2. **Нет approved model profiles catalog/read DTO.** Есть только `modelProfileRevisionId` и внутренний resolver; UI не может показать provider-safe display name, allowed fallback и список допустимых profiles.
3. **Public Decision confidence существенно беднее spec.** Есть один nullable scalar, но нет per-dimension confidence, `coverage`, interval и явного admission reason. Runtime calibration это знает, public DTO — нет.
4. **Decision не публикует `topicCode/groupCode`, candidate Case отдельно, routing admission и consequence trace.** Поэтому spec-level explanation «какая классификация выбрана» из Decision log построить нельзя; можно лишь перейти к созданному Case и читать его group отдельно.
5. **Stage enums слишком общие.** Один и тот же набор `PENDING/READY/FAILED/DEFERRED/BUDGET_REJECTED/PAUSED` опубликован для всех трёх stages, тогда как frontend spec задаёт разные closed subsets. Названия Assistant gate также отличаются: backend `BLOCKED | SAFE_FALLBACK | ALLOWED`, spec `BLOCK | SAFE_FALLBACK | ALLOW`.
6. **Нет field-addressable validation issues.** Compile превращает policy error в `{code, message}` без path/rule/field ([error mapper](../../../Lola_backend/src/modules/end-user-cases/intelligence/case-intelligence.service.ts#L2498-L2505)). Ticket 35 требует привязать overlap/duplicate/broad-rule errors к exact control.
7. **Typed safe error responses не доказаны OpenAPI.** Controllers явно декорируют success DTO, а validator проверяет только typed `200/201` ([validator](../../../Lola_backend/scripts/validate-case-intelligence-openapi.mjs#L64-L75)). Service имеет стабильные error codes, но frontend Ticket 34 требует published 400/401/403/404/409/unknown-outcome schemas.
8. **Нет Project-readable Safety details/overlay endpoint.** Platform Safety DTO доступен только с platform manage permission. `project.case_intelligence.safety_routing.manage` существует в permission catalog ([catalog](../../../Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L1092-L1099)), но соответствующей Project operation среди 26 routes нет.
9. **Нет Escalation/Safety multi-turn simulator.** Detection dry-run — только одна строка и deterministic action.
10. **Нет evaluation APIs backend Ticket 34.** Отсутствуют dataset distribution, candidate-vs-published evaluation, confusion/precision/recall, safety gates/sentinels, error buckets, queue impact, funnel definitions и publish admission preview.
11. **Нет release/history list и diff/audit projection.** Можно прочитать current release и один release по ID, но нельзя получить history/diff/component revisions/admission receipts как Settings surface.
12. **Cost summary неполон для Ticket 37.** Нет time range/cohort, cost per 1k signals/Escalation/resolved Case, evaluation quality distribution и frontend drill-down; есть только общий Project snapshot.
13. **Decision log filters минимальны.** Только `limit/cursor/caseId` ([query DTO](../../../Lola_backend/src/modules/end-user-cases/api/dto/case-intelligence.dto.ts#L562-L581)); нет safe search по Conversation/signal/stage/error/model/policy.
14. **`LIVE` запрещён до Ticket 33.** Frontend не показывает Shadow/Canary authoring; доступная publish-команда и server-owned runtime state отображаются без обещания production activation.
15. **Нет New Case Notification Policy backend 35.** Никаких DTO/commands/read projections Ticket 38 пока не получил.

### Замечание о самой backend spec

Backend normative doc всё ещё имеет устаревший header «Tickets 31–34 не реализованы» ([строка 4](../../../Lola_backend/docs/specs/support-platform/31-case-intelligence-detection-escalation.ru.md#L1-L5)), хотя delivery tickets и commits доказывают завершение foundation 31 и локальное completion 32. Для статуса реализации нужно доверять delivery tickets + commits/tests, а spec использовать для целевой семантики.

## 6. Что делать с frontend Tickets 34–38

| Frontend ticket | Вердикт сейчас | Что можно делать немедленно | Что блокирует completion |
| --- | --- | --- | --- |
| [34 — contracts/settings foundation](../../.scratch/support-workspace/issues/34-sync-case-intelligence-contracts.md#L1-L33) | **Можно начинать сейчас на доступном contract slice.** Его прямой blocker backend 31 завершён. | На чистом pinned backend SHA экспортировать OpenAPI; сгенерировать client; создать deep repository для ETag/expectedVersion/idempotency/lookup; current overview и permission purge; canonical route shell `/support/settings/case-intelligence/*`; удалить самостоятельный legacy `/cases/settings`. | Нет model-profile catalog, typed safe error DTO, полного Decision confidence, Project Safety projection. Эти поля подключаются последующим contract sync без frontend stubs. |
| [35 — Detection editor/test console](../../.scratch/support-workspace/issues/35-build-case-detection-policy-editor.md#L1-L30) | **Частично начать после contract sync 34.** | Scope/locales/channels/audience/topics; stable codes + description/examples; typed rule builder; windows/limits/tiers/ambiguity/context/debounce/model ID; compile/save/discard; простой one-phrase dry-run. | Отдельный category label/name отсутствует; нет model picker/catalog; нет bounded-dialog/semantic test with confidence/cost/candidates; нет field-level overlap/broad-rule issues; full responsive tested ticket зависит от settled DTO. |
| [36 — Human Escalation/Safety editor](../../.scratch/support-workspace/issues/36-build-human-escalation-policy-editor.md#L1-L34) | **Частично начать только Escalation form; simulator/Safety нельзя.** | Explicit/ambiguous phrases, scenarios, trusted outcome limits, counters, urgency/reason/data-to-collect, routing revision reference, draft/compile/discard UI. | Backend Ticket 33: stateful evaluator, committed Escalation и exact Safety lane; нет multi-turn simulator API, Project Safety read/overlay, routing admission. |
| [37 — проверка качества, журнал решений, расходы и публикация](../../.scratch/support-workspace/issues/37-add-case-intelligence-evaluation-publishing.md#L1-L34) | **Можно выделить задачи только на чтение, но весь пункт пока заблокирован.** | Журнал решений, объяснение по обращению, добавление исправления, базовые сведения о текущей версии, карточки расходов и очереди, неизменяемая история возврата к прежней версии. | Нужны backend Ticket 34 и контракты проверки качества, наблюдаемости и публикации; пока нет наборов данных, воронки, сравнения версий, влияния на очередь и проверки допуска. Поэтапное включение во frontend не создаётся. |
| [38 — New Case Notification Policy](../../.scratch/support-workspace/issues/38-add-new-case-notification-policy.md#L1-L29) | **Функционально нельзя начинать.** | Максимум сохранить IA placeholder вне DOM для неразрешённых users; переиспользовать personal browser components после появления contract. | Backend 35 полностью отсутствует: нет policy DTO/read/draft/publish/preview/delivery topics. Typed CREATE/REOPEN Decision сам по себе уведомления не создаёт. |

## 7. Рекомендуемая последовательность ближайшей frontend работы

1. **Зафиксировать backend handoff SHA.** Для общедоступной основы можно брать чистый `origin/main`, который уже содержит Ticket 31 и пять frontend controls из `0263dda5`. Если нужен именно полный runtime-hardening Ticket 32, сначала опубликовать/rebase `e9650e8e` в backend remote и прогнать release gates на чистом source.
2. **Выполнить Ticket 34 contract sync первым.** Frontend script требует явный backend directory/ref и чистый checkout ([drift script arguments и checks](../../scripts/check-backend-openapi-drift.mjs#L14-L63), [clean checkout gate](../../scripts/check-backend-openapi-drift.mjs#L158-L199)).
3. **Сгенерировать client и contract tests**, затем построить один `case-intelligence` repository, который скрывает ETag, expectedVersion, idempotency lookup, `409` reconcile и permission-driven data purge.
4. **Разделить Ticket 35 на 35A/35B:** 35A — typed Detection authoring на существующем API; 35B — полноценный simulator/model picker после backend DTO additions.
5. **Разделить Ticket 37 на 37A/37B:** 37A — Decision/correction/cost read surfaces; 37B — evaluation, versions/diff и publishing после backend Ticket 34.
6. **Не переносить legacy `groups/priorityRules` JSON в новый экран.** Новый source of truth — `CaseIntelligenceDetectionPolicyDto.topics/rules`; `/cases/settings` ведёт на canonical guided surface и не остаётся вторым editor.

## 8. Итог без двусмысленности

- **Классификации есть:** Detection `topics` + runtime Case `groupCode` admission.
- **Визуального редактора нет:** его теперь можно строить на frontend, но текущий DTO требует согласовать отдельный display label и расширенный test/validation contract.
- **Ticket 34 больше не `blocked-by-backend 31` по существу:** backend 31 remote и его 21 operations доступны; frontend contract просто ещё не синхронизирован.
- **Ticket 32 дал budget/cost foundation:** пять нужных HTTP controls уже remote, но полный closure/hardening commit пока local-only.
- **Tickets 35–37 разблокированы частями, не целиком.**
- **Ticket 38 всё ещё полностью blocked backend 35.**
- **Ничего из 31–32 не разрешает включить LIVE:** это остаётся gate backend Ticket 33.

## 9. Обновление после frontend Tickets 34–35 — 11 августа 2026

Доступный contract slice синхронизирован с backend
`e9650e8e8d2831232eeabf09f88960fac1f52f6d1`; guided Detection editor,
проверка одной фразы, budget controls, canonical routes и permission-safe
controller реализованы. Функциональность постоянная: без frontend feature
flags, env toggles, rollout/canary controls и legacy JSON editor.

Остаётся конкретный backend contract follow-up. Pinned OpenAPI публикует
`routerContext.maxSignals <= 20`, но pinned compiler принимает только `<= 8`.
OpenAPI также не публикует compiler upper bound `365` для attach/reopen windows
и часть ограничений stable codes/scalar collections. Frontend заранее проверяет
фактические границы pinned compiler, чтобы не отправлять заведомо отклоняемую
команду, но Ticket 34 не объявляет closed typed-contract parity завершённой до
исправления backend schema и следующего pinned sync.
