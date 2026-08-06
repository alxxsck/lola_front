# Support Workspace: операторский интерфейс

## 1. Информационная архитектура

Левая продуктовая навигация раздела «Поддержка»:

```text
Мои обращения
Неназначенные моей команды
Все обращения
Все диалоги
Сохранённые представления
Проверка качества       [permission]
Операционный обзор      [permission]
Аналитика               [permission]
Настройки поддержки     [permission]
```

Пункты не рендерятся без permission на соответствующую projection. Временная
недоступность projection показывается внутри доступного route, а не исчезновением
пункта во время работы.

### Маршруты и URL state

| Route                                          | Назначение                          |
| ---------------------------------------------- | ----------------------------------- |
| `/support/inbox`                               | Последний или default View          |
| `/support/inbox/cases/:caseId`                 | Выбранный Case и его Conversation   |
| `/support/inbox/conversations/:conversationId` | Conversation без обязательного Case |
| `/support/control`                             | Live operational control            |
| `/support/quality`                             | QA workspace                        |
| `/support/analytics`                           | Исторические отчёты                 |
| `/support/settings/:section`                   | Разрешённая настройка support       |

URL хранит выбранную сущность, view/filter key и безопасный search scope. Draft,
токены, PII, signed attachment URL и scroll anchors в URL не попадают.

## 2. Layout

### Desktop, 1280 px и шире

```text
┌────────────┬──────────────────┬─────────────────────────┬──────────────────┐
│ Support nav│ Inbox 280–360 px │ Conversation min 520 px │ Inspector 320–440│
└────────────┴──────────────────┴─────────────────────────┴──────────────────┘
```

- Inbox и inspector допускают ограниченный resize с keyboard alternative.
- Inspector сворачивается; выбранная вкладка и ширина хранятся как личная UI
  настройка, scoped по project.
- Header и composer sticky, но не закрывают focused element и первый unread.
- При ширине центральной области меньше 520 px inspector автоматически
  переходит в drawer.

### Tablet, 768–1279 px

- product nav свёрнута;
- inbox + Conversation образуют split view;
- inspector открывается drawer поверх Conversation;
- закрытие drawer возвращает focus к trigger и не сбрасывает данные/scroll;
- table mode скрывает вторичные колонки через chooser.

### Mobile, 320–767 px

```text
Views → Inbox → Conversation → Inspector detail
```

- каждый уровень — route state с корректным browser Back;
- смена уровня не уничтожает draft;
- header содержит back, пользователя, главный state и overflow;
- composer остаётся над экранной клавиатурой;
- translation, AI и assignment details открываются sheet;
- inspector является отдельным экраном;
- target controls проектируются около 44×44 CSS px.

## 3. Global header

Показывает:

- project switcher;
- глобальный поиск/command palette;
- operational alerts count, если разрешено;
- availability текущего оператора;
- active load/capacity;
- sync/reconnect indicator только при реальной деградации.

Availability имеет явные значения: `AVAILABLE`, `BUSY`, `AWAY`, `DRAINING`,
`OFFLINE`. Для каждого значение объясняет последствия. Например:
«Новые обращения не назначаются; завершите 3 текущих».

Нельзя выводить availability из WebSocket connection или browser visibility.

## 4. Views, filters и поиск

### System Views

- **Мои обращения** — назначенные текущему actor и разрешённые target authority;
- **Неназначенные моей команды** — доступные для self-claim;
- **Все обращения** — Cases в scope actor;
- **Все диалоги** — Conversations, в том числе ещё не связанные с Case;
- **Сохранённые** — backend-валидированный filter/sort/column preset.

Default View задаётся личной настройкой. Если permission у сохранённого View
отозван, UI не расширяет выдачу: показывает недоступные filter fields и предлагает
пересохранить безопасную версию.

### Filter bar

Минимальные фильтры:

- status и waiting side;
- assignee, team, unassigned;
- priority;
- SLA at risk/breached;
- queue/topic/category;
- language/channel;
- unread/draft/delivery problem;
- updated/time range.

Активные ограничения всегда видны chips. Reset очищает только пользовательские
filters, но не скрытый authority scope. Количество и результаты приходят с
backend; браузер не фильтрует неполную страницу.

### Search

`⌘/Ctrl+K` открывает command palette. Разрешённые ключи:

- Case ID;
- Conversation ID;
- Message ID;
- external user ID;
- email/телефон только при соответствующем profile permission;
- bounded content search.

Глобальный поиск и поиск внутри View визуально различаются. В каждом результате
показываются тип сущности, project, safe snippet и причина совпадения. Search не
подсвечивает скрытые PII.

## 5. Inbox: chat mode

### Строка

Строка должна позволить выбрать следующую работу без раскрытия лишних данных:

- имя или безопасный идентификатор End User;
- safe last-message preview и время;
- actor-relative unread count и first unread marker;
- Case status и waiting side;
- assignee/team;
- priority;
- один SLA countdown, соответствующий текущей сортировке;
- channel и число Conversations при необходимости;
- attention icons: delivery failure, AI suspended, attachment problem;
- личный draft marker.

Строка не показывает message body из realtime payload. Новое событие меняет
revision/attention и инициирует reconcile страницы.

### Сортировка

Поддерживаются `next SLA`, `waiting since`, `last activity`, `priority`,
`oldest unassigned`. В строке показывается таймер выбранной сортировки; остальные
deadlines доступны в inspector. Sort является частью cursor binding.

### Выбор и обновление

- initial load выбирает сущность из URL, иначе первый доступный item;
- item, исчезнувший из текущего View после command, остаётся выбранным до
  завершения projection refresh и затем даёт понятный переход к следующему;
- realtime insertion не прыгает selection и не меняет scroll неожиданно;
- stale список имеет label freshness и явный Retry;
- skeleton повторяет геометрию строки, а не имитирует реальные данные.

## 6. Table mode

Table mode использует ту же backend query, cursor и selection, что chat mode.
Он рассчитан на лидов и bulk triage.

Обязательные возможности:

- column chooser из server-approved vocabulary;
- sort только по поддерживаемым backend полям;
- sticky header и keyboard row navigation;
- preview выбранной строки без ухода со списка;
- bulk action только если capability дана для всей selection;
- частичный bulk result по каждому Case, а не один ложный success;
- export только отдельной audited server operation.

Скрытые permissions не появляются в chooser. Клиент не вычисляет SLA, load или
aggregate из загруженных строк.

## 7. Conversation header

Header отвечает на вопросы: с кем диалог, какой Case, кто отвечает и что мешает
продолжить.

Постоянная часть:

- display name + canonical/verified identifier;
- channel, Conversation title/id и связанные Conversations;
- Case status, waiting side и priority;
- assigned operator/team;
- claimant/public responder;
- ближайший SLA deadline/risk;
- AI mode;
- viewers/typers как ephemeral hint;
- claim, transfer, priority, close/reopen, pause AI, overflow — по allowed actions.

На узком экране остаются имя, главный Case/AI state и одна primary action.
Остальное доступно из подписанного overflow. Иконка без label не должна быть
единственным способом понять state.

## 8. Inspector

Вкладки: `Case`, `Пользователь`, `Данные`, `События`, `Knowledge`,
`Интеграции`, `Activity`. Их содержание и правила загрузки описаны в
[03-user-context-permissions.ru.md](./03-user-context-permissions.ru.md).

Inspector не дублирует выбранный chat store. Каждая вкладка запрашивает свою
projection, поддерживает abort/generation guard и показывает собственную
freshness. Переключение Conversation отменяет незавершённые запросы старого
target.

## 9. Навигация из существующих разделов

- `/cases` открывает выбранный Case в `/support/inbox/cases/:caseId`;
- `/users` и текущий profile dialog открывают последнюю или выбранную
  Conversation deep link;
- `/live` передаёт `conversationId/endUserId`, но присутствие не становится
  assignment;
- уведомление или alert открывает точный View/filter/selection;
- прямой URL после reload восстанавливается только после project и permission
  проверки.

Если actor имеет profile permission, но не support read, старый профиль остаётся
доступным без chat. Если support read есть, а profile read нет, Conversation
открывается с safe End User summary.

## 10. Empty, error и stale states

| Состояние                | UI                                                                        |
| ------------------------ | ------------------------------------------------------------------------- |
| Нет элементов во View    | Название View, активные filters, безопасный next action                   |
| Нет permission           | Route guard; sensitive содержимое не монтируется                          |
| Projection stale         | Последнее значение + timestamp + Retry, если policy разрешает             |
| Connection lost          | Draft доступен; отправка зависит от durable command contract              |
| Selection deleted/hidden | Причина без PII, возврат в список                                         |
| `409`                    | Сохранить draft, reconcile, показать изменившийся state и allowed actions |
| `403` после revoke       | Очистить sensitive cache/watch, вернуть в доступный route                 |
| Unknown command outcome  | «Проверяем результат», lookup/reconcile, без слепого дубля                |

## 11. Keyboard и accessibility

- `⌘/Ctrl+K` — command palette и справка;
- `j/k` или arrows — следующая/предыдущая строка вне editable controls;
- `r` — public reply;
- `n` — Internal Note;
- `/` внутри composer — macros;
- `⌘/Ctrl+Enter` — отправка явно названного режима;
- `Esc` — закрытие overlay без очистки draft.

Character shortcuts отключаются или переназначаются. Они не срабатывают в
input, textarea, contenteditable и во время IME composition. Все действия имеют
кнопочный эквивалент. Focus после overlay возвращается к trigger; sticky UI не
перекрывает focus при 200% zoom.

## 12. Acceptance criteria

- оператор открывает первый unread из «Мои обращения», видит owner/AI/SLA и
  отвечает без перехода на другой route;
- Case с несколькими Conversations не позволяет отправить в невыбранный канал;
- переключение View/layout сохраняет корректную selection и draft;
- mobile Back проходит `Conversation → Inbox → Views` без потери состояния;
- table и chat mode дают одинаковые results/revisions для одинаковой query;
- отозванный permission очищает чувствительные данные и активный watch;
- `/live`, `/users` и `/cases` дают стабильный deep link в workspace;
- ни один UI state не выводит assignment, availability или delivery из presence.
