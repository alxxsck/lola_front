# Support Workspace: UI/UX-план устранения текущих проблем

Статус: planning / visual acceptance baseline
Дата: 7 августа 2026 года
Область: операторское рабочее место, Lead Control, Support Settings и
адаптивные состояния `Lola_front`

## 1. Решение

Support должен получить собственный полноэкранный **focus mode**, а не ещё одну
широкую CMS-страницу внутри существующего layout. В операторском режиме вся
высота viewport отдана очереди, переписке и inspector; прокрутка происходит
внутри панелей, а не у `body`.

Визуальная задача — не скопировать Zendesk или Intercom. Нужно перенять их
проверенную пространственную модель: постоянный список работы, непрерывная
переписка, контекст рядом с ней и действия без ухода со страницы. Цвета,
типографика и компоненты остаются Lola.

```text
┌────────┬──────────────┬────────────────┬──────────────────────┬────────────────┐
│ app    │ Support nav  │ inbox          │ Conversation         │ inspector      │
│ rail   │ views/counts │ cases/chats    │ header/messages/send │ case/user/...  │
│ 64     │ 208          │ 336            │ flex, min 600        │ 392            │
└────────┴──────────────┴────────────────┴──────────────────────┴────────────────┘
```

На меньшей ширине сначала сворачивается Support navigation, затем inspector
переходит в drawer. На телефоне это не сжатые пять колонок, а маршрутный стек:
`Views → Inbox → Conversation → Inspector`.

## 2. Что проверено в текущем интерфейсе

Проверка проведена в реально запущенном mock CMS на `1440×1000` и `390×844`,
в тёмной и светлой темах.

### `/cases`

- Верх первого экрана занимают eyebrow, крупный заголовок, пояснение, кнопки и
  пять KPI-карточек. Это структура dashboard, а не операторского inbox.
- Основной контейнер начинается после служебного блока и оформлен как одна
  плавающая карточка с `border-radius: 20px`. Внутри неё список шириной около
  `435px` и длинный detail panel. Пространство расходуется на оболочки, а не на
  сообщения и контекст.
- После выбора Case справа открывается длинная анкета: summary, escalation,
  overview, verification, actions и linked messages. Переписка не является
  центром рабочего процесса.
- Без выбора справа остаётся большая пустая область. Нет полезного empty state:
  быстрых клавиш, состояния очереди или следующего действия.
- `body` продолжает прокручиваться. При возврате/переходе браузер может
  сохранить позицию, поэтому header визуально обрезается. Для рабочего места
  нужен `height: 100dvh; overflow: hidden` и независимый scroll каждой панели.
- На `390×844` весь первый viewport занимают заголовок, действия, пять KPI,
  tabs и filters; ни одного Case не видно. Это блокирующий mobile UX defect.

### `/users/:id?conversationId=...`

- Chat открывается полноэкранной модалкой поверх Users. URL и backdrop сообщают
  пользователю, что он всё ещё в профиле, а не в Support.
- В переписке много свободной вертикали, но рядом нет inbox и inspector. Чтобы
  проверить Case, SLA, events или внутренний материал, приходится покидать чат.
- Автор поддержки отображается как generic `Operator`: нет согласованного
  display name/avatar snapshot и понятного различия Lola / человек.
- Нет first-unread, delivery/read status, public/internal-note mode,
  attachments, macro search, Internal Knowledge и конфликта параллельной работы.
- Mobile message view уже можно использовать как материал для выделения
  компонентов, но modal/backdrop и обрезанные secondary controls нельзя нести
  в целевой route stack.

### `/cases/settings`

- Единственная поверхность — versioned JSON policy для category/priority и
  четыре AI cost stats. Raw JSON годится как аварийный compatibility tool, но
  не как основной UI администратора.
- Нет отдельных разделов Detection, Categories, Teams, Queues, Routing, SLA,
  Macros, Internal Knowledge, Notifications, Integrations и Retention.
- Нет guided fields, inline validation, diff, shadow result, publish impact,
  rollback history и audit trail.

### `/knowledge`

- Экран правильно посвящён материалам пользовательского AI. Его нельзя
  переименовать и переиспользовать как операторскую Internal Knowledge: у них
  разные corpus, permissions, retention и риск утечки.

## 3. Информационная архитектура

### Основная навигация Support

```text
Support
├─ Обращения
│  ├─ Мои
│  ├─ Неназначенные
│  ├─ Требуют внимания
│  ├─ Нарушение SLA
│  ├─ Ожидают пользователя
│  └─ Сохранённые представления
├─ Все чаты
├─ Контроль
├─ Внешняя работа
├─ Качество
├─ Аналитика
└─ Настройки
```

`Обращения` и `Все чаты` переключают тип inbox, но сохраняют общий shell.
Выбор Case или Conversation кодируется в URL. `/users`, `/live` и legacy
`/cases` только открывают соответствующий deep link.

### Настройки

```text
/support/settings/overview
/support/settings/teams-skills
/support/settings/queues
/support/settings/routing
/support/settings/sla-calendars
/support/settings/case-intelligence
/support/settings/macros
/support/settings/internal-knowledge
/support/settings/notifications
/support/settings/integrations
/support/settings/retention-legal-hold
/support/settings/audit-rollout
```

Каждый publishable раздел имеет одинаковую модель: `Published` / `Draft`,
preview, validation, impact summary, version diff, publish reason, rollback и
audit. Нельзя собирать один универсальный JSON editor для разных доменов.

## 4. Пространственная система

### Breakpoints и размеры

| Viewport | Обязательная композиция |
| --- | --- |
| `≥1600px` | app rail `64`, Support nav `208`, inbox `336`, Conversation `min 600`, inspector `392` |
| `1280–1599px` | app rail `56–64`, Support nav collapsed `48–56`, inbox `300–320`, Conversation `min 520`, inspector `336–360` |
| `768–1279px` | compact rail, inbox `288–320` + Conversation; inspector — right drawer `min(420px, 92vw)` |
| `<768px` | одна рабочая поверхность; route stack и системный Back; bottom sheet только для коротких действий |

На `1440px` существующий CMS sidebar шириной `250px` оставляет всего `1190px`.
Этого недостаточно для inbox + полноценной переписки + inspector. Поэтому
Support route переключает общий layout на компактный app rail, а не пытается
втиснуться в текущую страницу.

### Высота и scroll ownership

- Shell: `height: 100dvh; min-height: 0; overflow: hidden`.
- Каждая колонка: `min-width: 0; min-height: 0`.
- Scroll имеют только inbox list, message history и inspector content.
- Header и composer остаются sticky внутри Conversation, не у viewport.
- При открытии Conversation история стартует у first-unread либо у конца,
  причём догрузка предыдущих страниц не должна прыгать по высоте.
- Mobile Back возвращает к предыдущей поверхности и сохраняет scroll, filters,
  selection и draft.

### Grid, отступы и плотность

- Базовый шаг: `4px`; рабочие интервалы: `8 / 12 / 16 / 24`.
- Pane header: `12px 16px`; mobile `12px`.
- Inbox row: `12px 14px`, gap между строками `4px`; не отдельные тяжёлые cards.
- Inspector section: `16px`; между смысловыми блоками `12px`.
- Conversation inner content: `16px 20px 24px`; центрируемая внутренняя ширина
  `760–840px`, но фон занимает всю панель.
- Message group gap `12px`, сообщения одного автора `4px`.
- Текст сообщения: `max-width: 64ch`; bubble не шире `72%` desktop и `88%`
  mobile.
- Composer: margin `12px 16px 16px`, padding `12px`, radius `16px`.
- Touch target не меньше `44×44px`; compact desktop control не меньше `36px`.
- Pane separators — линия `1px`; не вкладывать рабочие поверхности в общую
  mega-card с radius `20px`.

## 5. Цвет, фон и elevation

Нужно использовать существующие semantic tokens, не hardcoded hex и не новую
параллельную палитру.

| Область | Оформление |
| --- | --- |
| app rail | `--surface-card`, правая граница `--border-default` |
| Support nav | `--surface-subtle` |
| inbox | `--surface-card` |
| message stream | `color-mix(in srgb, var(--surface-canvas) 96%, var(--brand) 4%)` |
| inspector | `--surface-card` |
| selected inbox row | `--surface-active` + brand accent слева `2px` |
| unread row | text strong + unread dot; не заливать всю строку кислотным brand |
| composer | `--surface-raised`, border и мягкая тень первого уровня |
| public agent bubble | neutral raised surface; Lola/human различаются identity, не цветом текста |
| end-user bubble | brand tint с проверенным contrast |
| internal note | status-specific subtle background + иконка + явный label `Внутренняя заметка` |

Priority остаётся badge внутри строки. Красная/оранжевая рамка всей карточки
создаёт визуальный шум и не должна быть главным носителем состояния. SLA risk,
unread, assignment offer и attention — независимые индикаторы и не могут
сливаться в один цвет.

## 6. Типографика и иерархия

- Удалить из `/support/inbox` маркетинговый eyebrow и `42px` H1. Название
  текущего view — `16–18px / 600`; счётчик и freshness — `12–13px`.
- Primary message — `14–15px`, line-height `1.45–1.55`; metadata — `12px`.
- Inbox primary line — `14px / 600`; preview и metadata — `12–13px`.
- Inspector section title — `13px / 600`, labels — `12px`, values — `13–14px`.
- Крупный page heading допустим на `/support/control`, `/analytics` и Settings,
  где пользователь читает страницу, а не ведёт непрерывную переписку.
- Числа SLA используют tabular numerals, но countdown всегда сопровождается
  текстовым состоянием и server freshness.

## 7. Содержимое рабочих панелей

### Support navigation

- System views и saved views с bounded counts/freshness.
- Availability control отдельно от online socket: состояние, effective until,
  текущая нагрузка/capacity.
- Compact mode оставляет иконки, badges и tooltip; active state остаётся
  различимым без hover.

### Inbox

Строка должна отвечать на вопрос «почему это сейчас у меня и что делать»:

- user/display label, language и безопасный однострочный preview;
- unread, draft, typing/viewers и delivery failure;
- canonical workflow state, category и priority;
- assignee/team либо unassigned;
- queue/routing reason по раскрытию, а не как client inference;
- waiting side и один самый важный SLA countdown;
- updated time/freshness.

Поиск, filters, sort и saved view находятся в compact toolbar. Bulk actions
появляются только после selection mode; keyboard path включает `/` или
`Cmd+K` для поиска, `J/K` для перемещения и явную shortcut help.

### Conversation

Header содержит user, channel, Case link/state, assignee/team, claimant
`Lola / человек / away`, viewers и разрешённые quick actions. Это не место для
пяти KPI.

#### Один Conversation Surface для Users и Support

Полноценный chat UI из `UserWorkspaceDialog.vue` является исходной нормативной
реализацией, которую нужно **извлечь и доработать**, а не заменить новым
Support-only компонентом. Целевой module условно называется
`ConversationSurface` и монтируется в двух adapters:

```text
Users/Profile launcher ─┐
                       ├─> ConversationSurface ─> одна лента / toggle / composer
Support route pane ─────┘
```

Единственный public root Vue component должен находиться в
`features/conversation-surface/ui/ConversationSurface.vue`. И
`UserWorkspaceDialog.vue`, и `SupportConversationPane.vue` монтируют именно его;
они не собирают собственную chat-разметку из отдельных bubbles/controllers.

Общими и недоступными для переопределения на уровне adapters остаются:

- message bubble renderer, author/time/status и `TranslatedMessageBody`;
- segmented toggle `Оригинал / Перевод · <рабочий язык>` из текущего user chat;
- bulk translation progress, loading/error/skipped states;
- original/translated body semantics для inbound и outbound;
- history pagination/scroll anchor/new-message pill;
- typing, delivery status, draft и reply translation preview;
- composer frame и keyboard semantics.

Support расширяет этот Surface через typed capabilities общего interface:
internal note mode, attachments, macros, delivery/read, viewers, claimant и
author snapshot. Расширение сразу появляется и в Users chat там, где permission
и channel capability это разрешают. Нельзя делать Support fork template,
копировать CSS или подменять общую ленту через slot.

Текущий renderer «Связанные сообщения» в `EndUserCaseDetail.vue` — не второй
чат. Он удаляется вместе с `.message-row` CSS. Inspector оставляет только
Case-specific evidence metadata/link/unlink и открывает соответствующий
Conversation в общем Surface. Если требуется inline preview сообщения, это
отдельный компактный evidence item без управления chat и без претензии на
полную Conversation.

Translation control должен визуально и поведенчески совпадать в Users и
Support: постоянно видимый двухпозиционный toggle в header, `aria-pressed`, те
же labels, размеры, active state и loading/disabled semantics. Advanced menu с
language override и enable/disable не заменяет этот toggle и не создаёт ещё
один вариант переключателя.

Message group показывает:

- avatar, immutable display-name snapshot и role;
- body/original/translation без подмены оригинала;
- время и ordinal-backed position;
- attachments/scan/download state;
- delivery `Accepted / Delivered / Read / Failed` только для релевантного
  исходящего сообщения;
- macro provenance или internal-note label там, где разрешено.

Composer имеет два физически различимых режима:

1. `Публичный ответ` — attachments, macro, translation preview, send.
2. `Внутренняя заметка` — отдельный draft key, отдельный background/label,
   recipients/permission hint и невозможность вызвать public endpoint.

Ошибка отправки остаётся рядом с draft. Timeout показывает `Проверяем
результат…`, затем lookup outcome; он не превращается сразу в красное «не
отправлено» и не провоцирует дубль.

### Inspector

Tabs: `Обращение`, `Пользователь`, `Данные`, `События`, `Знания`,
`Интеграции`, `Активность`.

- **Обращение:** state, category/topic, priority floor, assignment, queue,
  routing reason, SLA clocks, escalation, resolution outcome, allowed actions.
- **Пользователь:** profile summary и lazy permission-gated sensitive fields.
- **Данные/События:** bounded product facts с source, time и freshness.
- **Знания:** Internal Knowledge search, preview, link/quote; AI knowledge сюда
  не смешивается.
- **Интеграции:** связанный внешний объект, create/link/comment, sync timeline,
  `UNKNOWN` recovery и explicit retry.
- **Активность:** causal Support Activity с actor, reason, revision и source;
  это не декоративный лог из websocket hints.

Inspector сохраняет выбранный tab per operator, но permission revoke сразу
удаляет закрытые данные из DOM/cache и возвращает безопасный empty state.

## 8. Lead Control, External Work и Settings

### Lead Control

- KPI header показывает freshness и definition link; карточка кликабельна
  только когда есть точный server drill-down.
- Основная поверхность — action table: breach/risk, unassigned, overloaded,
  stuck routing/reservation и delivery failures.
- Справа — causal timeline и audited action: assign/override/acknowledge/close
  с обязательной reason.
- Operational alert различает `OPEN / ACKNOWLEDGED / CLOSED`, owner,
  occurrence count, last seen и stale projection.

### External Work

- `/support/external-work` — master/detail для объектов JSM/HelpDesk, которые
  требуют восстановления или ручной координации.
- Settings → Integrations: disconnected/authorizing/connected/degraded,
  reauth-required/disabled, OAuth, explicit site/project selection, test
  connection, last successful sync, destination refresh, mapping draft,
  preview, publish, rollback, capability limitations и compatibility inbox.
- Case inspector получает только Case-scoped create-options и server-owned
  required fields. Перед create пользователь явно выбирает safe context;
  история чата никогда не копируется автоматически.
- Case inspector: link existing, create, add comment и unlink по
  `allowedActions`; outbound command имеет `В очереди / Отправляется / Повтор /
  Создано / Требует внимания / Результат неизвестен`, idempotency и timeline.
  `202` означает pending, а не success. Vendor status не заменяет canonical
  Lola Case state.
- External comments имеют отдельную timeline. Internal comment — безопасный
  default; public comment требует отдельного permission и явного подтверждения
  в текущем draft. Копирование remote text создаёт редактируемый chat draft и
  ничего не отправляет автоматически.
- Права на connection/mapping, просмотр объекта и действия над ним разделены.
  Support Lead не получает credential/settings authority только из-за роли.

### Notifications

- Personal settings показывают браузерное permission, project preferences и
  список устройств отдельно.
- `Назначено мне` по умолчанию включено, `Требует внимания` — выключено, пока
  backend policy не задаёт другое опубликованное значение.
- Запрещено показывать toggle enabled, если browser permission denied или push
  subscription не подтверждена backend.
- Notification содержит generic безопасный текст и deep link; после login/
  project restoration открывается exact permitted Case/view.

### Case Intelligence

Guided sections: include/exclude topics, category examples, model, confidence,
budget, aggregation/router, auto-apply rules. Preview обязан показать shadow
sample, confusion/error buckets, precision/recall/cost и manual corrections.
Publish не разрешён без понятного impact и rollback revision.

## 9. Public End User chat — отдельный UI-трек

CMS workspace не завершает продукт без публичного SDK/виджета. Его нельзя
спрятать внутри задачи операторского UI.

- Header строится из conversation-scoped responder state:
  `LOLA`, `SUPPORT_REQUESTED`, `SUPPORT_LIVE`, `SUPPORT_AWAY`,
  `LOLA_SUSPENDED`; assignment или viewer не используются как claimant.
- Для человека показываются approved display name/avatar snapshot, для Lola —
  стабильная product identity. Внутренние team/operator IDs не раскрываются.
- Bubble показывает автора, вложения и read semantics `Lola / Support / оба /
  никто` по published projection, а не по frontend timer.
- Read ACK отправляется high-water только после фактического render/visibility
  и повторяется безопасно после reconnect.
- Typing bidirectional; Lola typing выводится из durable AssistantTurn, человек
  — из scoped TTL event. Нельзя имитировать активность локальным таймером.
- Composer поддерживает public attachments и сохраняет draft/retry.
- Обязательна визуальная матрица SDK на `390×844`, narrow embedded container,
  keyboard viewport и offline/reconnect.
- Durable delivery/read/attachments включаются только после version gate
  совместимого SDK, иначе backend rollout создаст ложные состояния в старых
  клиентах.

## 10. Responsive и accessibility

- Mobile primary routes имеют настоящий heading и browser history; close icon
  модалки не заменяет Back.
- При открытии клавиатуры composer остаётся видимым через `dvh`/visual viewport,
  а message anchor не прыгает.
- Inspector drawer trap-ит focus только пока открыт и возвращает focus в
  вызывающую кнопку.
- Все status chips имеют текст/иконку, не только цвет; contrast проверяется в
  light/dark и forced-colors.
- Keyboard user может открыть view, выбрать строку, прочитать message history,
  сменить composer mode, вставить macro и отправить без pointer.
- Live updates используют умеренный `aria-live`; realtime arrivals не
  перехватывают screen reader focus.
- Skeleton повторяет геометрию панелей; error/empty/forbidden/stale состояния
  не схлопывают layout.
- Reduced motion отключает сдвиги панелей и декоративные transitions.

## 11. Что удалить, перенести или прекратить развивать

1. Перенести KPI-блок `/cases` в `/support/control`; в inbox оставить view
   name, count/freshness и компактные controls.
2. Удалить пустую гигантскую detail-card и page-level `border-radius: 20px` из
   операторского пути; заменить панелями с dividers.
3. Прекратить добавлять функции в `UserWorkspaceDialog` как primary UI.
   При этом не выбрасывать его chat implementation: выделенный общий
   Conversation Surface должен использоваться и route shell, и dialog; dialog
   остаётся лишь временным launcher/adapter.
4. Старый `/cases` превратить в redirect/deep-link после parity, не держать две
   реализации Case actions.
5. Raw JSON settings оставить только под отдельным advanced/compatibility
   permission до миграции на guided editors.
6. Hardcoded reply templates удалить после Macro catalog migration.
7. Не объединять `/knowledge` и Internal Knowledge визуально или по storage.
8. Удалить самостоятельную отрисовку `.message-row` из
   `EndUserCaseDetail.vue` и запретить второй Support message renderer. Один и
   тот же Conversation Surface и translation toggle проверяются на Users и
   Support routes.

## 12. Visual acceptance и screenshot matrix

Перед rollout каждой vertical нужны снимки и интерактивная проверка:

| Сценарий | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| inbox empty/loading/error | `1600×1000`, `1440×1000` | `1024×768` | `390×844` |
| selected Case + inspector | да | drawer | route |
| all Conversations without Case | да | да | да |
| first unread + pagination anchor | да | да | да |
| public reply/note/error/unknown outcome | light + dark | dark | light + keyboard |
| long text/image/document | light + dark | да | narrow embedded |
| SLA breach/attention/unassigned | да | да | да |
| permission revoke/project switch | да | да | да |

Acceptance checklist:

- на `390×844` первая строка inbox видна в первом viewport;
- на `1440×1000` одновременно видны inbox, полезная ширина Conversation и
  inspector — без горизонтальной прокрутки;
- message text не растягивается шире `64ch`, composer не закрывает последнее
  сообщение;
- выбранная строка, unread, priority и SLA остаются четырьмя различимыми
  сигналами;
- light/dark используют одинаковую иерархию surfaces;
- loading/error/forbidden/stale/unknown outcome имеют отдельные состояния;
- ни один внутренний note, article, PII field или notification body не
  появляется в public projection/screenshot;
- visual regression дополняется task-based UX test: найти неназначенный Case,
  понять причину, ответить macro, добавить note, открыть event, перевести Case.
- component identity test подтверждает, что Users/Profile и Support используют
  один Conversation Surface; shared behavior suite проверяет одинаковый
  translation toggle и message rendering через оба adapters.

### Кнопка `На весь экран / Свернуть`

Текущий PrimeVue maximize не является visual acceptance: на приложенном
состоянии видны CMS sidebar и фон, у workspace остаются отступы/radius, справа
образуется пустой canvas. Кнопка должна переключать отдельный full-tab shell,
который занимает точный viewport вкладки, не прокручивает background и не
перемонтирует Conversation Surface.

Обязательны FLIP-анимация на `transform/opacity`, reduced-motion fallback,
раздельные `Свернуть` и `Закрыть`, сохранение draft/selection/translation/
message anchor, safe areas, mobile keyboard и один scroll/focus owner для
вложенных overlays. Полное решение, размеры, motion timings и e2e assertions:
[10-full-tab-workspace-discovery.ru.md](./10-full-tab-workspace-discovery.ru.md).

## 13. Референсы и что именно из них берём

- [Zendesk Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace):
  единая chronological conversation, customer context справа и knowledge в
  том же рабочем месте.
- [Intercom Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained):
  постоянный inbox, configurable views/table, быстрые действия и preview без
  потери списка.
- Дополнительное сопоставление первичных источников находится в
  [research note](../../research/support-platform-operator-workspace-primary-sources-2026-08-07.ru.md).
- Browser, viewport, scroll, focus и motion основания full-tab режима находятся
  в [отдельном исследовании](../../research/support-fullscreen-workspace-browser-platform-discovery-2026-08-07.ru.md).

Референсы задают interaction pattern, но не разрешают копировать чужую
визуальную систему. Финальный UI использует Lola tokens, существующие icon
primitives и единый component vocabulary.
