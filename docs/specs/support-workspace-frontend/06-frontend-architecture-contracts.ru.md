# Support Workspace: frontend-архитектура и контракты

## 1. Текущее состояние

Аудит `Lola_front` показывает:

- `LivePage.vue` — монитор online sessions, а не support inbox;
- `UserWorkspaceDialog.vue` — монолит около 4500 строк с режимами Profile/Chat;
- `use-admin-conversation-console.ts` — около 800 строк orchestration для одной
  End User workspace;
- translation и AI Suspension уже оформлены отдельными feature verticals;
- Cases, profile, memory, AI review и operational state уже имеют repositories;
- project-wide endpoint списка Conversations сгенерирован, но UI его не
  использует;
- текущий reply требует online Interaction Session, поэтому не является durable
  offline support send;
- mapper сообщения теряет `ordinal` и `author`, хотя generated DTO их содержит;
- доменная модель пока не содержит read/delivery/attachments;
- permission catalog hardcoded и не включает `project.support.*`.

Вывод: нужна постепенная декомпозиция вокруг нового route shell. Переписывать
всё одним feature branch нельзя.

## 2. Целевая структура модулей

```text
src/
├── pages/
│   ├── SupportInboxPage.vue
│   ├── SupportControlPage.vue
│   ├── SupportQualityPage.vue
│   └── SupportAnalyticsPage.vue
├── features/
│   ├── support-workspace/       # route composition, selection, layout
│   │   └── presentation/        # windowed/full-tab/route shells, motion, scroll lock
│   ├── support-inbox/           # queries, rows, views, filters, table
│   ├── conversation-surface/    # shared Users/Support history, translation, composer
│   ├── support-conversation/    # Support adapter/capabilities, без своего renderer
│   ├── support-inspector/       # lazy context tabs
│   ├── support-assignment/      # claim/transfer/offers
│   ├── support-availability/    # operator state/capacity
│   ├── support-content/         # notes/macros/knowledge composition
│   ├── support-lead-control/
│   ├── support-quality/
│   └── support-analytics/
├── shared/
│   ├── api/generated/
│   ├── api/repository/
│   └── types/
```

Глубокие модули предоставляют небольшой public API. Компоненты не вызывают
generated client напрямую.

Нормативные call sites после extraction:

```text
src/features/conversation-surface/ui/ConversationSurface.vue
  ↑ единственный public root chat component
  ├─ UserWorkspaceDialog.vue       # profile/legacy adapter
  └─ SupportConversationPane.vue   # route Support adapter
```

Внутри `conversation-surface` допустимы private subcomponents для header,
message bubble, translation toggle и composer. Call sites импортируют только
`ConversationSurface.vue` и не собирают свою ленту из этих внутренних частей.

### Границы ответственности

| Модуль                 | Владеет                                              | Не владеет                    |
| ---------------------- | ---------------------------------------------------- | ----------------------------- |
| `support-workspace`    | route selection, pane layout, cross-feature commands | Message merge, profile fields |
| `workspace/presentation` | windowed/full-tab/route mode, geometry, motion, root scroll/focus lifecycle | Conversation/Case domain state |
| `support-inbox`        | query/view/cursor, row revisions, selection IDs      | Полные message bodies         |
| `conversation-surface` | единый message renderer, translation toggle, history, draft/composer | Route layout, assignment policy |
| `support-conversation` | Support selection adapter, read/delivery/note capabilities | Message template/CSS, translation UI |
| `support-inspector`    | tab lifecycle и projection composition               | Canonical chat state          |
| `support-assignment`   | assignment/offers/conflicts                          | Presence                      |
| `support-availability` | self/override status, capacity                       | Browser/socket status         |
| translation            | existing preview/persisted translation state         | Conversation ownership        |
| AI Suspension          | existing suspend/resume state                        | Assignment                    |

## 3. State model

Pinia state нормализован по project и ID:

```ts
type SupportWorkspaceState = {
  projectId: string | null;
  view: ViewQueryState;
  inboxOrder: string[];
  inboxById: Record<string, InboxRow>;
  selection: SelectionRef | null;
  workspaceBySelection: Record<string, WorkspaceProjection>;
  requestGeneration: Record<string, number>;
};

type ConversationState = {
  messagesById: Record<string, SupportMessage>;
  messageIdsByConversation: Record<string, string[]>; // sorted by ordinal
  pagesByConversation: Record<string, PageState>;
  draftsByKey: Record<string, DraftState>;
  readByConversation: Record<string, ReadState>;
  deliveryByMessage: Record<string, DeliveryProjection>;
};
```

Нельзя хранить один `currentUser/currentConversation` без project scope. Любой
async response проходит generation + target check перед commit. Project switch
обнуляет старый scope атомарно.

### Merge messages

1. Validate conversation/project.
2. Upsert по `messageId`.
3. Проверить согласованность `ordinal` и immutable author snapshot.
4. Пересобрать order по ordinal.
5. Найденный gap/revision mismatch пометить для REST reconcile.
6. Не понижать durable delivery/read state из stale event.

`createdAt + id` допустимы только как временный fallback до contract freeze и
должны быть удалены в первой миграции.

## 4. Repository layer

Каждая feature зависит от interface, а HTTP mapper переводит DTO в domain.

```ts
interface SupportWorkspaceRepository {
  readInbox(query: InboxQuery, signal?: AbortSignal): Promise<InboxPage>;
  readSelection(ref: SelectionRef, signal?: AbortSignal): Promise<Workspace>;
  readMessages(
    query: MessageHistoryQuery,
    signal?: AbortSignal,
  ): Promise<MessagePage>;
  execute(command: SupportCommand): Promise<CommandReceipt>;
  lookupAttempt(idempotencyKey: string): Promise<CommandReceipt | null>;
}
```

Долгосрочно предпочтителен единый versioned support read/execute interface:

- read modes: Case/Conversation inbox, workspace, history, lead control,
  investigation, content, activity, capabilities;
- execute intents: send/retry, note, assignment, availability, SLA correction,
  macro/content, alert, lead action;
- changes stream: только bounded invalidation/revision/attention hints.

До его публикации adapters могут собирать projection из текущих endpoints, но
не выдумывать missing delivery/read/assignment truth.

## 5. REST и realtime

REST является authority. Realtime event содержит минимум:

```ts
type SupportChangeHint = {
  projectId: string;
  family: string;
  targetType: "CASE" | "CONVERSATION" | "MESSAGE" | "OPERATOR" | "ALERT";
  targetId: string;
  revision: string;
  checkpoint?: string;
  attention?: string[];
};
```

Он не должен содержать profile PII, internal note body, full message body,
signed URL или permission-sensitive diagnostics.

### Reconcile policy

- selected Conversation: немедленный bounded reconcile;
- visible inbox page: coalesced page/row reconcile;
- invisible item: revision invalidation;
- sequence gap/checkpoint mismatch: snapshot refresh;
- reconnect: renew session → permissions → watches → selected workspace → inbox;
- permission revoke: stop watch и purge sensitive state до повторного render.

Клиент ограничивает concurrent refetch, coalesces hints и применяет jittered
backoff. Realtime никогда не выполняет command повторно.

## 6. Command envelope и ошибки

Каждая изменяющая команда содержит:

```ts
type CommandMeta = {
  projectId: string;
  target: { type: string; id: string };
  idempotencyKey: string;
  expectedVersion?: string;
  reasonCode?: string;
  clientAttemptId: string;
};
```

Единая обработка:

| Ошибка        | Frontend behavior                                          |
| ------------- | ---------------------------------------------------------- |
| `400/422`     | Field/command validation, draft сохранён                   |
| `401`         | Session recovery один раз, затем login                     |
| `403`         | Purge target-sensitive state, refresh permissions          |
| `404`         | Reconcile selection; не раскрывать existence               |
| `409`         | Refresh projection/allowed actions, показать changed state |
| `410`         | Expired offer/grant/content; получить новый state          |
| `429`         | Respect retry hint, не спамить command                     |
| `5xx/network` | Unknown outcome lookup перед Retry                         |

Toast не является единственным местом ошибки. Ошибка остаётся рядом с action или
Message, пока пользователь не увидит результат.

## 7. Capabilities и contracts

Workspace projection должна возвращать `capabilities/allowedActions` на нужной
гранулярности:

- surface capabilities для route/tabs;
- row actions для Case/Conversation;
- composer actions;
- message actions;
- profile/content/attachment actions;
- command preconditions/revisions.

Frontend session permissions определяют, что потенциально доступно; projection
allowed actions — что допустимо для текущего target/state. Оба условия нужны.

### Read limits

Документированный workspace contract ограничивает inbox до 100 строк, history до
100 Messages на page и related Cases до 20. UI обязан использовать cursor и не
предполагать полный набор.

## 8. Contract readiness

| Возможность                    | Состояние во frontend сейчас           | Решение                                |
| ------------------------------ | -------------------------------------- | -------------------------------------- |
| Per-user Conversations/history | Работает                               | Перенести repository/use-case          |
| Reply                          | Работает только с online session       | Не называть durable support send       |
| Translation                    | Реализована                            | Переиспользовать без переписи          |
| AI Suspension                  | Реализована                            | Скомпоновать с assignment/claimant     |
| Cases/profile                  | Реализованы                            | Переиспользовать projection/repository |
| Selected realtime reconcile    | Есть                                   | Расширить hint/revision model          |
| Project Conversation inbox     | Generated endpoint есть, UI нет        | Подключить после contract review       |
| Ordinal/author snapshot        | DTO есть, mapper теряет                | Исправить в Foundation                 |
| Unified workspace              | Описан backend docs, не pinned OpenAPI | Ждать contract publication             |
| Assignment/availability/SLA    | Backend docs/частичная реализация      | Только после OpenAPI handoff           |
| Lead control/alerts/content    | Описаны backend tickets                | Только после OpenAPI handoff           |
| Read/unread/delivery           | Не доступны текущему frontend contract | Новая vertical                         |
| Typing/viewers                 | Нет durable contract                   | Новая vertical                         |
| Attachments                    | Нет frontend contract                  | Новая vertical                         |
| QA/analytics                   | Нет контрактов                         | Не вычислять на клиенте                |

Backend worktree на момент аудита имеет незавершённые merge/rebase конфликты.
Наличие файла или теста там не является стабильным handoff. Источник для
реализации — merged commit + pinned OpenAPI + fixtures.

## 9. Миграция текущего кода

### Перенести без изменения поведения

- translation repositories/use cases/components;
- AI Suspension commands/banner/history;
- Case, profile, memory и AI review repositories;
- per-conversation draft semantics;
- request-generation guards;
- selected Conversation realtime reconciliation;
- общие message/content formatters после расширения domain.

### Извлечь из `UserWorkspaceDialog.vue`

1. route-independent End User header;
2. conversation list/item;
3. единый `ConversationSurface`: state rail, toggle `Оригинал / Перевод`,
   message log/`TranslatedMessageBody`, translation progress и scroll anchor;
4. общий composer orchestration, reply translation и scoped drafts;
5. profile inspector sections;
6. auxiliary panels/drawers;
7. status/error primitives.

Извлечение выполняется небольшими PR с characterization tests. Новый workspace
и старый dialog становятся adapters одного deep module. Его interface принимает
selection/context, permissions и typed capabilities, но не slots/props для
другого message renderer, translation toggle или composer. Поведение
проверяется одним shared suite через оба adapters.

### Заменить PrimeVue maximize отдельным shell

`UserWorkspaceDialog` не владеет полноэкранной геометрией. Кнопка
`На весь экран / Свернуть` работает через presentation controller и переносит
тот же Conversation Surface между `WindowedWorkspaceShell` и
`FullViewportWorkspaceShell`. Mode switch не создаёт вторую копию ленты и не
перезапрашивает Conversation.

Full-tab shell использует `position: fixed; inset: 0; height: 100dvh`, нулевые
margin/border/radius и отдельные scroll owners. Route shell использует ту же
композицию без modal semantics. Root scroll lock имеет одного
reference-counted владельца; комбинация PrimeVue `block-scroll` и отдельного
body class запрещена. Полный контракт и migration path:
[10-full-tab-workspace-discovery.ru.md](./10-full-tab-workspace-discovery.ru.md).

### Удалить после cutover

- CHAT mode монолита;
- `.message-row` chat-like renderer и CSS из `EndUserCaseDetail.vue`; Case
  evidence остаётся metadata/link, а Conversation открывается в общем Surface;
- online-session gate для support durable reply;
- сортировку message по `createdAt + id`;
- fake «Support API не подключён» ticket form;
- role-name или неполные hardcoded permission assumptions;
- client-derived policy language.

Deletion gate: в production source остаётся ровно одна реализация Conversation
message feed, translation toggle и composer frame. Поиск второго renderer либо
копии их CSS блокирует cutover.

## 10. UI primitives

Нужны общие компоненты:

- `SupportStateChip` с label/description, не color-only;
- `FreshnessLabel`;
- `AllowedActionButton` с disabled reason;
- `SensitiveField` с access/availability/provenance;
- `CommandOutcome`;
- `MessageAuthor`/`MessageDeliveryState`;
- `PermissionBoundary` для mount/purge semantics;
- `PaneLayout` и route-aware `InspectorDrawer`;
- `EmptyState`, `StaleState`, `ReconcileState`.

Компоненты не знают backend role names и не принимают raw DTO.

## 11. Feature flags и observability

Project flags:

- `support_workspace_shell`;
- `support_project_inbox`;
- `support_durable_delivery`;
- `support_attachments`;
- `support_lead_control`;
- `support_quality`;
- `support_analytics`.

Flag не заменяет permission. Telemetry измеряет load/reconcile duration,
command category/outcome, duplicate prevention, draft recovery, unread accuracy,
render errors и coarse UX performance без содержимого Messages/PII.

## 12. Архитектурные acceptance criteria

- generated API вызывается только через repositories/adapters;
- domain Message сохраняет ordinal и immutable author snapshot;
- selection response старого target не коммитится после переключения;
- REST projection побеждает realtime hint;
- project switch очищает scoped state/watches;
- UI не создаёт delivery/read/assignment/metric truth локально;
- старый dialog и новый route временно используют одни feature modules;
- full-tab toggle сохраняет selection, draft, translation mode, message anchor
  и focus; DOM не содержит вторую доступную копию Conversation Surface;
- full-tab geometry совпадает с viewport вкладки и не создаёт document scroll
  или horizontal overflow;
- отсутствующий backend contract виден в readiness table, а не подменён mock;
- code splitting не загружает QA/analytics/inspector sensitive modules без route.
