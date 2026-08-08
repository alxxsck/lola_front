# Case Intelligence и human escalation: первичные отраслевые источники

Дата исследования: 8 августа 2026 года.

Цель: проверить, как зрелые support-платформы разделяют обнаружение обращения, классификацию,
эскалацию человеку, критические safety-сигналы, управление качеством и стоимостью; превратить
наблюдения в требования к Lola. Использовались только официальные документы производителей и NIST.

## Короткий вывод

Для Lola недостаточно одного бинарного вопроса «это Case или нет». Нужны две независимые оси:

1. **Значимость разговора:** `CASUAL | PRODUCT_INQUIRY | PRODUCT_PROBLEM`.
2. **Необходимое внимание:** `NONE | MONITOR | HUMAN | URGENT_SAFETY`.

Для implementation contract вторая концептуальная ось дополнительно
разделяется на три ортогональных результата: background review disposition,
dialog handoff action и Safety decision. Это не позволяет смешать sampling,
предложение человека, committed Escalation и risk outcome одним enum.

Так обычный вопрос о бонусах становится наблюдаемым Case, но не будит оператора. Реальная проблема,
не решённая AI после разрешённого числа попыток, получает `HUMAN`. Угроза себе или окружающим
получает `URGENT_SAFETY` сразу, независимо от бюджета обычного Case Intelligence.

Наиболее устойчивый отраслевой паттерн — гибрид:

- быстрые детерминированные правила для точных фраз, атрибутов и безусловных аварийных сигналов;
- дешёвый семантический классификатор с коротким bounded context и строгим структурированным ответом;
- отдельная stateful policy для повторов, неудачных попыток и уточняющих вопросов;
- отдельный workflow, который после решения об эскалации выбирает очередь, уведомления и SLA;
- confidence tiers, shadow evaluation, журнал каждого решения и versioned publish/rollback.

Это не теоретическая конструкция. Intercom прямо разделяет data-driven Escalation Rules,
natural-language Escalation Guidance и последующий Workflow; AWS разделяет exact/pattern/semantic
match и actions; Salesforce связывает степень автоматизации с разными confidence thresholds.

## 1. Что показывают официальные платформы

### 1.1. Zendesk: классификация — это данные, а действие задаётся отдельно

Zendesk Intelligent Triage анализирует входящие обращения и сохраняет topic, sentiment, language и
custom entities как поля тикета. Эти значения затем используются триггерами, SLA, routing и
аналитикой — модель сама не должна неявно выполнять произвольное действие
([About intelligent triage](https://support.zendesk.com/hc/en-us/articles/4964463770650-About-intelligent-triage),
[use cases and workflows](https://support.zendesk.com/hc/en-us/articles/5222280338202-Intelligent-triage-use-cases-and-workflows)).

Оператор видит классификацию и confidence, может её исправить, а история изменений сохраняется в
ticket events. Zendesk отдельно предупреждает, что ручное исправление поля само по себе не обучает
модель — feedback pipeline должен быть явным
([Viewing intelligent triage classifications](https://support.zendesk.com/hc/en-us/articles/4685355428250-Viewing-intelligent-triage-classifications-in-tickets)).

При росте taxonomy Zendesk обнаруживает конфликтующие, дублирующие и пересекающиеся intents и
предлагает уточнить name/description. Это важное требование к редактору policy, иначе новые правила
постепенно снижают точность
([Intent quality recommendations](https://support.zendesk.com/hc/en-us/articles/10198478867994-Announcing-intent-quality-recommendations-in-intelligent-triage)).

**Вывод для Lola:** результат классификации должен быть first-class данными Case/Message, а не
одноразовой веткой кода. Нужны видимые confidence/reason, история исправлений и проверка taxonomy на
overlap до публикации.

### 1.2. Intercom Fin: правила, natural-language guidance и workflow — разные сущности

Intercom Fin поддерживает два способа определить эскалацию:

- **Escalation Rules** по структурированным атрибутам: sentiment, issue type, сумма заказа,
  VIP-признак, данные API и т. п.;
- **Escalation Guidance** — естественное текстовое описание сценария, когда нужно эскалировать,
  предложить человека, сначала задать вопрос или, наоборот, не эскалировать.

После срабатывания отдельный Workflow собирает данные, выбирает команду и выполняет routing. Guidance
не отвечает за назначение адресата
([Manage Fin escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)).

Default behavior различает неоднозначный сигнал и подтверждённую просьбу. Слова вроде `agent` или
`support`, раздражение и повтор вопроса могут сначала вызвать **offer to escalate**. Явная просьба
человека вызывает немедленную эскалацию. Если повторный trigger возникает сразу после уже сделанного
предложения, Fin эскалирует, чтобы не зациклиться. Документация также описывает повторение проблемы
примерно через три хода как loop-сигнал
([тот же источник](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)).

Intercom отдельно считает количество и долю эскалаций, а также configuration-based escalation reason.
Это позволяет понять, какое конкретное правило создаёт лишнюю нагрузку. Слишком широкая guidance
повышает handoff rate и уменьшает automation rate, поэтому правила рекомендуется делать узкими
([тот же источник](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)).

Для high-risk content Fin заявляет автоматическую безопасную передачу человеку при self-harm,
вреде детям, jailbreak и высокорисковых медицинских, юридических или финансовых советах
([Fin AI Agent explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)).

**Вывод для Lola:** нужны отдельные `DetectionPolicy`, `EscalationPolicy` и `RoutingPolicy`.
Эскалация должна иметь режимы `OFFER`, `ASK_ONCE`, `ESCALATE_NOW`, `DO_NOT_ESCALATE`, а также
стабильный `reasonCode`. Stateful loop detection нельзя выразить только ключевыми словами.

### 1.3. Salesforce: чем опаснее действие, тем выше confidence threshold

Salesforce Einstein Case Classification использует три ступени автоматизации:

1. показать оператору top values;
2. выбрать лучший вариант, но оставить подтверждение человеку;
3. автоматически сохранить значение и запустить routing.

Для каждой ступени задаётся свой confidence threshold; порог полной автоматизации должен быть выше
порога предварительного выбора. Если confidence недостаточен, система отступает на менее
автоматизированную ступень
([Einstein Classification Prediction Confidence](https://help.salesforce.com/s/articleView?id=sf.cc_service_confidence_faq.htm&language=en_US&type=5),
[Key Concepts](https://help.salesforce.com/s/articleView?id=service.cc_service_key_concepts.htm&language=en_US&type=5)).

Salesforce рекомендует начать с рекомендаций человеку, измерить результат, затем включать select и
auto-save. Performance dashboard сравнивает prediction с финальным значением закрытого Case и
показывает случаи, не прошедшие confidence gate
([Track Einstein Classification App Performance](https://help.salesforce.com/s/articleView?id=service.cc_service_performance.htm&language=en_US&type=5)).

**Вывод для Lola:** одного глобального `confidence >= 0.65` недостаточно. Нужны разные пороги для
`MONITOR`, автоматического `CREATE/ATTACH`, предложения handoff и немедленной эскалации. При низкой
уверенности надо сохранять кандидаты и отправлять на review, а не молча выбирать класс.

### 1.4. AWS Contact Lens: exact, pattern и semantic match дополняют друг друга

AWS Contact Lens позволяет строить правила по:

- exact или pattern words/phrases;
- semantic match слов и синонимов;
- natural-language semantic statement;
- sentiment за период или за весь контакт;
- очереди, customer attributes и другим structured данным.

Matched rule может категоризировать контакт, создать Case/Task, отправить уведомление или EventBridge
event
([Create Contact Lens rules](https://docs.aws.amazon.com/connect/latest/adminguide/build-rules-for-contact-lens.html),
[Automatically categorize contacts](https://docs.aws.amazon.com/connect/latest/adminguide/rules.html)).

AWS прямо рекомендует exact phrases для конечного и хорошо известного списка, а natural-language
semantic match — когда формулировок слишком много или важен контекст. Semantic match избавляет от
необходимости перечислять все многоязычные синонимы
([Automatically categorize contacts](https://docs.aws.amazon.com/connect/latest/adminguide/rules.html)).

События rule match и analysis failure доступны отдельно, поэтому можно различить «правило не
сработало» и «анализ технически не состоялся»
([Contact Lens notification types](https://docs.aws.amazon.com/connect/latest/adminguide/rules-notification-types.html)).

**Вывод для Lola:** keywords должны быть быстрым и объяснимым сигналом, но не единственным
классификатором. Policy editor должен явно предлагать `EXACT | PATTERN | SEMANTIC_STATEMENT`,
показывать стоимость каждого режима и не заставлять администратора перечислять переводы всех слов.

### 1.5. Google Dialogflow CX: no-match streak — first-class состояние

Dialogflow CX имеет последовательные события `sys.no-match-1` … `sys.no-match-6` и аналогичные
`no-input`, поэтому разные ответы и переходы можно назначать на первую, вторую и последующие неудачи.
Есть отдельное событие `flow-failed-human-escalation` и transition
`END_FLOW_WITH_HUMAN_ESCALATION`
([State handlers](https://docs.cloud.google.com/dialogflow/cx/docs/concept/handler?hl=en),
[Dialogflow CX handoff](https://docs.cloud.google.com/agent-assist/docs/handoff-cx)).

Classification threshold задаётся для каждого flow и языка; ниже порога вызывается no-match. Google
советует прежде изменения threshold добавлять negative examples
([Agent settings](https://docs.cloud.google.com/dialogflow/cx/docs/concept/agent-settings)).

Live-agent handoff является сигналом с metadata для интеграции и измерений; сам Dialogflow не должен
неявно реализовывать бизнес-процедуру передачи
([Fulfillments](https://docs.cloud.google.com/dialogflow/cx/docs/concept/fulfillment)).

**Вывод для Lola:** количество неудачных попыток, повторов и уточнений должно храниться в состоянии
Case/goal, а не вычисляться из последней фразы. Пороги целесообразно разрешить по языку и policy
scope. Handoff event должен быть отделён от routing side effects.

### 1.6. Microsoft/AWS safety: критические классы требуют отдельного контура

Azure AI Content Safety возвращает категорию и severity; self-harm отделяет безопасное упоминание,
образовательный контекст, личный кризис и инструкции/поощрение причинения вреда. Microsoft отдельно
предупреждает, что качество и false-positive rate различаются по языкам и требуют тестирования
([Harm categories](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/harm-categories),
[Foundry severity levels](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-filter-severity-levels)).

Amazon Bedrock Guardrails также разделяет content categories, denied topics, exact word filters,
PII filters и contextual grounding. Guardrail можно вызвать отдельным `ApplyGuardrail` API без
основной генеративной модели
([Guardrails overview](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html),
[ApplyGuardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)).

AWS рекомендует описывать semantic topic точным определением и несколькими примерами, но не пытаться
использовать topic detection для отдельных слов или сущностей — для них предназначен word/entity
filter
([Denied topics](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-denied-topics.html)).

**Вывод для Lola:** self-harm, credible threat, harm to minors и другие critical incidents нельзя
делать обычными Project keywords или отключать вместе с бюджетом Case Intelligence. Нужен
platform-owned safety classifier с Project-specific routing overlay и немедленным durable event.

### 1.7. OpenAI: structured output, evals и экономия применимы в разных местах

Structured Outputs позволяют ограничить ответ модели строгой JSON Schema; отказ модели доступен как
отдельное программно распознаваемое состояние
([Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)). Это
подходит для закрытого результата triage, но не заменяет backend validation и policy checks.

OpenAI Graders поддерживают детерминированные string checks, similarity, model graders и composite
graders. Это позволяет отдельно измерять classification, attachment и escalation decisions
([Graders API](https://platform.openai.com/docs/api-reference/graders)).

Prompt Caching уменьшает стоимость повторяющегося prefix и предоставляет `cached_tokens` в usage,
поэтому стабильную policy/taxonomy следует располагать до динамического сообщения и измерять
реальную cache hit rate
([Prompt Caching](https://openai.com/index/api-prompt-caching/)).

Batch API стоит дешевле синхронных запросов, но выполняет работу асинхронно в пределах 24 часов. Он
подходит для offline shadow replay, backfill и eval datasets, но не для live safety или human
escalation
([Batch API FAQ](https://help.openai.com/en/articles/9197833-batch-api-faq)).

**Вывод для Lola:** live triage — маленькая синхронная модель; offline evaluation и backfill — batch;
статический policy prefix — cache-friendly; все вызовы должны сохранять token usage, cached tokens,
latency и фактическую стоимость.

### 1.8. NIST: измерять нужно систему вместе с человеком

NIST AI RMF требует постоянного измерения и мониторинга рисков, включая human-AI configuration, а
Playbook рекомендует документировать и измерять человеческий надзор
([AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf),
[AI RMF Playbook](https://airc.nist.gov/docs/AI_RMF_Playbook.pdf)).

**Вывод для Lola:** метрика «точность модели» недостаточна. Нужны override rate, missed critical
rate, время до просмотра/принятия оператором, доля лишних handoff и результат после handoff.

## 2. Рекомендуемая доменная модель Lola

### 2.1. Не смешивать четыре понятия

| Понятие         | Ответ на вопрос                                         | Примеры                                                   |
| --------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `Conversation`  | Где шло общение?                                        | погода, бонусы, проблема депозита                         |
| `CaseCandidate` | Есть ли продуктовая цель, которую стоит контролировать? | вопрос о промокоде, регистрация, проблема оплаты          |
| `Case`          | Какую долговечную продуктовую цель мы отслеживаем?      | один Case «депозит не зачислен» с несколькими сообщениями |
| `Escalation`    | Почему и когда нужен человек?                           | явная просьба, loop, policy rule, safety                  |

Safety incident может создать/привязать Case, но должен иметь собственный durable record и workflow.
Обычный Case не должен автоматически создавать уведомление оператору.

### 2.2. Результат дешёвого Router

```text
conversationClass: CASUAL | PRODUCT_INQUIRY | PRODUCT_PROBLEM
caseDecision: NO_CASE | CREATE | ATTACH | REOPEN | DEFER
attentionDecision: NONE | MONITOR | OFFER_HUMAN | ASK_ONCE | ESCALATE | URGENT_SAFETY
topicCode / priority / candidateCaseId
confidenceByField
reasonCodes[]
matchedRules[]
evidenceMessageIds[]
needsExpensiveReview: boolean
```

`DEFER` обязателен: неуверенность модели не должна искусственно превращаться ни в `NO_CASE`, ни в
эскалацию.

## 3. Рекомендуемый runtime pipeline

1. **Durable ingest:** записать Message и immutable detection signal одной транзакцией.
2. **Safety lane:** platform-owned multilingual classifier/guardrail проверяет каждое USER-сообщение;
   высокий severity создаёт incident и urgent workflow без debounce и обычного budget gate.
3. **Deterministic pre-gate:** пустое/техническое сообщение, exact/pattern rules, trusted user request,
   Project/channel/language/audience attributes, deny/allow lists.
4. **Debounce:** объединить короткую серию сообщений пользователя, не потеряв evidence IDs.
5. **Cheap semantic Router:** маленькая настраиваемая модель получает только новые сообщения,
   небольшой surrounding context, краткие активные Case candidates и опубликованную policy.
6. **Backend validation:** проверить enum, references, permissions, confidence tiers и deterministic
   criticality floor.
7. **Stateful escalation evaluator:** применить counters `clarificationCount`, `failedAttemptCount`,
   `repeatCount`, `noMatchStreak`, sentiment trend и explicit request state.
8. **Decision application:** создать/привязать Case отдельно от Escalation. Уведомить только для
   `ESCALATE`/`URGENT_SAFETY` или специально настроенного monitor rule.
9. **Deferred expensive review:** более сильная модель только для `DEFER`, конфликтующих правил и
   high-impact неоднозначности.

## 4. Что должно настраиваться на Project

### 4.1. Case Detection Policy

- version, status `DRAFT | SHADOW | PUBLISHED | SUPERSEDED`, effective time, author, change reason;
- natural-language описание «что считать продуктовым обращением»;
- topics: code, label, description, positive examples, negative examples, priority floor;
- deterministic rules: `EXACT | PATTERN | ATTRIBUTE`, language, channel, audience, include/exclude;
- semantic statements с примерами и ожидаемым классом;
- attach/reopen policy и временные окна;
- thresholds отдельно для `MONITOR`, `CREATE/ATTACH`, `AUTO_APPLY`; по необходимости — по языку;
- ambiguity action `DEFER | REVIEW | NO_CASE`, но не скрытая эвристика;
- model profile: provider/model, max tokens, timeout, retries, allowed fallback, max cost;
- debounce, bounded context и candidate limits.

### 4.2. Escalation Policy

- явные multilingual human-request phrases и semantic intent;
- режим явной просьбы: `OFFER | ASK_REASON_ONCE | ESCALATE_NOW`;
- product scenarios: deposit, withdrawal, identity, responsible gaming и другие;
- количество допустимых clarification/attempt/repeat/no-match до эскалации;
- sentiment rules и customer attributes, например VIP или regulatory region;
- `DO_NOT_ESCALATE` исключения с более низким приоритетом, чем platform safety;
- reason codes, urgency, information-to-collect и handoff summary template;
- ссылку на Routing Policy вместо хранения конкретного исполнителя в AI guidance.

### 4.3. Platform-owned Safety Policy

- фиксированные классы и минимальные severity floors;
- multilingual validation dataset;
- неизменяемый Project hard floor: Project может выбрать команду/канал/SLA, но не отключить detection;
- immediate, idempotent incident + escalation + audit event;
- approved safe response и запрет повторного обычного AI troubleshooting после handoff;
- отдельные permissions, redaction и retention.

## 5. Confidence и fallback

Рекомендуемые ступени:

| Уверенность/риск                | Действие                                                                |
| ------------------------------- | ----------------------------------------------------------------------- |
| низкая уверенность, низкий риск | `DEFER`, сохранить кандидаты, не создавать уведомление                  |
| средняя                         | создать Case в `MONITOR`, показать классификацию лиду для подтверждения |
| высокая                         | автоматически `CREATE/ATTACH/REOPEN`                                    |
| явный deterministic handoff     | эскалировать независимо от semantic confidence                          |
| safety severity выше hard floor | немедленный urgent workflow независимо от стоимости                     |

Threshold должен быть не просто числом из UI, а результатом offline calibration. После смены модели,
prompt, taxonomy или языка требуется новый shadow gate.

## 6. Наблюдаемость и доказуемость

Для каждого решения хранить:

- `signalId`, Project, Conversation, Message/evidence IDs;
- policy revision, compiler version, model/provider version, prompt/schema hash;
- deterministic matches и normalized reason codes;
- все candidate classes/Case IDs и confidence, выбранное действие;
- counters multi-turn state до и после решения;
- latency, input/output/cached tokens, provider cost, retry/fallback path;
- decision source: `RULE | AI | END_USER_REQUEST | CMS_USER | SAFETY | SYSTEM_FALLBACK`;
- actor correction, old/new value, reason, timestamp;
- Case/Escalation/notification IDs, чтобы доказать последствия;
- `analysisState: READY | FAILED | BUDGET_REJECTED | DEFERRED` отдельно от `NO_CASE`.

Данные аналитики:

- разговоры → product conversations → Cases → escalations → accepted human work;
- Case creation rate и attach/reopen accuracy;
- escalation rate по source/reason/rule/policy revision;
- false positive, false negative и override rate;
- critical recall и missed critical incidents;
- clarification/loop distribution и время до эскалации;
- AI-resolved, assumed resolved, abandoned, human-resolved;
- cost на 1 000 сообщений, на созданный Case, на принятую эскалацию и на предотвращённый ручной review;
- queue load и SLA impact после изменения policy.

## 7. Evaluation и безопасная публикация

Каждая revision проходит:

1. schema/overlap/duplicate validation;
2. deterministic unit fixtures;
3. multilingual labelled dataset с casual, product inquiry, product problem, explicit handoff,
   adversarial wording и safety cases;
4. replay текущей production выборки в shadow без side effects;
5. сравнение с действующей revision по precision, recall, critical recall, attach accuracy,
   escalation rate и cost;
6. human review ошибок, особенно false-negative safety и ложных handoff;
7. staged rollout по Project/audience/channel;
8. автоматический pause/rollback при превышении quality, cost или queue-load guardrails.

Минимальные acceptance gates должны задаваться отдельно по классу. Для safety нужен hard recall gate;
для обычного `PRODUCT_INQUIRY` можно оптимизировать precision/cost и направлять неоднозначность в
shadow review.

## 8. Cost-control без потери безопасности

- deterministic gate и независимый дешёвый safety classifier до генеративного Router;
- debounce коротких сообщений и idempotent deduplication;
- incremental context вместо полного transcript;
- small-model default, stronger-model fallback только для `DEFER`/high impact;
- stable prompt/policy prefix и измеряемый prompt-cache hit rate;
- per-Project daily/monthly token and money soft/hard caps;
- concurrency/rate limits, circuit breaker, emergency pause;
- offline shadow/evals/backfill через Batch;
- sampling для QA обычных casual decisions, но не для critical safety;
- при исчерпании бюджета сохранять backlog и deterministic escalation, а не превращать отказ
  анализа в `NO_CASE`.

Оптимизировать нужно не минимальную цену одного вызова, а **стоимость правильного решения**. Слишком
слабая модель может увеличить retries, неверные Cases и человеческую нагрузку.

## 9. Требования к будущим backend/frontend задачам Lola

### Backend

- ввести versioned `CaseDetectionPolicy`, `EscalationPolicy`, `SafetyRoutingPolicy`;
- расширить Router schema двумя независимыми решениями: Case и attention;
- поддержать exact/pattern/semantic/attribute rules и positive/negative examples;
- реализовать stateful multi-turn counters и deterministic evaluator;
- сделать Project model/cost profile и usage ledger;
- добавить immutable decision/evidence log и агрегированную analytics projection;
- реализовать dataset, preview, shadow, compare, publish, pause и rollback contracts;
- вынести safety lane из обычного budget/emergency pause;
- формализовать permissions и audit для редактирования и публикации policy.

### Frontend

- сделать **Support Settings → Case Intelligence** с отдельными разделами Detection, Escalation,
  Safety routing, Models & budget, Evaluation, Versions & audit;
- дать guided editor для topics/descriptions/examples и rule builder вместо raw JSON;
- preview одной фразы/диалога с matched rules, confidence, Case/attention decisions и estimate cost;
- показывать conflicts/overlaps/duplicate guidance до публикации;
- показать shadow comparison, error samples и impact на Case/escalation/queue volume;
- реализовать publish confirmation, staged rollout, pause и rollback;
- в Case/Conversation inspector показывать «почему создано/привязано/эскалировано» и позволять
  исправить классификацию с обязательной причиной;
- сделать dashboards по funnel, quality, escalation sources, cost и knowledge gaps.

## 10. Решения, которые не следует копировать буквально

- Нельзя делать общий keyword list единственным детектором: он ломается на контексте, морфологии и
  языках. Keywords нужны для точных deterministic сигналов и объяснимости.
- Нельзя использовать общий sentiment как достаточную причину handoff: широкая эскалация быстро
  увеличит человеческую нагрузку. Нужны scenario и state.
- Нельзя считать ручное исправление автоматическим обучением. Сначала оно попадает в labelled
  dataset, затем проходит review и controlled evaluation.
- Нельзя использовать Batch для live escalation.
- Нельзя разрешать Project policy ослабить platform safety floor.
- Нельзя смешивать low-confidence analysis failure с `NO_CASE` или successful resolution.
- Нельзя помещать routing destination в свободный AI prompt: detection и workflow должны быть
  типизированными и независимо изменяемыми.

## Итоговая рекомендация

Lola следует реализовать не «ещё один prompt с ключевыми словами», а управляемую **Case Intelligence
Policy Platform**. Её основной контракт — дешёво и доказуемо превратить каждый новый USER-сигнал в
два независимых результата: что отслеживать как Case и требуется ли человеку вмешаться сейчас.
Ключевые слова, natural-language guidance, semantic model, multi-turn counters и safety classifier
должны быть отдельными источниками evidence, соединёнными backend policy engine, а не скрытыми
эвристиками одной модели.
