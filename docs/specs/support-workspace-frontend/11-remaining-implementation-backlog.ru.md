# Support Workspace: что ещё нужно реализовать на фронтенде

Статус: рабочий backlog после появления F0/F1-основы в `main`
Дата: 7 августа 2026 года
Область: оставшаяся работа в `Lola_front`; интеграции вынесены в конец

## 1. Текущее состояние

CMS-фронтенд Support ещё не является полноценной операторской платформой.
В `main` уже есть основа:

- `/support/inbox` и выбор диалога;
- базовая лента сообщений;
- перевод и AI Suspension;
- availability;
- internal notes;
- начальная версия `/support/control`.

Это полезный фундамент, но пока всё собрано в монолитную страницу. Нет полного
операторского shell, единого Conversation Surface, durable messaging и
остальных вертикалей, необходимых для замены LiveChat.

## 2. Порядок работы

```text
W0 contracts
  ↓
F0 shared Conversation Surface + shell foundation
  ↓
F1 inbox/navigation ──> F2 messaging reliability ──> F3 Case desk
                                               ├──> F4 presence/attachments
                                               └──> F5 macros/knowledge
  ↓
F6 lead control + notifications
  ↓
F7 QA/analytics contracts
cutover

Параллельно после backend handoff: F8 Case Intelligence policies/evaluation
Отдельно после core: JSM / HelpDesk integrations
```

Вертикаль считается готовой только вместе с API contract, permissions,
fixtures, UI states, tests и rollout flag. Наличие backend-кода без pinned
OpenAPI не считается frontend handoff.

## 3. Основной backlog

### W0. Синхронизировать frontend с backend-контрактами

Нужно обновить pinned OpenAPI и договориться о точных контрактах для:

- workspace projections и durable delivery;
- permissions, target authority и `allowedActions`;
- read/unread, delivery и idempotency lookup;
- assignment, availability, queues, routing и SLA;
- presence, typing, attachments, notes, macros и Internal Knowledge;
- Lead Control и browser notifications;
- QA и analytics, когда их IAM/API будут готовы;
- external work — отдельным integration handoff, описанным ниже.

Для каждой операции нужны fixtures: minimal/full success, forbidden/hidden,
conflict, stale revision, unknown outcome, pagination и forward-compatible
unknown enum. Feature flags должны быть перечислены до начала UI-работы, а не
после реализации.

Результат W0: frontend-команда понимает, что уже можно подключать, чего в API
ещё нет и какой backend owner закрывает каждый пробел.

### F0. Один Conversation Surface

Выделить из существующих Users chat и Support один общий модуль переписки:

- один message renderer и одна лента;
- один composer frame и единая draft semantics;
- один toggle `Оригинал / Перевод`;
- общий translation progress и reply preview;
- общий scroll anchor, pagination и realtime reconcile;
- typed capabilities для Support-only функций: note, attachment, claimant,
  read/delivery и viewers.

`UserWorkspaceDialog` и Support должны стать adapters общего Surface. Им нельзя
собирать собственную ленту, подменять translation toggle или копировать CSS
сообщений. Старый `.message-row` renderer в Case detail нужно удалить.

В эту же вертикаль входит presentation foundation:

- route-level Support shell;
- full-tab режим без фона CMS и document scroll;
- единый scroll/focus owner для overlays;
- отсутствие повторного mount/refetch при `На весь экран / Свернуть`.

Exit: Users и Support проходят один behavior suite; в production-коде нет
второго полноценного renderer/composer/translation control.

### F1. Полноценный inbox и навигация

Собрать рабочее место вокруг общего Surface:

- два режима: Cases и все Conversations;
- URL state для view, filters, sort и selection;
- прямые ссылки на Case и Conversation;
- cursor pagination;
- поиск по доступным backend projections;
- Saved Views и bounded counts/freshness;
- безопасная inbox row с unread, draft, assignment, priority, SLA и waiting
  side без client inference;
- desktop layout с inbox, Conversation и inspector;
- tablet drawer и mobile route stack `Inbox → Conversation → Inspector`;
- переходы из `/users`, `/live` и `/cases` по каноническим deep links.

Exit: оператор находит любую разрешённую рабочую единицу, открывает её по URL и
не теряет filters, selection, scroll или draft при Back/Forward.

### F2. Надёжная переписка

Довести transport и message state до support-grade поведения:

- durable send без требования активного socket пользователя;
- idempotency key и lookup результата после timeout;
- ordinal ordering, gap detection и REST reconcile;
- first-unread и личная durable read position;
- per-message `Accepted / Delivered / Read / Failed`;
- защита от duplicate при reconnect и повторном событии;
- draft recovery после `409`, revoke, reconnect и unknown outcome;
- стабильная догрузка истории без скачка scroll anchor;
- отдельные public reply и internal note drafts.

Exit: offline/reconnect/retry не создают дубль и не теряют текст оператора;
frontend не выводит delivery/read из локальных таймеров или socket presence.

### F3. Inspector и Case desk

Добавить рабочий контекст и полный Case lifecycle:

- Case state, category, priority, assignment и team;
- claim, transfer, assignment offer и version conflict;
- SLA clocks, waiting side, pause/resume и breach state;
- availability/capacity без смешивания с socket online;
- queue, routing reason и server-provided allowed actions;
- workflow actions с revision, reason и command outcome;
- вкладки `Обращение`, `Пользователь`, `Данные`, `События`, `Активность`;
- lazy loading, masking и purge sensitive fields при revoke;
- classification correction и связь с опубликованной Case Intelligence policy.

Exit: оператор понимает ответственность, состояние Case и следующий допустимый
шаг, не открывая старые `/cases`, `/users` или `/live`.

### F4. Совместная работа и вложения

- viewers и typing как TTL hints, а не ownership;
- предупреждение о параллельном ответе;
- bidirectional typing с generation guards;
- upload tray, progress, retry и cancellation;
- scan/ready/rejected/revoked states;
- image/document preview и attachment-only Message;
- отдельные permissions и grants для public reply и internal note;
- безопасное восстановление upload/draft после reconnect.

Exit: два оператора видят конфликт до отправки, а вложения не попадают в
неправильную visibility scope.

### F5. Internal collaboration и content

- internal notes с отдельным composer mode и draft key;
- каталог macros с поиском, permissions, variables и revision provenance;
- macro вставляет редактируемый draft и ничего не отправляет автоматически;
- отдельная Support Internal Knowledge;
- поиск статьи, preview, quote/link и вложения внутри рабочего места;
- разные corpus, permissions, retention и retrieval logs для Internal
  Knowledge и пользовательского AI Knowledge;
- publish/version/rollback flow для macros и внутренних материалов.

Exit: оператор готовит reply, note, macro и internal article в одном workspace;
внутренний материал не может случайно попасть End User или пользовательскому AI.

### F6. Lead Control и browser notifications

Начальная `/support/control` не считается завершённой. Нужно добавить:

- server-defined KPI с freshness и ссылкой на определение;
- drill-down из риска в точный отфильтрованный inbox;
- action table для breach/risk, unassigned, overloaded, stuck routing и
  delivery failures;
- causal timeline и audited assign/override/acknowledge/close с reason;
- operational alerts `OPEN / ACKNOWLEDGED / CLOSED`;
- понятные `BUILDING / READY / STALE / DEGRADED` состояния projections;
- browser permission, backend preference и registered device как три разные
  сущности;
- настройки notification types и устройств;
- безопасный текст уведомления без PII/message body;
- deep link в точный разрешённый Case/view после login и project restore;
- обработку denied/revoked browser permission и недействительной subscription.

Exit: lead переходит от риска к конкретному Case и выполняет audited action;
уведомление не врёт о permission/subscription и открывает правильный контекст.

### F7. QA и analytics

Эта вертикаль начинается только после отдельных backend и IAM контрактов.

QA:

- очередь review snapshots;
- versioned scorecard;
- evidence на Conversation/Message;
- submit, feedback, dispute и calibration;
- permission scope без лишних PII/internal notes.

Analytics:

- server-owned metric catalog и definitions;
- timezone, cohort, freshness и no-data semantics;
- защищённый drill-down;
- server-side export/share;
- обозначение legacy gaps и incomplete coverage.

Браузер не вычисляет employee score или историческую статистику из загруженных
страниц сообщений.

### F8. Case Intelligence Detection и Human Escalation

Эта вертикаль не является частью обычной classification correction в F3 и не
разблокируется старым raw JSON policy endpoint. Нужны отдельные versioned
backend contracts из
[нормативной спецификации](./16-case-intelligence-detection-escalation.ru.md).

- синхронизировать closed DTO для Detection, Escalation, Safety overlay,
  model/budget profiles и Decision projection;
- построить guided Detection editor: scope, categories, positive/negative
  examples, typed rules, thresholds, ambiguity и test console;
- построить Escalation editor: explicit human request, offer/ask/escalate,
  trusted failure counters, urgency и routing policy reference;
- показать platform safety floor как locked, разрешая только published Project
  routing overlay;
- добавить candidate evaluation, shadow/canary, quality/cost admission,
  version diff, audit и rollback;
- дать permissioned Decision log и Case-scoped explain без raw prompt/PII;
- добавить server-owned funnel от USER activity до Case, Escalation и outcome;
- не вычислять decisions, quality или cost из Messages в браузере.

Exit: продуктовый вопрос наблюдаем как Case без ложного push, явный handoff и
safety создают durable Escalation, а лид может безопасно настроить, проверить,
опубликовать и откатить policy с измеримым качеством и стоимостью.

## 4. Cutover

Перед переводом операторов нужны:

- visual matrix: `1920×1080`, `1440×1000`, `1280×800`, `1024×768`,
  `390×844`, light/dark, 200% zoom и mobile keyboard;
- keyboard-only основной flow;
- axe без critical/serious нарушений;
- e2e для reply, translation, note, conflict, reconnect, revoke, project
  switch, attachments и browser Back;
- проверка duplicate prevention, draft recovery, read/delivery accuracy и P95
  selection/send feedback;
- read-only dogfood, затем write pilot на одном проекте;
- reversible flags, runbook и проверенный rollback;
- перевод legacy `/users`, `/live` и `/cases` на Support deep links;
- удаление legacy chat orchestration после adoption gate.

Core cutover не должен ждать JSM/HelpDesk, если внешний integration contract не
входит в согласованный P0 scope. Но UI не показывает фиктивную integration
panel и не обещает действие, которого нет в опубликованном API.

## 5. Отдельный integration track: JSM и HelpDesk

Интеграции находятся ниже основного backlog намеренно. Они нужны продукту, но
не должны блокировать Conversation/Case core и надёжность переписки.

В текущих спецификациях используется название `JSM` — Jira Service Management.
Отдельного адаптера `GSM` в frontend/backend документации нет, поэтому ниже
зафиксирован именно JSM. Если GSM означает другую систему, для неё понадобится
свой contract handoff и отдельная строка backlog.

### Contract handoff

- отдельные OpenAPI operations и permissions для connection, mapping, object
  read и Case-scoped actions;
- OAuth/credentials остаются на backend;
- idempotency, async command status и lookup для unknown outcome;
- vendor capabilities и ограничения публикуются сервером;
- canonical Lola Case state не подменяется vendor status;
- fixtures для disconnected, degraded, reauth required, stale destinations,
  `202 pending`, partial failure и unknown outcome.

### Settings → Integrations

- connection states: disconnected, authorizing, connected, degraded,
  reauth-required и disabled;
- явный выбор site/project, включая multi-site;
- test connection, last successful sync и refresh destinations;
- mapping draft, preview, validation, publish, version diff и rollback;
- compatibility inbox для объектов и mapping, которые требуют внимания;
- отдельные permissions на connection/mapping и работу с внешним объектом.

### `/support/external-work`

- master/detail очередь проблем синхронизации и восстановления;
- remote object, last attempt, correlation, failure reason и next action;
- retry/reconcile без повторного создания внешнего тикета;
- фильтры по adapter, project, state и age;
- causal timeline вместо набора toast-сообщений.

### Case inspector

- link existing и unlink;
- create external object по server-provided required fields;
- явный safe-context preview перед отправкой данных наружу;
- история чата никогда не копируется автоматически;
- internal/public external comment с разными permissions и подтверждением;
- status `В очереди / Отправляется / Создано / Требует внимания /
Результат неизвестен`;
- HTTP `202` остаётся pending до remote confirmation;
- копирование remote text создаёт редактируемый chat draft, но не отправляет
  его пользователю.

Integration exit: disconnect/reconnect, `202`, retry и unknown outcome не
создают дубли; оператор видит, что произошло локально и во внешней системе.

## 6. Приоритет

```text
P0: W0, F0, F1, F2, F3, core cutover
P1: F4, F5, завершение Lead Control, browser notifications
P1 после backend handoff: F8 Case Intelligence Detection/Escalation
P2: JSM/HelpDesk integration track
P3: QA/analytics после готовности отдельных контрактов
```

Приоритет не отменяет зависимости. Например, attachments из F4 могут стать P0,
если без них текущая команда поддержки физически не может перейти с LiveChat.
Такое изменение фиксируется отдельным scope decision, а не тихим расширением
F2.

## 7. Связанные документы

- [Полный remediation plan](./08-remediation-plan.ru.md)
- [UI/UX и visual acceptance](./09-ui-ux-remediation.ru.md)
- [Full-tab workspace discovery](./10-full-tab-workspace-discovery.ru.md)
- [Testing и rollout](./07-testing-rollout-roadmap.ru.md)
- [Backend/frontend contract readiness](./06-frontend-architecture-contracts.ru.md)
