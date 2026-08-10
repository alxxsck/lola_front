# Support Workspace: план устранения разрыва между платформой и фронтендом

Статус: planning / не является разрешением на реализацию без contract gate
Дата: 7 августа 2026 года
Последняя проверка SLA и локализации Macro: 10 августа 2026 года
Область: `Lola_front`, с явными зависимостями от `Lola_backend`

## 1. Решение

Support нужно собирать как отдельное полноэкранное route-level рабочее место, а
не развивать `/cases`, `/knowledge` или модальный `UserWorkspaceDialog` по
отдельности. Целевой основной путь:

```text
/support/inbox
  ├─ /support/inbox/cases/:caseId
  └─ /support/inbox/conversations/:conversationId
/support/control
/support/quality
/support/analytics
/support/settings/:section
```

Внутри inbox на desktop всегда три рабочих области: список/очередь, выбранная
Conversation и inspector. Case остаётся рабочей проблемой с workflow, SLA и
ответственностью; Conversation остаётся каналом и упорядоченной историей
сообщений. Их нельзя склеивать в сущность «тикет».

`/live` остаётся диагностикой присутствия, `/users` — профилем, а старый
dialog — временным adapter-ом общего Conversation Surface и/или launcher-ом в
новый URL. Ни один из них не должен содержать вторую chat implementation или
становиться вторым операторским рабочим местом.

### Hard decision: один chat component

Users chat и Support используют один public root component —
`ConversationSurface.vue`, извлечённый из уже работающей chat-части
`UserWorkspaceDialog.vue`. Новый Support UI не имеет права создавать второй
message renderer, translation control или composer. Существующий toggle
`Оригинал / Перевод · <working locale>` переносится без изменения interaction
contract и используется в обоих местах. Доработки attachments, notes,
delivery/read, macros и author identity выполняются внутри общего Surface.

Примитивная отрисовка `.message-row` из `EndUserCaseDetail.vue` удаляется; Case
inspector хранит только evidence metadata/link и открывает Conversation в общем
Surface. «Переиспользовали repository/controller, но нарисовали другой чат» не
считается выполнением этого решения.

## 2. Проверенные факты текущего состояния

### Есть и нужно переиспользовать

- `UserWorkspaceDialog.vue` уже содержит постраничный список диалогов одного
  End User, draft на Conversation, realtime reconcile, перевод и AI
  Suspension; его следует расчленить на feature-модули с characterization
  tests, а не переписывать целиком.
- `EndUserCasesPage.vue` и repository уже дают list/detail, классификацию,
  workflow, assignment, escalation, merge/split и timeline старой модели Case.
- `EndUserCaseSettingsPage.vue` умеет versioned draft/preview/publish старого
  JSON policy для групп и priority floors.
- `KnowledgePage.vue` уже даёт загрузку и редактирование **assistant
  knowledge**, а не закрытую операторскую базу знаний.
- В generated OpenAPI уже есть project-wide Support Workspace read, полный
  lifecycle Support Macro и SLA settings: read, replace/discard draft и
  publish. Для Macro локализация пока не закрыта: draft/revision содержат
  только один `locale/title/body`.

### Реальные блокеры

- Чат находится в profile-first модальном монолите; нет project inbox и
  route-level selection, inspector и deep-linkable рабочего цикла.
- В `EndUserCaseDetail.vue` существует второй примитивный message renderer
  (`.message-row`), который показывает только `message.text` и не имеет
  translation view mode, realtime reconcile, draft/send и общей визуальной
  семантики. Его нельзя превращать в Support chat: нормативная реализация уже
  находится внутри chat-части `UserWorkspaceDialog.vue`.
- `use-admin-conversation-console.ts` сортирует сообщения по
  `createdAt + id`, а не по authoritative `ordinal`, и перед отправкой требует
  активную `onlineSession`. Это прямо блокирует durable offline reply.
- В UI отсутствуют read position/unread, delivery `ACCEPTED/DELIVERED/READ/
FAILED`, author snapshot, viewers/typing, version-conflict recovery,
  attachments и internal-note visibility.
- Нынешние reply templates в dialog захардкожены и не подключены к уже
  существующему Support Macro catalog; composer не сохраняет revision,
  variables, provenance и usage.
- Отдельные `/cases`, `/knowledge` и chat drawer заставляют оператора
  переключать контекст. Они не образуют Support workspace.
- Во frontend OpenAPI уже приняты settings contracts для SLA и lifecycle
  Support Macro. Для availability, части teams/skills, assignment offers,
  search/saved views, notes, lead alerts, QA и analytics покрытие остаётся
  неполным. Нельзя заполнять оставшийся разрыв production mock-ами или
  угадыванием DTO.
- Публичный End User SDK/виджет отсутствует в этом repository как продуктовый
  frontend-контур. Без versioned SDK нельзя завершить identity responder-а,
  read/unread, bidirectional typing, attachments и rollout durable delivery.
- Не спроектированы retention/legal hold/tombstone/purge и удаление из search/
  backup projections для Messages, Attachments и Internal Knowledge.

## 3. Матрица разрыва

| Контур                 | Требуемый результат                                                      | Состояние фронтенда                                      | Блокер/следующий ход                                                             |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Рабочее место          | Три панели, route state, Cases + все Conversations                       | Раздельные `/cases` и profile modal                      | Построить shell и переносить извлечённые модули                                  |
| Project inbox          | system views, cursor, filters, search, saved views                       | Endpoint Conversations есть, UI нет; Case list отдельный | F1 после review DTO; остальное после Tickets 11–12 в pinned OpenAPI              |
| Лента/отправка         | ordinal, unread, delivery, offline, draft recovery                       | timestamp order, online gate, нет delivery/read          | Сначала Chat/Durable Delivery contract и F2                                      |
| Case работа            | lifecycle, category/priority, assignment, SLA, inspector                 | Старые Case commands есть, нет общей рабочей поверхности | Скомпоновать только после allowedActions/revision contract                       |
| Workforce              | availability, capacity, teams, skills, offers/reservation                | Нет UI                                                   | Принять Tickets 05–07, 13–14 через OpenAPI и F3                                  |
| Коллаборация           | viewers, typing, conflict notice, public/note modes                      | Presence смешан с online session; note нет               | Новые realtime/read contracts, F4                                                |
| Вложения               | upload/scan/grants, public/note isolation                                | Нет support contract/UI                                  | Attachment contract и F4                                                         |
| Контент                | macros, internal notes, Internal Knowledge в inspector                   | Macro authoring есть; один locale на Macro; AI knowledge отдельно | Локализованный Macro contract + F5; не переиспользовать `/knowledge` как внутреннюю базу |
| Настройки              | teams, queues, routing, SLA, detection/classification, macros, knowledge | Macro UI есть; SLA API сгенерирован, route/UI нет; старый raw JSON policy | SLA guided editor по текущему contract; остальные разделы после publishable contracts |
| Управление             | control center, alerts, causal timeline                                  | Нет route/UI                                             | Tickets 09–10 OpenAPI и F6                                                       |
| QA/аналитика           | versioned review, scorecard, reports/drill-down                          | Нет contracts; старые Case counts не эквивалентны        | Отдельный backend/IAM discovery и F7; не считать в браузере                      |
| Public End User chat   | claimant identity, readBy, typing, attachments, offline delivery         | SDK не является зависимостью/модулем этого repo          | Параллельный SDK track и version gate до delivery rollout                        |
| Browser notifications  | личные preferences, devices, permission recovery, secure deep link       | Нет Support UI                                           | Ticket 20 contract; не показывать ложный enabled state                           |
| New Case notifications | Project policy, CREATE/REOPEN scope, immediate/digest, effective window  | Нет отдельного topic/policy                              | Backend 35 + Frontend 38; не подменять Attention topic                           |
| External work          | connection/mapping, Case actions, compatibility inbox, recovery          | Нет UI                                                   | Отдельный adapter/OpenAPI vertical; core Case не зависит от vendor               |
| Retention/legal hold   | tombstone/purge/hold и propagation                                       | Нет пользовательских/операционных состояний              | Backend policy + permissioned settings/audit до F4–F6                            |

## 4. Обязательные правила до начала реализации

1. REST projection — источник истины. Socket/realtime — at-least-once hint,
   после которого запускается bounded REST reconcile.
2. Перед каждой vertical нужен merged backend commit, pinned frontend OpenAPI,
   examples/fixtures, permission + `allowedActions`, revision/
   `expectedVersion`, idempotency и сценарии stale/403/409/unknown outcome.
3. Нельзя выводить assignment из viewing, claimant из assignment, availability
   из socket online или delivery из HTTP 200. Эти состояния показываются
   раздельно.
4. Case, Conversation, AI Suspension, Translation, Profile, Knowledge и
   Event Query остаются владельцами своих доменов. Support композирует
   публичные read/command ports, но не копирует их данные и не читает их
   внутренние таблицы.
5. Sensitive projection лениво подгружается и исчезает из DOM/cache/watch при
   revoke либо смене project. Роут-guard не является security boundary.
6. Никаких «временных» production API/DTO или client-side расчёта SLA,
   assignment, search results, QA score и metrics по неполной странице.

## 5. План поставки: блокерами вперёд

### Delivery flow для такого масштаба

Это multi-session cross-system build, а не один frontend issue. По routing
`ask-matt` нельзя переходить из этого аудита прямо в `implement`:

1. unresolved product/contract questions из раздела 8 оформляются как
   `wayfinder`-карта decision tickets с blocking edges;
2. принятые решения схлопываются в одну normative spec и capability matrix W0;
3. фазы F0–F8 и P2 режутся на tracer-bullet tickets, каждый со своим backend
   contract gate, feature flag и release proof;
4. каждый готовый ticket реализуется в свежем контексте через TDD и закрывается
   Standards + Spec review.

Текущие документы 00–09 уже дают основу для normative spec, поэтому новый
discovery нужен только для явно незакрытых решений, а не для повторного
обсуждения всего продукта.

### W0 — контрактный council и baseline (сначала)

**Результат.** Один versioned capability matrix: backend ticket → OpenAPI
operation/fixture → permissions/allowedActions → frontend vertical → feature
flag → owner/release proof. Она должна жить рядом с frontend specs и
обновляться в каждом contract PR.

**Нужно согласовать с backend.**

- Утвердить exact DTO и semantic version для workspace read, durable send,
  read/delivery, presence, attachment, assignment/SLA, queue/search/content.
- Опубликовать snapshot вместо ссылки на backend worktree; проверить, что
  `api:check` обновляет generated client без ручных type assertions.
- Зафиксировать canonical message `ordinal`, immutable `authorSnapshot`, page
  bounds/cursors/checkpoints, command receipts, conflict/lookup endpoints и
  realtime event payloads.
- Зафиксировать source of truth для settings: Case Intelligence detection
  policy не равна Queue/Routing policy, SLA policy, Teams и Macros.

**Exit.** Есть compatibility matrix и fixtures для F0/F1; команда может
реализовать read-only workspace, не изобретая backend semantics.

### F0 — foundation и безопасная миграция chat-кода

**Frontend work.**

- Добавить lazy route shell `/support/inbox` за `support_workspace_shell`;
  запроектировать desktop/tablet/mobile navigation без сжатия четырёх панелей
  в mobile.
- Создать feature boundaries: `support-workspace`, `support-inbox`,
  `support-conversation`, `support-inspector`, `support-realtime`,
  `support-content`, `support-control`.
- Извлечь из `UserWorkspaceDialog` **один deep module Conversation Surface**:
  header/state rail, существующий segmented toggle `Оригинал / Перевод · язык`,
  message history/bubbles, `TranslatedMessageBody`, translation progress,
  realtime reconcile, scroll anchor, drafts и composer orchestration.
  Внутренние части могут быть разбиты на Vue-файлы, но внешний interface и
  реализация поведения остаются одними.
- `UserWorkspaceDialog` и новый `SupportConversationPane` становятся двумя
  adapters одного Conversation Surface seam: первый задаёт profile-scoped
  selection/launcher, второй — route/project inbox selection и Support
  capabilities. Они не получают slots или props для альтернативного message
  renderer, translation control либо composer.
- Не копировать template/CSS/controller из `UserWorkspaceDialog`. Сначала
  перенести существующие characterization tests на interface общего module,
  затем подключить оба adapters, после чего удалить дублирующую реализацию.
- Удалить chat-like `.message-row` renderer и его CSS из
  `EndUserCaseDetail.vue`. Case inspector может показывать metadata/evidence
  links и открывать выбранную Conversation в общем Surface; если на экране
  отображается сама переписка, она отображается только общим module.
- Translation UX является инвариантом общего module: на обеих поверхностях
  один и тот же header toggle `Оригинал / Перевод · <working locale>`, одно
  состояние `messageViewMode` на выбранную Conversation и один
  `TranslatedMessageBody`. `ConversationTranslationBanner` остаётся advanced
  настройкой языка/enablement, но не вторым способом переключения ленты.
- Исправить domain mapper: `ordinal`, author snapshot, delivery and allowed
  actions не теряются; selection/request generation scoped по project.
- Добавить primitives: `SupportStateChip`, `FreshnessLabel`,
  `AllowedActionButton`, `PermissionBoundary`, `CommandOutcome`,
  `PaneLayout` и `InspectorDrawer`.
- Вынести presentation state из PrimeVue Dialog: добавить windowed/full-tab/
  route shells и собственную кнопку `На весь экран / Свернуть`. Full-tab
  занимает точный viewport через `inset: 0` / `100dvh`, не монтирует второй
  Conversation Surface и сохраняет draft, selection, translation mode,
  inspector tab и scroll anchor.
- Убрать конкуренцию PrimeVue `block-scroll` и `workspace-scroll-locked`:
  modal/full-tab overlays получают один reference-counted scroll/focus owner;
  Support route обходится без modal body lock.
- Реализовать FLIP-переход только на `transform/opacity`, reduced-motion
  fallback и geometry/scroll/focus e2e из
  [full-tab discovery](./10-full-tab-workspace-discovery.ru.md).

**Exit.** Новый route и chat пользователя монтируют один Conversation Surface;
DOM/visual/keyboard contract toggle и message feed совпадает. В repository нет
второго full-chat/message-feed renderer; старый chat, перевод и AI Suspension
не регрессируют. Кнопка full-tab не показывает фон CMS, не прокручивает `body`
и не сбрасывает состояние Conversation.

### F1 — project inbox и выбор рабочей единицы

**Frontend work.**

- Подключить опубликованный project Conversations endpoint через repository,
  не напрямую из Vue component; добавить Cases/All Conversations modes.
- Реализовать URL state (view, safe filters, selection), cursor pagination,
  cancellation stale requests, safe inbox rows, selection persistence и
  desktop/tablet/mobile route stack.
- Добавить deep-link входы из `/live`, `/users` и `/cases` в Support.
- После публикации Ticket 11/12 подключить queues, server search и Saved Views;
  браузер передаёт query и отображает authoritative result, но не фильтрует
  локальную страницу.

**Exit.** Оператор находит и читает любой разрешённый Conversation на уровне
project, в том числе не связанный с Case.

### F2 — полноценный Conversation transport

**Frontend work.**

- Заменить timestamp sorting на merge по `id/ordinal`, cursor history,
  first-unread anchor, high-water read ACK и gap/checkpoint reconcile.
- Показать immutable author identity, public/system/internal visibility,
  original/translated body и delivery state отдельно от Message status.
- Добавить durable send with idempotency, accepted receipt, lookup after
  timeout, retry without duplicate и сохранение draft/READY attachments на
  `409`/reconnect/revoke.
- Удалить online-session gate только после backend delivery contract: offline
  End User должен получать accepted `PENDING`, а не client-side error.
- Сохранить текущие fail-closed guarantees translation и AI Suspension;
  public responder/claimant показывать отдельно от assignee.

**Exit.** Перезагрузка, reconnect и offline recipient не теряют draft и не
создают дубликаты; delivery/read сверяемы с backend truth.

### P2 — параллельный Public End User SDK

Это не подзадача CMS-компонента. Для public SDK/widget нужен отдельный owner,
repository/package release и compatibility matrix.

- Отрисовать exact conversation-scoped responder state: `LOLA`,
  `SUPPORT_REQUESTED`, `SUPPORT_LIVE`, `SUPPORT_AWAY`, `LOLA_SUSPENDED`.
- Использовать approved Lola/operator display name и avatar snapshot без
  утечки internal identity; assignment/viewing не трактовать как claimant.
- Реализовать durable read positions и `readBy` (`LOLA`, `HUMAN_SUPPORT`,
  `BOTH`, `NONE`), high-water ACK только после фактического render и retry
  после reconnect.
- Подключить bidirectional typing: человек — scoped TTL, Lola — durable
  AssistantTurn; удалить fake frontend timers.
- Добавить public attachment composer/cards, upload/scan/grants, offline draft
  и mobile/embedded visual matrix.
- Ввести SDK minimum-version gate. Durable delivery/read/attachments нельзя
  массово включать, пока активные клиенты не способны честно показать state.

**Exit.** CMS и поддерживаемая версия SDK одинаково интерпретируют identity,
ordering, delivery/read и attachments; rollback проверен на старом клиенте.

### F3 — Case desk, workforce, classification и SLA

**Frontend work.**

- Собрать inspector tabs: Case, User, Data, Events, Knowledge, Integrations,
  Activity. Профиль/PII и event data запрашивать отдельно по permission.
- Реализовать Case actions через server `allowedActions`: claim/transfer,
  workflow, category/priority, escalation, reason + expectedVersion, clear
  conflict outcome, draft preservation.
- UI использует только code-owned canonical Case statuses; Project настраивает
  taxonomy/category и routing rules, но не добавляет custom workflow states.
  Status, priority, assignment, escalation, availability и SLA всегда
  отображаются как независимые измерения.
- Добавить self availability (`AVAILABLE`, `BUSY`, `AWAY`, `DRAINING`,
  `OFFLINE`), load/capacity, team/skill/language context; не связать их с
  socket state.
- После queue/routing contract показать queue, routing reason snapshot,
  eligibility, offer/reservation/fallback — как investigation facts, не как
  догадку браузера.
- Показать SLA clocks/waiting side/revision/freshness; не вычислять countdown
  из status или client clock как источник истины.

**Настройки.** Разделить `/support/settings` на Case Intelligence (include /
exclude, categories/examples, model/budget/threshold, evaluation),
Teams/skills/capacity, Queues/routing, SLA/calendar. Case Intelligence сразу
использует canonical guided versioned editor с preview/publish/rollback и
audit; старый JSON editor и временный compatibility mode удаляются. Route не
закрывается frontend feature flag или env toggle.

#### F3.1 — создание и редактирование SLA/calendar

**Проверенный current contract.** Generated client уже содержит
`SupportSlaConfiguration_read`, `replaceDraft`, `discardDraft` и `publish` для
`/api/v1/admin/projects/{projectId}/support/sla/settings`. Во frontend пока нет
ни route `/support/settings/sla-calendars`, ни repository/controller/page. GET
возвращает authoritative `rootVersion`, strong `actionEtag`, `rolloutState`
(`DISABLED | SHADOW`), reconciliation checkpoint, опубликованные policy и
calendar revisions. Draft возвращается только пользователю с
`project.support.sla.manage`; пользователь только с
`project.support.sla.read` видит опубликованную configuration без признаков и
содержимого чужого черновика. `project.support.sla.correct` относится к
коррекции clock конкретного Case и не даёт права редактировать settings.

**Guided editor.** Страница состоит из общего status header и двух связанных
секций — «Рабочий календарь» и «Правила SLA». Header явно разделяет:

- Published revision и Draft `generation/version/contentHash`;
- состояние расчёта `DISABLED/SHADOW` и reconciliation checkpoint;
- локальные несохранённые изменения, сохранённый draft и опубликованную
  configuration;
- публикацию configuration и эксплуатационное включение SHADOW. Кнопки
  «Включить SLA» на этой странице нет: settings API не выполняет rollout.

Calendar editor принимает IANA timezone, семь ISO weekdays, до восьми
непересекающихся интервалов на день и date exceptions. UI показывает время как
`HH:mm`, а в DTO переводит его в `startMinute/endMinute`; `24:00` допустимо
только как конец интервала. Ночной интервал разбивается на два дня, пустая
exception означает закрытый день. До отправки UI повторяет bounded validation
(duplicate weekdays/dates, overlap, invalid dates, максимум 730 exceptions),
но backend остаётся источником нормализации, DST/tzdb и ошибок coverage.

Rules editor показывает правила в фактическом first-match порядке и после
drag-and-drop пересобирает непрерывный `order`. Для каждого правила доступны:

- conditions по `priority`, `groupCode` и `caseType`;
- три независимые цели: first human response, next human response и resolution
  в business time (`60..2 592 000` секунд);
- порог `AT_RISK` (`1..90%` оставшегося времени);
- pause statuses отдельно для каждого clock; в V1 только
  `WAITING_END_USER` и `WAITING_SYSTEM`.

Последнее правило — обязательный unconditional fallback. UI создаёт его вместе
с новым локальным draft, не даёт поставить условие или переместить выше, но не
подставляет молча бизнес-цели: пользователь обязан подтвердить timezone,
расписание и три target. Пустой draft можно держать только локально; backend
принимает исключительно полную валидную пару `policy + calendar`.

**Lifecycle и concurrency.** Один controller реализует следующий автомат:

1. `GET` загружает Published, доступный Draft и свежий `actionEtag`. Если draft
   отсутствует, «Создать черновик» копирует Published; при первой настройке
   открывает обязательный guided form без выдуманных SLA-обязательств.
2. Изменения живут локально и не называются «черновиком на сервере» до
   успешного `PUT .../draft`. Save отправляет полную configuration с новым
   `Idempotency-Key` и последним `If-Match`.
3. После mutation frontend принимает новый `actionEtag/rootVersion`, затем
   делает GET reconcile: mutation receipt содержит identity draft/revisions,
   но не обязан возвращать нормализованную configuration.
4. «Отменить изменения» сбрасывает только local dirty state. «Удалить
   черновик» вызывает `POST .../draft/discard` с отдельным idempotency key и
   свежим ETag; действие подтверждается, потому что восстановить draft через
   текущий API нельзя.
5. «Опубликовать» доступно только для сохранённого draft и вызывает
   `POST .../publish` с `{}`, новым key и свежим ETag. Успех создаёт immutable
   policy/calendar revisions и удаляет draft, но не обещает включение SLA.
6. При `409 SLA_DRAFT_VERSION_CONFLICT`/`SLA_CONCURRENT_UPDATE` UI сохраняет
   локальную форму, повторно читает server state и предлагает сравнить либо
   вручную перенести изменения. Таймаут не повторяется с новым key: сначала
   выполняется GET reconcile; если результат не доказан, повторяется ровно та
   же mutation с теми же body, `Idempotency-Key` и `If-Match`, чтобы backend
   вернул сохранённый receipt, а не создал новый intent.
   `SLA_DRAFT_NOT_FOUND`, `SLA_CONFIGURATION_DUPLICATE` и
   `SLA_CONFIGURATION_NOT_PUBLISHED` имеют отдельные outcomes, а не общий
   toast «не удалось».

**Backend gaps для полного target UX.** Текущий contract достаточен для
создания, редактирования, discard и publish, но не закрывает обещанную в
общем settings pattern функциональность:

- нет side-effect-free validate/preview/impact endpoint: `PUT draft` уже
  изменяет server state;
- нет списка revisions, version diff, publish reason, audit projection и
  rollback command, хотя published revisions внутри backend immutable;
- нет authoring catalog с допустимыми `groupCode` и человекочитаемыми labels;
  строковый input не является приемлемой заменой picker-а;
- settings API не включает/выключает SHADOW и не сообщает operational
  readiness для такого действия. Rollout остаётся отдельным runbook/cutover.

До появления этих contracts V1 показывает локальное review summary и
server-validated сохранённый draft, но не называет его «impact preview», не
рисует фиктивную историю и не предлагает включить SLA.

**Acceptance.** Покрыть first create, edit from Published, edit existing Draft,
discard, publish, read-only mode, permission revoke/project switch, stale ETag,
timeout after accepted mutation, duplicate publish, invalid timezone/DST,
overnight split, fallback-last и calendar coverage. E2E проверяет, что
публикация не меняет `rolloutState`, а UI нигде не рассчитывает Case countdown
из policy и browser clock.

**Exit.** Оператор отрабатывает Case lifecycle и понимает ответственность,
ожидание, SLA и классификацию, не переходя в старые страницы.

Case Intelligence settings не входят в exit F3: старый JSON editor остаётся
compatibility route, а полноценные Detection/Escalation/Safety policies,
evaluation и rollout выполняются отдельной F8 по
[спецификации](./16-case-intelligence-detection-escalation.ru.md).

### F4 — совместная работа и вложения

**Frontend work.**

- Подключить scoped watch lifecycle, viewers/typing TTL + generation, warning
  о параллельной работе и authoritative refresh after collision. Hints никогда
  не меняют assignment/availability и не содержат draft.
- Добавить attachment tray, type/size capability, scan states, retry,
  attachment-only message, grants/download/revoke/tombstone и separate
  PUBLIC/INTERNAL_NOTE scope.
- Показать policy-driven retention/legal hold state только разрешённым ролям;
  проверить propagation tombstone/purge в message history, download grants,
  search, export и восстановленных backup projections.

**Exit.** Два оператора не перетирают работу незаметно; upload и visibility
безопасны при reconnect/revoke.

### F5 — internal collaboration и content

**Frontend work.**

- Явный composer mode: «публичный ответ»/«внутренняя заметка», разный visual,
  label, keyboard semantics, draft key и permission. Note физически не может
  попасть в public send path.
- Подключить Macro catalog/search/preview/variable validation. Macro вставляет
  редактируемый draft, а отправленное сообщение сохраняет macro revision and
  provenance.
- В inspector встроить Support Internal Knowledge search/open/link/quote,
  включая file preview. Это новый `project.support.knowledge.*` boundary, а
  не существующий AI knowledge.
- Реализовать route-level content settings: macro draft/publish/archive,
  categories, permissions and retention only as supplied by backend.

#### F5.1 — один Macro, несколько языков и AI translation

**Проверенный current contract.** `SupportMacroSettingsPage.vue` уже реализует
catalog, create/replace draft, preview, publish, archive, revisions и rollback.
Но `SupportMacroDraftDto` и каждая compiled revision содержат скалярные
`locale`, `title`, `body`, `shortcuts` и fallback переменных. Поэтому текущий
backend способен хранить только один язык в одной stable Macro identity.
Заводить одну и ту же фразу десять раз как десять независимых Macro нельзя:
разойдутся `stableCode`, visibility, variables, revisions, archive/rollback и
usage provenance.

**Domain decision.** Один Support Macro остаётся stable Project-owned identity
и в каждом draft/published revision владеет набором **Macro Locale Variant**.
Общими для всех языков остаются `stableCode`, lifecycle, visibility,
`teamIds/topicCodes` и schema переменных (`name/required`). В locale variant
входят `title`, `body`, `shortcuts` и literal fallback необязательных
переменных: это видимый пользователю текст, поэтому scalar fallback нельзя
безопасно подставлять во все языки.

Набор locale берётся из published Project Locale catalog, а не из frontend
allowlist и не из ручного `InputText`. Project default locale — обязательный
runtime fallback. V1 Macro имеет policy `ALL_PROJECT_LOCALES`: incomplete draft
можно сохранить, но publish требует непустые `title/body` и, если literal
fallback задан, его варианты для всех текущих project locale. Если позже нужен
шаблон только для части аудиторий, это вводится явной content-locale policy, а
не дубликатами Macro.
Добавленный после публикации язык не ломает старую revision: runtime временно
использует default fallback, а следующий publish требует заполнить новый
variant. Удалённый locale остаётся в immutable старых revisions и показывается
как archived variant при редактировании.

**Frontend UX.** В editor удаляется свободное поле «Язык». Вместо него:

- основной locale editor показывает сразу `title + body`; selector позволяет
  просмотреть любой variant, а default отмечен явно;
- «Переводы N/M» открывает компактную панель языков со статусами `не заполнен`,
  `сгенерирован · не сохранён`, `изменён вручную`, `ошибка`, `устарел источник`
  и `конфликт`;
- основная кнопка «Перевести» batch-переводит `title/body` и literal variable
  fallbacks только в незаполненные project locale; меню даёт «Выбрать языки»
  и явное «Перевести заново» с подтверждением перезаписи;
- locale-specific shortcuts остаются редактируемыми вручную. AI не переводит
  их автоматически, пока не определена семантика поисковых aliases;
- preview переключается по locale и показывает exact/fallback resolution,
  coverage issues и одинаковый набор placeholders во всех вариантах;
- AI result только заполняет local dirty form. Он не вызывает Macro save или
  publish; после генерации человек может исправить текст и проходит обычные
  Preview → Save draft → Publish.

UI и controller переиспользуют interaction contract
`LocalizedField.vue`/`translation-job-controller.ts`: async progress, batch
units, polling, cancel, retry отдельных targets, session restore и защита от
`STALE_SOURCE/TARGET_CONFLICT`. Для одного Macro job units имеют стабильные
keys (`title`, `body`, `variables.<name>.fallback`). Macro adapter сначала
проверяет snapshots всех units одного target locale и только затем применяет
группу: частичное смешивание нового title со старым body запрещено.
Статический текст и opaque placeholders отправляются только через backend;
браузер не получает provider key и не отправляет runtime values/PII.

**Backend blocker — приём и публикация Macro с переводами.** Frontend нельзя
переключать на этот UX, пока pinned OpenAPI не закроет весь vertical:

1. Create/replace/preview/read/revision DTO принимают dynamic BCP 47 map
   `locale -> Macro Locale Variant` в одной Macro identity и возвращают
   `defaultLocale`, locale coverage и compiled content hash. Старые scalar
   Macro мигрируются в single-variant map без смены stable ID.
2. Backend валидирует locale относительно Project catalog, размер каждого
   variant, уникальность shortcuts, обязательный default/all-project coverage
   на publish и одинаковую placeholder/variable schema. Draft разрешён
   incomplete; published revision компилируется атомарно целиком.
3. Publish, revision history и rollback работают со всем набором variants, а
   не с одним языком. Нельзя получить published state, где title уже новый, а
   body/другой locale остался от иной revision.
4. Catalog/apply contract принимает requested working/recipient locale и
   возвращает выбранный variant, `resolvedLocale`, `fallbackUsed` и pinned
   Macro revision. Отправленное сообщение хранит эту provenance; browser не
   выбирает fallback молча.
5. Macro authoring projection возвращает Project locales, default locale,
   translation capability и поддержанные provider targets. Страница не
   должна зависеть от scenario-specific catalog или AI Allowance admin UI.
6. Существующий `/translation-jobs` переиспользуется как provider-neutral
   async helper, но backend фиксирует surface `SUPPORT_MACRO_AUTHORING`,
   защищает Macro placeholders, считает quota/cost/audit и сохраняет только
   job/provenance — не Macro content. Нужна явная permission composition:
   Macro edit требует `project.support.macros.manage`, AI-кнопка дополнительно
   требует `project.translation.create/read`, а cancel —
   `project.translation.cancel`; без них ручной многоязычный editor продолжает
   работать.
7. Translation response остаётся suggestion, привязанной к source hash. При
   смене source или непустого target frontend получает/вычисляет conflict и не
   перезаписывает текст без подтверждения. Partial provider failure не
   отменяет успешные target suggestions и никогда не публикует их.

**Acceptance.** Один Macro создаётся на всех языках проекта, сохраняется
incomplete, batch-переводится, редактируется вручную, preview-ится и
публикуется одной revision. Проверить missing default/target, placeholder
loss, filled-target confirmation, partial failure/retry/cancel, stale source,
permission revoke, новый/удалённый Project locale, exact locale и default
fallback при применении, rollback всей multilingual revision и отсутствие
десяти дублей в catalog.

**Exit.** Оператор готовит публичный ответ, note, macro и internal article в
одном месте; внутренние данные не раскрываются End User или AI knowledge.

### F6 — lead control, notifications, external work

**Frontend work.**

- `/support/control`: freshness-labelled KPI, action tables, exact drill-down,
  causal timeline, alert owner/acknowledge/close, versioned override reason.
- Control и Case Activity показывают server-owned `Support Activity` с actor,
  command, reason, revision/correlation/outcome. Projection states
  `BUILDING/READY/STALE/DEGRADED` видимы; shadow SLA нельзя подписывать как
  contractual, а realtime invalidation нельзя выдавать за факт действия.
- Подключить browser notification preferences/subscription only after Ticket
  20 contract; notification deep-links to exact permitted view/Case and does
  not contain sensitive contents.
- В Case inspector добавить integration panel and external-work states after
  the separate JSM/HelpDesk adapter contract. Do not couple core inbox to a
  vendor or cut over LiveChat before adapter recovery proof.
- Notification settings разделяют backend preference, browser permission и
  registered device. `Assigned to me` по умолчанию включено, `Attention` —
  выключено; denied permission не маскируется включённым toggle. Deep link
  проходит login/project restoration, push body остаётся generic.
- После backend 35 Lead-managed New Case policy отдельно задаёт
  OFF/immediate/digest, CREATE/REOPEN scope и effective window. Project enable
  не включает чужие devices/preferences; New Case и Attention deliveries не
  склеиваются.
- Settings → Integrations покрывает OAuth/site selection, connection health,
  test connection/last sync, explicit multi-site choice, mapping
  draft/preview/publish/rollback и compatibility inbox. Отдельный
  `/support/external-work` даёт master/detail recovery, а Case inspector —
  Case-scoped create-options, safe-context confirmation, link/create/comment
  timeline, internal/public permission separation и explicit `UNKNOWN`
  outcome recovery. HTTP `202` остаётся pending до remote confirmation.

**Exit.** Lead идёт от риска к конкретному Case и audited action; external
systems остаются adapter boundary.

### F7 — QA, аналитика и cutover

**Frontend work.**

- Только после отдельных IAM/OpenAPI contracts добавить `/support/quality`:
  queue, immutable Conversation snapshot, versioned server-driven scorecard,
  evidence by IDs, review/dispute/calibration.
- Только после metrics API добавить `/support/analytics`: metric definition,
  timezone/cohort/freshness, protected drill-down, server-side export/share.
  Не строить employee score или исторические метрики из raw Messages.
- До cutover согласовать import/reconciliation исторических Conversation/Case,
  CSAT и metric coverage: какие периоды сопоставимы, где incomplete coverage,
  как обозначаются legacy gaps и как доказывается повторяемость import.
- Провести pilot: read-only dogfood → one-project write pilot → per-vertical
  flags → conversion of legacy entry points to deep links → removal of old
  dialog CHAT orchestration after adoption and rollback window.

**Exit.** Ежедневный операторский flow выполняется в Support; старый dialog
остаётся только launcher-ом или удалён после measured adoption.

### F8 — Case Intelligence Detection, Escalation и evaluation

**Backend handoff.** Closed versioned DTO и commands для Detection Policy,
Escalation Policy, platform-owned Safety Policy overlay, approved model/budget,
dry-run, datasets, shadow comparison, decision log, metrics и rollout. Каждая
decision закрепляет policy/model/compiler revisions, reason/evidence и cost.

**Frontend work.** Guided settings IA, rule/category editors, stateful
escalation scenarios, safety routing overlay, test console, evaluation,
versions/audit, decision log и Case-scoped explain. Ordinary Case и committed
Human Escalation визуально и операционно разделены.

**Exit.** Project может дёшево и проверяемо отличать casual общение от
продуктового обращения, управлять условиями handoff и измерять качество,
стоимость и последствия до publish. Safety floor не отключается Project
budget/pause; browser не исполняет policy и не считает метрики локально.

## 6. Очередность backend handoff

```text
Workspace read + message identity ─┬─> F0/F1 read-only inbox
Durable delivery + read state ─────┴─> F2 ─> P2 SDK version gate
Teams/availability + assignment + SLA ─> F3
SLA preview/history/rollback/rollout ───> F3 full target UX
Queues/search/routing/reservations ──────> F1/F3
Attachments + presence ──────────────────> F4
Localized Macro DTO/runtime + translation capability ─> F5
Notes + Internal Knowledge ──────────────> F5
Lead control/alerts/notifications ───────> F6
External-work adapter contracts ─────────> F6
QA/analytics contracts ──────────────────> F7
Case Intelligence policies/runtime/evals ─> F8
```

Ticket 12 (search/saved views) может идти параллельно routing после Queue
identity; macros/notes и knowledge не ждут QA/analytics. Автоназначение нельзя
считать готовым, пока не прошли reservation/expiry/chaos gates Ticket 14.

## 7. План проверки и release gates

Для каждой vertical обязательны unit (pure state), repository contract,
component/integration и browser E2E. Минимальная race/security матрица:

- socket message раньше HTTP receipt; duplicate merge по identity;
- stale selection response, reconnect gap и project switch;
- assignment changed while drafting; `409`, timeout/unknown outcome and retry;
- translation preview invalidated source; AI handoff and claimant change;
- permission revoke during inspector/note/attachment operation;
- internal note or attachment never visible in public projection;
- mobile Back сохраняет draft; keyboard-only path, axe and visual matrix at
  1440×1000, 1024×768, 390×844.
- один contract suite Conversation Surface запускается для profile adapter и
  Support adapter; оба обязаны пройти одинаковые сценарии translation toggle,
  original/translated messages, bulk progress, reply preview, reconnect и
  draft recovery. Запрещён отдельный Support-only snapshot message renderer.

Общие gates перед LiveChat cutover: all flags reversible, no known
duplicate/lost-draft/PII leak, delivery/read reconciled with backend,
operator task-completion demonstrated, P95 selection/send feedback within
approved budget and rollback exercised on pilot project.

## 8. То, что нельзя отложить в дизайне

1. Кто владеет опубликованной Case Intelligence policy и какие UX сценарии
   нужны для shadow evaluation, ручной correction и rollout gate.
2. Exact boundary между public AI Knowledge и Support Internal Knowledge:
   раздельные corpus, permissions, upload/search/retrieval logs and retention.
3. Полный published contract external-work adapter (JSM/HelpDesk) до добавления
   «внешнего тикета» в Case panel.
4. QA scorecard and analytics metric contracts до любого UI, который выглядит
   как оценка оператора.
5. Операционный ownership contract: какие flags, SLO, on-call/runbook and
   migration evidence требуются для отключения LiveChat.
6. Avatar storage/approval, public attachment limits, retention/legal hold,
   `readBy` semantics и human responder states для End User SDK.
7. Зафиксировать, что V1 не обещает voice/telephony/social omnichannel parity:
   UI показывает только опубликованные channel capabilities и не рисует
   недоступные действия.
8. Локализованный Support Macro — одна stable identity с locale variants, а не
   набор независимых шаблонов. До изменения backend DTO/runtime frontend не
   показывает AI-перевод, который невозможно сохранить и применить целиком.

## 9. Источники

- [Целевая frontend-спецификация](./00-master.ru.md) и её документы 01–07.
- [Master backend Support Platform](../../../../Lola_backend/docs/specs/support-platform/00-master.ru.md), Tickets 03–16 и 20.
- [Аудит backend current state](../../../../Lola_backend/docs/research/support-platform-current-state-audit.ru.md).
- [Проверка SLA semantics, API и rollout](../../../../Lola_backend/docs/research/support-sla-primary-sources-2026-08-08.ru.md).
- [Backend SLA settings controller](../../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.controller.ts)
  и [DTO](../../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.dto.ts).
- [Архитектура multilingual content и AI suggestions](../../../../Lola_backend/docs/multilingual-content-architecture.ru.md).
- [Текущие backend Macro DTO](../../../../Lola_backend/src/modules/support-operations/api/support-macro.dto.ts)
  и [controller](../../../../Lola_backend/src/modules/support-operations/api/support-macro.controller.ts).
- [Текущий Macro editor](../../../src/pages/SupportMacroSettingsPage.vue) и
  переиспользуемый [LocalizedField](../../../src/features/scenario-localization/ui/LocalizedField.vue).
- [Первичные UX-источники и их применимость](../../research/support-platform-operator-workspace-primary-sources-2026-08-07.ru.md) — дополняется отдельным исследовательским проходом.
- [UI/UX remediation и visual acceptance](./09-ui-ux-remediation.ru.md).
- [Full-tab workspace discovery](./10-full-tab-workspace-discovery.ru.md).
- [Browser-platform research full-tab режима](../../research/support-fullscreen-workspace-browser-platform-discovery-2026-08-07.ru.md).
- [Предоставленное продуктовое описание](../../../../../.codex/attachments/48eb194a-6ff1-4449-81eb-faae2c88d42d/pasted-text.txt).
