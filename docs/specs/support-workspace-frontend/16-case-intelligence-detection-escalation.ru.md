# Support Workspace: Case Intelligence Detection и Human Escalation

Статус: normative proposal для frontend/backend handoff
Дата: 8 августа 2026 года
Область: Support Settings, decision explainability, evaluation и analytics

## 1. Решение

Lola не должна сводить все сообщения к бинарному `Case / не Case` и не должна
смешивать Case с вызовом человека. Для каждого завершённого USER-сигнала
backend возвращает пять ортогональных результатов:

```text
О чём разговор?
CASUAL | PRODUCT_INQUIRY | PRODUCT_PROBLEM

Что сделать с Case?
NO_CASE | CREATE | ATTACH | REOPEN | DEFER

Нужен ли фоновый review?
NONE | MONITOR | QA_REVIEW

Какое следующее handoff-действие?
NONE | OFFER | ASK_REASON_ONCE | ESCALATE

Есть ли обязательный safety risk?
CLEAR | SUSPECTED | URGENT
```

Case decision управляет созданием и связью End User Case. Review disposition
управляет фоновым контролем, handoff action — следующим диалоговым действием,
safety decision — обязательным risk flow. Обычный продуктовый вопрос
становится наблюдаемым Case, но не будит оператора. Подтверждённая явная
просьба человека всегда даёт `ESCALATE`; offer/ask допустимы только для
неоднозначной фразы или Project scenario.

Это соответствует существующей доменной границе:

- `Conversation` — где шло упорядоченное общение;
- `End User Case` — какая долговечная продуктовая цель отслеживается;
- `Case Escalation` — почему этой цели сейчас нужен человек;
- `Case Assignment` — кто отвечает после принятого handoff;
- notification — доставка committed факта, а не его источник истины.

## 2. Продуктовые классы

| Класс             | Пример                                                        | Case                 | Push/attention                  |
| ----------------- | ------------------------------------------------------------- | -------------------- | ------------------------------- |
| `CASUAL`          | погода, приветствие, свободное общение                        | нет                  | нет                             |
| `PRODUCT_INQUIRY` | промокоды, бонусы, регистрация, механики продукта             | create/attach/reopen | только monitor/quality sampling |
| `PRODUCT_PROBLEM` | не прошёл депозит, заблокирован аккаунт, действие не работает | create/attach/reopen | по Escalation Policy            |

Safety decision не является четвёртым продуктовым классом. `SUSPECTED/URGENT`
применяются поверх Case decision, создают отдельный safety occurrence и при
нормативном пороге немедленную escalation/alert. Project может выбрать
разрешённую команду, канал и SLA, но не выключить detection.

## 3. Три policy и один атомарный release bundle

Policy независимо редактируются и версионируются, но runtime не активирует
случайную комбинацию. `CaseIntelligenceReleaseRevision` закрепляет совместно
проверенные Detection, Escalation, Safety, model profile, calibrator, dataset и
Routing overlay. Shadow, canary, activation и rollback переключают bundle
целиком.

Mandatory platform Safety hotfix не ждёт Project approval. Старый bundle
становится неeligible; backend либо публикует совместимый replacement bundle,
либо возвращает `SAFETY_RECONCILING` и блокирует ordinary Assistant output до
reconcile. UI показывает platform-owned update read-only и не предлагает лиду
откатить Safety ниже обязательного floor.

### 3.1. Case Detection Policy

Определяет, что является продуктовой целью и как сообщение относится к Case:

- natural-language описание Project scope;
- topics с stable code, label, description, positive и negative examples;
- bounded rules `EXACT`, `PHRASE`, `ATTRIBUTE`, `SEMANTIC_STATEMENT`;
- language/channel/audience scope и fallback locale;
- include/exclude semantics без произвольного JavaScript/SQL/regex;
- attach/reopen windows и candidate limits;
- confidence tiers для monitor, suggest и auto-apply;
- ambiguity action `DEFER | REVIEW`, а не скрытое `NO_CASE`;
- bounded context, debounce и runtime limits;
- pinned model profile и prompt/schema compiler revision.

Keywords являются evidence. Одно слово `бонус` не обязано автоматически
создать Case: keyword rule может пропустить сигнал в дешёвый semantic Router.
Exact deterministic action допустим только для узких, проверяемых правил.

Compiler contract фиксирует Unicode NFKC, locale-aware case folding,
whitespace/punctuation normalization, word boundaries и typed attribute
operators. Quoted/negated match идёт в semantic validation/`DEFER`.
Deterministic precedence: platform Safety → confirmed explicit request →
Project mandatory rules → `DO_NOT_ESCALATE` → semantic/default; неразрешимый
same-priority conflict даёт `DEFER`.

### 3.2. Escalation Policy

Определяет, когда существующей или новой продуктовой цели требуется человек:

- отдельно confirmed `EXPLICIT_HUMAN_REQUEST` и
  `AMBIGUOUS_HUMAN_TERM`/semantic intent;
- confirmed explicit request всегда даёт `ESCALATE`; только ambiguous term или
  Project scenario выбирает `OFFER | ASK_REASON_ONCE | ESCALATE`;
- Project scenarios: deposit, withdrawal, identity, responsible gaming и
  другие controlled codes;
- допустимое число clarification, failed resolution, no-match и repeat turns;
- проверенные Assistant outcomes `NO_ANSWER`, `KNOWLEDGE_INSUFFICIENT`,
  `TOOL_FAILED`, `UNRESOLVED`, а не подсчёт произвольного текста;
- sentiment/frustration как один из signals, но не достаточная причина сам по
  себе;
- `DO_NOT_ESCALATE` rules, которые не могут ослабить platform safety floor;
- stable reason code, urgency и данные, которые надо собрать до handoff;
- ссылка на Routing Policy. Escalation guidance не назначает конкретного
  оператора и не содержит свободный routing prompt.

### 3.3. Platform Safety Policy

Владеет обязательными классами риска и выполняется отдельно от обычного
Case Intelligence budget/emergency pause:

- versioned platform classifier/guard revision;
- закрытые minimum classes `SELF_HARM_OR_SUICIDE`,
  `CREDIBLE_THREAT_OR_VIOLENCE`, `HARM_INVOLVING_MINORS`,
  `RESPONSIBLE_GAMING_CRISIS` и severity;
- multilingual labelled/sentinel datasets и hard gates по
  `riskClass × locale × channel`;
- trusted evidence и severity;
- idempotent safety occurrence, Case link и Human Escalation;
- approved safe response и запрет обычного troubleshooting после handoff;
- Project overlay только для queue/SLA/channel и разрешённой видимости;
- отдельные retention, masking и audit requirements.

`safetyAnalysisState` (`PENDING | READY | FAILED`) независим от обычного
Router. Пока eligible signal не получил доказанный safety outcome, обычный
Assistant reply заблокирован. Failure/timeout создаёт durable retry, approved
safe fallback и operational alert; после recovery выполняется reconcile.

## 4. Дешёвый runtime cascade

```text
durable USER signal
  ├─ safety lane (без debounce и обычного budget gate)
  └─ deterministic pre-gate
       ├─ duplicate/noise/exact exclusion/explicit request/obvious attach
       └─ short debounce batch
            └─ small structured Router
                 ├─ backend validation + confidence tier
                 ├─ Case decision
                 └─ stateful Escalation evaluator
                      ├─ no escalation
                      ├─ offer/ask once
                      └─ committed Human Escalation

DEFER/conflict/high-impact ambiguity
  └─ optional stronger-model review or human-labelled queue
```

Live Router получает только delta USER messages, небольшой surrounding
context, краткие активные Case candidates и compiled policy. Полная
Conversation, raw Event log, Internal Knowledge corpus и операторские notes не
передаются автоматически.

Cost controls:

- самый дешёвый approved model profile, который прошёл текущий dataset gate;
- strict structured output, маленький output budget и отсутствие tools;
- stable cache-friendly policy prefix и измеряемый cache hit rate;
- idempotent deduplication и batch быстрых USER turns;
- stronger fallback только для `DEFER`/high-impact ambiguity;
- Project token/money soft/hard caps и platform circuit breakers;
- offline shadow/backfill через дешёвый asynchronous batch, но не live handoff;
- при budget outage signals остаются в backlog, explicit request и safety не
  превращаются в `NO_CASE`.

Оптимизируется cost of correct decision, а не цена одного вызова. Слишком
слабая модель, создающая лишние handoff и corrections, не считается дешёвой.

## 5. Decision contract

Frontend не вычисляет решение. Минимальный server-owned result:

```ts
type CaseIntelligenceDecision = {
  signalIds: string[];
  conversationClass: "CASUAL" | "PRODUCT_INQUIRY" | "PRODUCT_PROBLEM";
  caseDecision: "NO_CASE" | "CREATE" | "ATTACH" | "REOPEN" | "DEFER";
  reviewDisposition: "NONE" | "MONITOR" | "QA_REVIEW";
  handoffAction: "NONE" | "OFFER" | "ASK_REASON_ONCE" | "ESCALATE";
  safetyDecision: "CLEAR" | "SUSPECTED" | "URGENT";
  topicCode?: string;
  candidateCaseId?: string;
  confidence: {
    conversationClass: number;
    caseDecision: number;
    handoffAction: number;
    safetyDecision: number;
    calibratorRevisionId: string;
    coverage: "SUFFICIENT" | "INSUFFICIENT";
    interval: { low: number; high: number };
  };
  reasonCodes: string[];
  matchedRuleIds: string[];
  evidenceMessageIds: string[];
  policy: {
    releaseRevisionId: string;
    detectionRevisionId: string;
    escalationRevisionId: string;
    safetyRevisionId: string;
    modelProfileRevisionId: string;
    datasetRevisionId: string;
    routingOverlayRevisionId: string;
    compilerVersion: string;
  };
  stages: {
    detection: "READY" | "DEFERRED" | "FAILED" | "BUDGET_REJECTED" | "PAUSED";
    escalation: "READY" | "DEFERRED" | "FAILED";
    safety: "PENDING" | "READY" | "FAILED";
  };
  assistantRelease: "ALLOW" | "BLOCK" | "SAFE_FALLBACK";
  routingAdmission?:
    "ROUTABLE" | "OUT_OF_HOURS" | "NO_ELIGIBLE_TEAM" | "DELIVERY_DEGRADED";
};
```

Stage state не подменяет `NO_CASE`. Техническая ошибка, low confidence и
budget reject остаются видимыми отдельно. Confidence — server-calibrated
значение с pinned calibrator/coverage, а не self-reported число модели;
insufficient coverage запрещает auto-apply.

## 6. Support Settings IA

```text
/support/settings/case-intelligence
├─ overview
├─ detection
├─ escalation
├─ safety-routing
├─ models-budget
├─ evaluation
├─ versions-audit
└─ decision-log
```

### Overview

- runtime state: `PAUSED`, `SHADOW`, `CANARY`, `LIVE`, `DEGRADED` или
  `SAFETY_RECONCILING`;
- active release bundle, component revisions и effective time;
- signals/backlog/oldest pending;
- Cases и Escalations за выбранное сопоставимое окно;
- quality/cost guard status;
- quick links к failed/deferred decisions и rollback.

### Detection editor

- scope description с bounded length;
- category cards: name/code/description/positive/negative examples;
- rule builder с явным типом match и scope;
- word collections по locale вместо одного бесконечного textarea;
- confidence tiers и ambiguity behavior;
- attach/reopen/context/debounce advanced controls;
- overlap/duplicate/unsafe-broad-rule validation;
- доступный test console для одной фразы и небольшого диалога.

### Escalation editor

- direct human request terms и semantic guidance раздельно;
- сценарии и режим `offer / ask once / escalate now`;
- stateful counters clarification/failure/repeat/no-match;
- trusted outcome sources, которые увеличивают counter;
- transition table по idempotent attempt/outcome: increment, reset, freeze,
  offer accept/decline, timeout и policy migration;
- urgency/reason/data-to-collect;
- routing policy reference без выбора исполнителя в guidance;
- locked platform safety rules рядом, но не внутри mutable Project draft.

### Models & Budget

- approved Case Intelligence model profiles с provider-safe display names;
- measured quality/cost/latency на pinned dataset;
- pinned calibrator, coverage и confidence interval по class/locale/channel;
- input/output/context limits, timeout и allowed fallback;
- Project soft/hard budgets и прогноз при текущем traffic;
- cache read/write, token и cost breakdown;
- явное объяснение, какие deterministic/safety paths работают при pause.

### Evaluation

- labelled dataset revision и distribution по class/topic/language/risk;
- safety coverage/gates по `riskClass × locale × channel`, sentinel failures и
  canary stop conditions;
- comparison `published vs candidate`;
- precision/recall/F1, critical recall, confusion, attach/reopen accuracy;
- escalation precision/recall, false handoff, missed critical, correction rate;
- cost per 1k signals, accepted Case, escalation и resolved Case;
- error buckets с permission-safe examples;
- shadow sample, queue-load impact и publish admission result.

### Versions & Audit

- immutable revision history и diff;
- author, reason, validation/evaluation receipts;
- component revisions и atomic release bundle diff;
- publish/canary/pause/rollback переключают jointly evaluated bundle;
- rollback создаёт новую release revision из прежнего tuple, не переписывая
  историю;
- conflict и unknown outcome используют expected version, idempotency и lookup.

### Decision log

- поиск по safe Case/Conversation/signal reference;
- stage `RULE | AI | END_USER_REQUEST | CMS_USER | SAFETY | FALLBACK`;
- matched rules, confidence, candidates, selected decision и последствия;
- model/policy/cost/latency без raw hidden prompt или sensitive transcript;
- deep link к Case/Escalation/AI Operation при наличии permission.

## 7. Operator и Lead surfaces

Case/Conversation inspector показывает компактное объяснение:

- почему Case создан, привязан или переоткрыт;
- почему он только monitored или требует человека;
- topic/priority confidence и policy revision;
- исходная классификация и последняя reviewed correction;
- ссылка `Подробнее о решении` по отдельному permission.

Correction требует reason и не переписывает исходное решение. Она становится
candidate label только после review policy. Простая правка поля не обучает
модель автоматически.

Обычный `PRODUCT_INQUIRY` появляется в Case inbox, quality sampling и
analytics и по умолчанию не создаёт personal/browser notification. Отдельная
published New Case Notification Policy может создать topic
`SUPPORT_CASE_CREATED` на committed `CREATE/REOPEN`; это не attention и не
Human Escalation. Push «Требует человека» создаётся только committed Case
Escalation, Assignment или отдельным Operational Alert policy.

Support Lead с `project.support.notification_policy.manage` настраивает
Project policy: `OFF | IMMEDIATE | DIGEST`, create/reopen, product class/topic/
priority scope, eligible subscribers/Teams и optional effective window. Он не
может включить чужой browser permission, подписать другого CMS User или
управлять его devices. Project policy, personal preference и browser/device
state показываются раздельно.

После committed Escalation UI отдельно показывает routing admission
`ROUTABLE | OUT_OF_HOURS | NO_ELIGIBLE_TEAM | DELIVERY_DEGRADED`. Escalation
не исчезает при отсутствии маршрута, но copy не обещает «подключаем оператора»
до `ROUTABLE`; остальные states используют approved fallback text и показывают
операционный recovery state.

## 8. Metrics и аналитика

Обязательная funnel-модель:

```text
Conversations with USER activity
  → product conversations
  → created/reopened Cases
  → monitored Cases
  → offered handoff
  → Human Escalations
  → accepted human work
  → verified/assumed/abandoned/unresolved outcome
```

Каждая метрика имеет stable definition, numerator/denominator, timezone,
cohort, complete-through, policy revision и suppression rules.

Минимальный набор:

- `CASUAL / PRODUCT_INQUIRY / PRODUCT_PROBLEM` volume;
- `NO_CASE / CREATE / ATTACH / REOPEN / DEFER` volume и accuracy;
- Cases without escalation и containment rate;
- escalation rate по `END_USER_REQUEST | RETENIVE_DECISION | CMS_USER |
SYSTEM_POLICY | SAFETY`;
- clarification/failure/repeat distribution и time-to-escalation;
- false positive/false negative/correction/override rate;
- critical recall и missed critical incidents;
- cost/tokens/cache/latency по stage/model/policy revision;
- cost на 1 000 signals, Case, accepted escalation и resolved Case;
- knowledge gap: product inquiries с correction, low confidence, failed answer
  или последующей эскалацией.

Frontend никогда не считает эти метрики из загруженных Messages или текущего
inbox. Drill-down выполняется отдельным permissioned backend query.

## 9. Permissions и disclosure

Capabilities разделяются минимум на:

- read current policy/status;
- manage detection draft;
- manage escalation draft;
- preview/evaluate candidate;
- publish/pause/rollback;
- read cost;
- read decision log;
- review/correct labels;
- manage safety routing overlay;
- platform-only manage safety detection.

Отсутствующее permission-поле не оставляет label, count или placeholder в DOM.
Decision log не отдаёт raw provider prompt, chain-of-thought, hidden candidate
PII или неразрешённые Message bodies.

## 10. Responsive и accessibility

- Settings desktop использует левую section navigation и один content canvas;
- tablet переводит navigation в drawer, сохраняя unsaved draft;
- mobile показывает editor list → editor detail → preview как route stack;
- rule builder и example list полностью keyboard-operable;
- drag-and-drop не является единственным способом изменения порядка;
- errors привязаны к exact field/rule и имеют summary;
- charts имеют таблицу/текстовый summary;
- status и confidence не кодируются только цветом;
- shadow refresh не перемещает focus и не сбрасывает выбранный error bucket;
- reduced motion отключает diff/highlight transitions.

## 11. Backend handoff gates

Frontend задачи нельзя считать готовыми только по существованию старого JSON
policy API. Нужны pinned OpenAPI contracts для:

- closed DTO Detection/Escalation/Safety/model policies;
- component revisions, atomic release bundle, diff, preview, activation,
  pause, canary и rollback;
- test one input и bounded multi-turn dry run;
- dataset, shadow comparison, quality admission и error samples;
- metrics catalog/funnel/cost и permissioned drill-down;
- decision log и Case-scoped explain;
- exact permissions, target authority, allowedActions, ETag/expected version,
  idempotency lookup и safe errors;
- fixtures всех status/conflict/degraded/unknown enum states;
- separate stage/safety failure states, assistant release gate и routing
  admission fixtures;
- Project New Case Notification Policy, personal topic/preference и independent
  delivery fixtures из backend Ticket 35.

Legacy `/cases/settings` остаётся compatibility route только до cutover. Raw
JSON не получает новые скрытые поля и не становится вторым source of truth.

## 12. Acceptance criteria

- обычный social turn не создаёт Case при достаточной уверенности;
- вопрос о продукте создаёт/привязывает monitored Case без push по умолчанию;
  published New Case policy может отдельно уведомить о CREATE/REOPEN;
- новая тема внутри активной Conversation не прикрепляется молча к старому Case;
- явная просьба человека создаёт Case Escalation независимо от semantic model;
- неоднозначный human term может offer/ask, но confirmed explicit request нельзя
  понизить ниже `ESCALATE`;
- после configured failed attempts выполняется exact `offer/ask/escalate` flow;
- negated/quoted keyword не вызывает handoff только из-за совпадения строки;
- safety hard floor нельзя отключить Project policy или budget pause;
- safety failure блокирует обычный reply, сохраняет durable retry и approved
  safe fallback/alert;
- low confidence/analysis failure не превращаются в `NO_CASE`;
- каждая decision объяснима через pinned rules/policies/model/cost/evidence;
- correction сохраняет original decision и reviewed feedback отдельно;
- runtime bundle нельзя activate без joint schema, overlap, calibration,
  safety, quality, cost и capacity admission;
- mandatory Safety hotfix нельзя удержать Project approval/rollback;
  `SAFETY_RECONCILING` блокирует ordinary reply до replacement bundle;
- rollback проверен и не переписывает historical revisions;
- committed Escalation переживает отсутствие eligible route, а UI не обещает
  соединение до `ROUTABLE`;
- обычные Cases не отправляют Human Attention; отдельная New Case policy может
  отправить независимый `SUPPORT_CASE_CREATED` на CREATE/REOPEN;
- desktop/tablet/mobile, keyboard, 200% zoom и axe проходят для основных flows.

## 13. Отраслевые основания

Подробный primary-source review:
[Case Intelligence и human escalation](../../research/support-case-intelligence-escalation-primary-sources-2026-08-08.ru.md).

Ключевые паттерны подтверждают официальные материалы:

- Zendesk разделяет classification fields и последующие workflows;
- Intercom разделяет escalation rules/guidance и routing workflow;
- Salesforce повышает confidence threshold вместе с риском автоматизации;
- AWS сочетает exact/pattern/semantic conditions;
- Dialogflow хранит последовательные no-match состояния;
- OpenAI рекомендует task-specific continuous evals и structured outputs;
- NIST требует измерять human-AI configuration и continuous monitoring.
