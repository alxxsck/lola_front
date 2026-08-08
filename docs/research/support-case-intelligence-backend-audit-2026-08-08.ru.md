# Case Intelligence и вызов администратора: аудит backend-контрактов

Дата проверки: 8 августа 2026 года.

Проверенная версия backend: локальный `Lola_backend/main`, commit
`9228bd9f12c480bf8ee445a04b9ac0eeda08e523`. В рабочем дереве backend находились незавершённые
изменения по Lead Assignment; этот аудит их не изменял и не использует как доказательство Case
Intelligence.

## Короткий ответ

Функциональность **предусмотрена архитектурой и частично реализована**, но полноценной настройки
«что считать обращением и когда звать человека» сейчас нет.

Реально работает следующее:

- каждое завершённое USER-сообщение становится долговечным сигналом для Case Intelligence;
- сообщения объединяются коротким debounce, после чего bounded AI Router возвращает
  `NO_CASE | CREATE | ATTACH | REOPEN`;
- Project может публиковать versioned Case Policy с группами, правилами минимального приоритета и
  таймерами;
- явная просьба End User позвать человека может создать/найти Case, открыть Case Escalation,
  перевести Case в `WAITING_ADMIN` и поставить уведомление;
- сотрудник CMS может открыть эскалацию вручную.

Не реализовано как управляемый продуктовый контракт:

- Project include/exclude rules, определяющие, что является Case, а что нет;
- keywords или другие быстрые Project rules для Case detection;
- Project-настраиваемые confidence thresholds и ambiguity action;
- отдельный Project model profile `CASE_INTELLIGENCE`;
- Project-настраиваемые token/cost/retry limits в Case Policy;
- first-class dataset/shadow evaluation/publish gate и автоматический rollback;
- автоматическая policy «Lola не справляется — позвать специалиста»;
- работающее редактирование Project-списка слов «администратор/оператор/поддержка».

Поэтому frontend сейчас может честно дать редактор категорий, priority rules и debounce/recontact
таймеров, но не полноценный экран **Support Settings → Case Intelligence** из исходного замысла.

Ключевые абсолютные source anchors:

- нормативный полный Case Policy:
  `/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md:522-555`;
- текущая фактическая форма policy:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/end-user-case-policy-compiler.ts:26-50`;
- потеря descriptions/examples перед Router:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/default-case-policy.ts:28-46` и
  `/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-types.ts:1-5`;
- конфликт `adminRequestTerms` с публичной схемой:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/case-escalation-action.adapter.ts:71-81` и
  `/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/system-action-types.ts:168-183`;
- типизированная, но не подключённая `RETENIVE_DECISION`:
  `/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/public/end-user-case-escalation-request.port.ts:3-25`;
- существующий frontend JSON editor:
  `/Users/alxxsck/Documents/Lola_front/src/pages/EndUserCaseSettingsPage.vue:127-219` и
  `/Users/alxxsck/Documents/Lola_front/src/pages/EndUserCaseSettingsPage.vue:313-409`.

## 1. Два разных решения, которые нельзя смешивать

### 1.1. Case detection

Это решение: является ли новое сообщение самостоятельным обращением, продолжением существующего
Case или вообще не требует Case. Нормативный результат Router — `NO_CASE`, `CREATE`, `ATTACH` или
`REOPEN` ([End User Cases master, строки 277–291](/Users/alxxsck/Documents/Lola_backend/docs/specs/end-user-cases/00-master.ru.md#L277-L291)).

### 1.2. Human escalation

Это отдельное решение: нужен ли уже существующему или только что созданному Case человек. Активная
эскалация — отдельный occurrence; `REQUESTED` означает `WAITING_ADMIN`, а обычная AI uncertainty или
priority warning не должны ставить этот статус ([Case Escalation master, строки
44–59](/Users/alxxsck/Documents/Lola_backend/docs/specs/end-user-case-escalation/00-master.ru.md#L44-L59)).

Следовательно, «это обращение» не равно «сразу позвать администратора». Case может быть создан и
обработан Lola без человека; человек вызывается отдельным проверяемым действием.

## 2. Что требует нормативная Support Platform документация

Нормативная master-спецификация требует, чтобы Support Lead публиковал versioned categories и Case
detection rules с возможностью оценки и отката ([Support Platform master, строки
205–214](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/00-master.ru.md#L205-L214)). В разделе AI
Case Intelligence требования уточнены:

- versioned include/exclude rules;
- отдельный `CASE_INTELLIGENCE` model profile;
- deterministic pre-gate до платной модели;
- debounce и incremental aggregation;
- shadow evaluation на размеченном dataset;
- precision, recall, critical recall и cost per accepted Case
  ([Support Platform master, строки
  297–314](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/00-master.ru.md#L297-L314)).

Целевая последовательность также закреплена нормативно: deterministic gate → дешёвый structured
router → debounced aggregator → тяжёлый анализ только по явной необходимости; auto-apply допускается
только после shadow quality gate ([Support Platform master, строки
418–425](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/00-master.ru.md#L418-L425)).

Backend-спецификация описывает ожидаемое содержимое опубликованной Case Policy:

- включаемые intents/problems с examples;
- явные exclusions/non-support examples;
- category code, description и examples;
- priority/severity floor rules;
- active/recontact windows;
- minimum confidence и ambiguity action;
- model profile, prompt/schema revision;
- debounce, token, cost и retry limits
  ([Support Platform backend, строки
  522–535](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md#L522-L535)).

Эта же спецификация требует durable signal, deterministic duplicate/noise/exclusion/obvious-attach
gate, затем bounded router и debounced aggregator ([Support Platform backend, строки
537–555](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md#L537-L555)). Отдельный
profile, budget, quality dataset и shadow gate входят в acceptance criteria
([строки 910–921](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md#L910-L921)).

Важно: сама Support Platform документация признаёт, что Case Intelligence evaluation hardening
должен закрываться отдельной owning spec после Tickets 11–16, а не считаться автоматически готовым
вместе с ними ([строки 923–945](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md#L923-L945)).

## 3. Что действительно реализовано

### 3.1. Каждое завершённое USER-сообщение учитывается

Text Chat создаёт `USER_MESSAGE` signal в той же транзакции, где сохраняется сообщение
([`chat.service.ts`, строки 293–335](/Users/alxxsck/Documents/Lola_backend/src/modules/chat/chat.service.ts#L293-L335)).
Это отдельно доказано тестом транзакционного ingest
([`end-user-case-chat-ingest.test.ts`, строки
5–126](/Users/alxxsck/Documents/Lola_backend/test/end-user-case-chat-ingest.test.ts#L5-L126)).

Сигнал не вызывает AI синхронно. Он сохраняется идемпотентно со статусом `PENDING` и получает
`availableAt` после Project quick-turn debounce
([`end-user-case-signal.service.ts`, строки
28–67](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/signals/end-user-case-signal.service.ts#L28-L67)).
Для message signals debounce применяется явно
([`end-user-case-signal-scheduling.ts`, строки
3–16](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/signals/end-user-case-signal-scheduling.ts#L3-L16));
по умолчанию это 3 секунды
([`default-case-policy.ts`, строки
3–20](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/default-case-policy.ts#L3-L20)).

То есть ответ на вопрос «проверяется ли каждое сообщение?» — **да, каждое завершённое USER-сообщение
становится сигналом**, но несколько быстрых сообщений могут обрабатываться одним Router batch.

### 3.2. Bounded structured Router реально существует

Router получает не весь чат, а максимум восемь signals, шесть соседних сообщений и двенадцать Case
candidates; общий evidence ограничен 32 KiB
([`end-user-case-router-evidence.ts`, строки
9–15 и 38–90](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-evidence.ts#L9-L90)).
Provider использует строгую JSON Schema и просит модель выбрать
`NO_CASE | CREATE | ATTACH | REOPEN`
([`end-user-case-router-ai.provider.ts`, строки
12–62](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-ai.provider.ts#L12-L62)).

Backend не доверяет ответу модели: валидирует ссылки, форму, enum-значения и confidence. Но пороги
сейчас зашиты в коде: `0.75` для `NO_CASE` и `0.65` для остальных решений
([`end-user-case-router-validation.ts`, строки
3–7 и 81–124](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-validation.ts#L3-L124)).
Low-confidence результат не становится Case и не теряется: signal паркуется до нового evidence
([`end-user-case-router.service.ts`, строки
97–115](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router.service.ts#L97-L115),
[`end-user-case-router-run.adapter.ts`, строки
52–63 и 111–147](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-run.adapter.ts#L52-L147)).

### 3.3. Versioned Case Policy имеет работающий lifecycle

Backend публикует реальные IAM-protected endpoints:

- `GET /admin/projects/:projectId/end-user-case-policy`;
- `PUT .../draft`;
- `POST .../preview`;
- `POST .../publish`.

Все требуют `project.cases.settings.manage`
([`end-user-case-policy.controller.ts`, строки
35–88](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/api/end-user-case-policy.controller.ts#L35-L88));
это закреплено contract test
([`end-user-case-policy-api.test.ts`, строки
11–27](/Users/alxxsck/Documents/Lola_backend/test/end-user-case-policy-api.test.ts#L11-L27)).

Save/publish используют expected version, idempotency key, immutable revisions и переводят прежний
draft/published revision в `SUPERSEDED`
([`end-user-case-policy.service.ts`, строки
68–178](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/end-user-case-policy.service.ts#L68-L178)).
Операции проходят IAM audit transaction и сохраняют resource type, operation, revision и replay flag
([строки 211–234](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/end-user-case-policy.service.ts#L211-L234)).

### 3.4. Реальная форма настройки значительно уже нормативной

Текущий compiler принимает только:

- `groups`: code, label, optional description и до пяти examples;
- `priorityRules`: условия по group/type/impact/urgency/tone и priority floor;
- `scheduling`: quick-turn debounce, aggregation debounce, recontact idle и reopen window
  ([`end-user-case-policy-compiler.ts`, строки
  26–50 и 94–169](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/end-user-case-policy-compiler.ts#L26-L169)).

В этой форме нет include rules, exclude rules, keywords, minimum confidence, ambiguity action,
model profile, prompt selection, dataset/shadow или token/cost/retry limits. DTO также принимает
только `groups`, `priorityRules` и `scheduling`
([`end-user-case-policy.dto.ts`, строки
16–71](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/api/dto/end-user-case-policy.dto.ts#L16-L71)).

Дополнительный разрыв: description/examples сохраняются в compiled policy, но текущий Router helper
сводит группы к `{code, label}`
([`default-case-policy.ts`, строки
28–46](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/policy/default-case-policy.ts#L28-L46)).
Router types и AI evidence также содержат только code/label
([`end-user-case-router-types.ts`, строки
1–5 и 38–55](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-types.ts#L1-L55),
[`end-user-case-router-evidence.ts`, строки
52–58](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-evidence.ts#L52-L58)).
Следовательно, введённые администратором описания и примеры категорий **сейчас не влияют на
классификацию Router**, несмотря на то что сохраняются.

### 3.5. Полного бесплатного pre-gate пока нет

Есть полезные детерминированные части:

- exact preferred Case для CMS message/action context;
- code-owned safety markers для self-harm и account takeover, поднимающие priority до `CRITICAL`
  ([`case-platform-criticality.ts`, строки
  28–62](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/domain/case-platform-criticality.ts#L28-L62)).

Но preparation всё равно создаёт общий Router envelope и AI analysis run, включая
`deterministicCaseIds`
([`end-user-case-router-preparation.adapter.ts`, строки
150–174 и 207–300](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-preparation.adapter.ts#L150-L300)).
Детерминированная связь заменяет решение модели уже **после** provider response
([`end-user-case-router-application.adapter.ts`, строки
22–67](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/router/end-user-case-router-application.adapter.ts#L22-L67)).

Значит, документированный Stage 0, который до модели бесплатно обрабатывает duplicate, explicit
exclusion и obvious attach, реализован не полностью. Project-owned быстрых include/exclude/keyword
правил вообще нет.

### 3.6. Отдельной модели `CASE_INTELLIGENCE` нет

Project model settings сейчас знают только workloads `ASSISTANT` и `TRANSLATION`
([`ai-model-profiles.service.ts`, строки
12–13 и 42–67](/Users/alxxsck/Documents/Lola_backend/src/modules/ai/model-profiles/ai-model-profiles.service.ts#L12-L67)).
Structured AI API выбирает deployment-wide `this.model` и `this.reasoningEffort`, не Project Case
Intelligence profile
([`ai.service.ts`, строки
235–245 и 297–322](/Users/alxxsck/Documents/Lola_backend/src/modules/ai/ai.service.ts#L235-L322)).

### 3.7. Budget controls существуют, но это platform env, а не Case Policy

Есть emergency pause, global/project hard caps, concurrency caps и operation token caps. Они читаются
из deployment configuration
([`config.ts`, строки
855–887](/Users/alxxsck/Documents/Lola_backend/src/config.ts#L855-L887),
[`end-user-case-budget.service.ts`, строки
44–98](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/budget/end-user-case-budget.service.ts#L44-L98)).

Это защищает расходы, но Project admin не может настроить их в текущем Case Policy editor. Cost API
только показывает emergency status, project hard cap и backlog
([`end-user-case-cost-query.service.ts`, строки
82–97](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/application/end-user-case-cost-query.service.ts#L82-L97)).

### 3.8. На frontend уже есть `/cases/settings`, но это legacy JSON policy editor

Route `/cases/settings` реально зарегистрирован и защищён Permission
`project.cases.settings.manage`
([`router.ts`, строки 245–259](../../src/app/router.ts#L245-L259)). Страница загружает текущую
policy/cost, преобразует compiled policy обратно в draft и вызывает preview/save/publish
([`EndUserCaseSettingsPage.vue`, строки 102–219](../../src/pages/EndUserCaseSettingsPage.vue#L102-L219)).

Но основной способ редактирования — скрытый под «Расширенное редактирование» сырой JSON `Textarea`;
рядом показывается только summary категорий и priority rules
([`EndUserCaseSettingsPage.vue`, строки 313–409](../../src/pages/EndUserCaseSettingsPage.vue#L313-L409)).
Это не новый визуальный Support Settings экран и не редактор detection/escalation policy. Он отражает
ровно текущий узкий backend contract: groups, priority rules и scheduling.

## 4. Как сейчас вызывается администратор

### 4.1. Явная просьба End User

Существует System Product Action `REQUEST_ADMIN_ATTENTION`. Она доступна только AI surface,
по умолчанию выключена и инструктирует модель использовать действие только при явной просьбе
пользователя или повторной просьбе после ответа
([`system-action-types.ts`, строки
143–191](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/system-action-types.ts#L143-L191)).

Перед записью backend проверяет trusted USER message. Встроенный fallback-список включает, среди
прочего, `admin`, `administrator`, `human`, `operator`, `support`, `админ`, `администратор`,
`живой человек`, `оператор`, `поддержка`, `сотрудник`, `специалист` и ES-варианты
([`case-escalation-action.adapter.ts`, строки
31–81](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/case-escalation-action.adapter.ts#L31-L81)).
Проверка нормализует текст и ищет целую последовательность токенов с ограниченным prefix matching
([`admin-attention-request-basis.ts`, строки
9–27 и 36–56](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/admin-attention-request-basis.ts#L9-L56)).

После проверки adapter пишет источник `END_USER_REQUEST`
([`case-escalation-action.adapter.ts`, строки
202–237](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/case-escalation-action.adapter.ts#L202-L237)).
Сервис либо использует связанный активный Case, либо создаёт новый, выставляет
`attentionRequired=true`, переводит его в `WAITING_ADMIN`, создаёт Case Escalation, evidence/history и
notification intents
([`end-user-case-admin-attention.service.ts`, строки
104–196 и 219–300](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/application/end-user-case-admin-attention.service.ts#L104-L300)).

### 4.2. Ручная эскалация сотрудником

CMS может вызвать `POST /admin/projects/:projectId/end-user-cases/:caseId/escalations` с Permission
`project.cases.escalate`, idempotency key и аудируемой mutation
([`end-user-cases.controller.ts`, строки
159–190](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/api/end-user-cases.controller.ts#L159-L190)).
Сервис переводит Case в `WAITING_ADMIN`, ставит `attentionRequired`, создаёт occurrence/history и
уведомления
([`end-user-case-escalation.service.ts`, строки
65–107 и 109–180](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/escalation/end-user-case-escalation.service.ts#L65-L180)).

### 4.3. Настраиваемые слова вызова администратора фактически не работают

Нормативная End User Cases документация утверждает, что Project может расширять
`adminRequestTerms` для любого языка
([`end-user-cases/00-master.ru.md`, строки
301–319](/Users/alxxsck/Documents/Lola_backend/docs/specs/end-user-cases/00-master.ru.md#L301-L319)).
Adapter действительно умеет прочитать `configuration.adminRequestTerms`
([`case-escalation-action.adapter.ts`, строки
71–81](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/case-escalation-action.adapter.ts#L71-L81)).

Однако актуальная `projectConfigSchema` System Action разрешает только `allowedReasonCodes` и
устанавливает `additionalProperties: false`
([`system-action-types.ts`, строки
168–183](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/system-action-types.ts#L168-L183)).
Тест прямо утверждает, что `adminRequestTerms` отсутствует в публичной схеме
([`product-actions-registry.test.ts`, строки
81–89](/Users/alxxsck/Documents/Lola_backend/test/product-actions-registry.test.ts#L81-L89)).

Следовательно, через поддерживаемый Project Action API поле сохранить нельзя. В production
эффективен встроенный fallback-словарь; Project-настройка терминов — **docs/code contract gap**.

### 4.4. Автоматического «Lola не справилась — позвать человека» нет

Типизированный escalation port допускает источник `RETENIVE_DECISION`
([`end-user-case-escalation-request.port.ts`, строки
3–25](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/public/end-user-case-escalation-request.port.ts#L3-L25)).
Но единственный production caller этого port — Product Action adapter, и он всегда отправляет
`END_USER_REQUEST`
([`case-escalation-action.adapter.ts`, строки
216–226](/Users/alxxsck/Documents/Lola_backend/src/modules/product-actions/case-escalation-action.adapter.ts#L216-L226)).

Case Router создаёт/прикрепляет Case, оценивает classification/priority/tone, но не открывает Case
Escalation. Safety regex поднимают priority до `CRITICAL`, однако также не вызывают специалиста сами
по себе. Поэтому автоматическая policy для high-risk, repeated failure или «Lola больше не может
безопасно продолжать» остаётся архитектурной заготовкой, а не действующим поведением.

## 5. Lifecycle, publish, rollback и audit

| Возможность | Фактическое состояние |
| --- | --- |
| Draft | Реализован; новый draft supersede-ит предыдущий |
| Preview | Реализован, но preview показывает compiled policy и примеры priority floors, а не прогон текстовых Case examples |
| Publish | Реализован с expected version и idempotency |
| Immutable revision | Реализована в `EndUserCasePolicyRevision`; Cases/analysis runs pin-ят revision ([`schema.prisma`, строки 3728–3752](/Users/alxxsck/Documents/Lola_backend/prisma/schema.prisma#L3728-L3752)) |
| История revisions | Сохраняется в БД как `SUPERSEDED`, но публичного list/get revision API нет |
| Rollback/restore | First-class endpoint отсутствует; старую revision нельзя выбрать и опубликовать через текущий API |
| Audit | Есть IAM mutation audit с operation/revision/replay; publish reason принимается, но не хранится как отдельное читаемое поле revision/command |
| Shadow dataset/evaluation | Нормативно обязательно, но authoring API, dataset lifecycle и measurable publish gate для Case Policy отсутствуют |
| Automatic rollback/degrade by quality drift | Нормативно описан ([Support Platform backend, строки 546–555](/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/01-backend.ru.md#L546-L555)), в текущем Case Policy lifecycle отсутствует |

OpenAPI также недостаточно строг для полноценного нового frontend: `groups` и `priorityRules`
объявлены как массивы generic `Object`, а `compiledPolicy` — как generic object
([`end-user-case-policy.dto.ts`, строки
27–38](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/api/dto/end-user-case-policy.dto.ts#L27-L38),
[`end-user-case-policy-response.dto.ts`, строки
3–19](/Users/alxxsck/Documents/Lola_backend/src/modules/end-user-cases/api/dto/end-user-case-policy-response.dto.ts#L3-L19)).
Generated client не получает закрытые типы вложенных правил.

## 6. Итоговая матрица

| Требование | Документация | Код/API сейчас | Вывод |
| --- | --- | --- | --- |
| Проверить каждый USER message | Да | Durable signal на каждый completed message | **Есть** |
| Не вызывать модель синхронно на каждый message | Да | Debounce + batch до 8 signals | **Есть** |
| `NO_CASE/CREATE/ATTACH/REOPEN` | Да | Structured Router + backend validation | **Есть** |
| Category code/label | Да | Policy editor + Router evidence | **Есть** |
| Category description/examples | Да | Сохраняются, но не доходят до Router | **Частично, фактически не влияют** |
| Include/exclude examples/rules | Да | Нет поля и compiler/runtime | **Нет** |
| Keywords для Case detection | Не обязательны как единственный механизм, но допустимы внутри deterministic rules | Нет Project-owned механизма | **Нет** |
| Deterministic duplicate/noise/exclusion/attach gate до AI | Да | Отдельные куски есть, provider call не обходится полноценно | **Частично** |
| Настраиваемый confidence/ambiguity | Да | `0.75/0.65` hardcoded; low confidence parked | **Нет настройки** |
| Отдельный `CASE_INTELLIGENCE` model profile | Да | Только ASSISTANT/TRANSLATION; structured model deployment-wide | **Нет** |
| Project budget limits | Да | Platform env caps и read-only cost summary | **Нет Project-настройки** |
| Version/draft/preview/publish | Да | Реализовано | **Есть** |
| Revision history/rollback | Да | Superseded rows есть, public history/rollback API нет | **Частично** |
| Shadow dataset/quality gate | Да | Нет authoring/evaluation lifecycle | **Нет** |
| Явная просьба позвать человека | Да | Product Action + trusted message check + Case Escalation | **Есть, если action включён** |
| Project keywords для просьбы о человеке | Да в End User Cases spec | Adapter читает, public schema запрещает | **Не работает** |
| Ручная эскалация CMS User | Да | REST command + IAM/OCC/audit | **Есть** |
| Автоматическая эскалация по неспособности Lola/high-risk policy | Архитектурно предусмотрена | Нет production caller `RETENIVE_DECISION` | **Нет** |

## 7. Что нужно закрыть на backend до полноценного frontend

1. Расширить закрытый typed Case Policy contract:
   - include rules/intents/examples;
   - explicit exclusions/non-support examples;
   - optional deterministic matchers без превращения системы в хрупкий keyword-only classifier;
   - minimum confidence, ambiguity action и review/fallback state.
2. Передавать Router опубликованные descriptions/examples и exact policy revision, а не только
   category code/label.
3. Реализовать настоящий deterministic pre-gate, который может auditable `IGNORE/ATTACH` до provider
   dispatch.
4. Добавить отдельный Project-approved `CASE_INTELLIGENCE` model profile и связать его с Router и
   Aggregator.
5. Добавить Project authoring для soft budgets и platform-guarded token/cost/retry bounds.
6. Добавить typed policy history, diff, restore/rollback и полноценный publish audit reason.
7. Добавить dataset/evaluation/shadow lifecycle с quality metrics и server-owned admission status.
8. Исправить Product Action schema: либо официально добавить bounded `adminRequestTerms`, либо удалить
   ложное обещание конфигурируемости из документации и adapter.
9. Отдельно спроектировать автоматическую escalation policy для `RETENIVE_DECISION`: допустимые reason
   codes, evidence, high-risk/repeated-failure conditions, budget independence, dedupe и human review.
10. Опубликовать закрытые OpenAPI DTO для всех вложенных settings и ошибок, чтобы frontend не
    воспроизводил compiler rules вручную.

До этого UI может быть только **частичным редактором Case Policy**, а не законченным Case
Intelligence Settings. Делать на фронте поля include/exclude, keywords, threshold, model, budget,
shadow и rollback без backend contract означало бы хранить неработающие настройки или подменять
server policy клиентской логикой.
