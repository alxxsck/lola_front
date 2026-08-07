# Lola Support: операторское рабочее место — первичные источники

Дата: 7 августа 2026 года.
Границы: компактное UX-исследование для frontend-плана Support. Использованы
только официальные документы производителей и W3C; ссылки ведут на первоисточник.
Это не перенос чужих продуктов один к одному: наблюдения ниже сопоставлены с
нормативным backend-контрактом Lola Support.

## Итог для Lola

Нужен единый полноэкранный workspace, в котором оператор не переключается между
профилем, чатом и обращением: очередь или табличный обзор, выбранная
Conversation, и инспектор Case/User/Knowledge. При этом `Case` (состояние,
ответственность, SLA) и `Conversation` (канал и последовательность сообщений)
должны остаться разными сущностями. Это согласуется и с внешними паттернами
unified inbox, и с Lola, где один Case может содержать несколько Conversations.

Критически важно не выдавать «компоненты чата» за готовый workspace. Frontend
должен отображать authoritative server projection и server-provided allowed
actions; optimistic UI допустим только как временное состояние команды.

## 1. Inbox и навигация

- Разделить режимы **«Обращения»** и **«Все чаты»**. Первый — очередь Case и
  ответственность за результат; второй — поиск и история Conversations, включая
  те, из которых Case не возник. В обоих режимах выбранная Conversation открывает
  одну и ту же центральную ленту и правый inspector.
- Дать два представления одной server query: обычный inbox для поточной работы и
  table/control view для лида. В Intercom table rows имеют настраиваемые
  колонки, сортировку, bulk actions и preview справа; это именно альтернативный
  layout inbox, а не другая база данных.
  ([Intercom: The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained))
- Строка очереди должна показывать то, что определяет следующий ход: безопасный
  preview, непрочитанное для текущего оператора, assignee/team, Case state,
  priority, канал и **один** ближайший SLA deadline. Intercom позволяет сортировать
  по next SLA target, а Zendesk выводит time left в views и поддерживает
  сортировку по SLA; несколько равноправных таймеров в одной строке создадут шум.
  ([Intercom: Inbox sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting),
  [Zendesk: Using SLA policies](https://support.zendesk.com/hc/en-us/articles/5604663490458-Using-SLA-policies))
- Views/search/filters — server-owned query vocabulary с cursor pagination.
  Сохранённое представление хранит фильтры, sort и доступные колонки, но не
  клиентский снимок результата. Если permission изменилось, скрыть запрещённое
  поле и запросить новую проекцию, а не расширять результат молча.
- Assignment, availability и presence — разные сигналы. В частности, команда
  может быть назначена без конкретного оператора; active/away влияет на
  eligibility новой выдачи, но не отменяет уже назначенный Case. В Intercom
  назначение команде снимает назначение конкретному человеку, а закрытие
  сохраняет assignee/team; Zendesk также разделяет routing capacity и assignment.
  ([Intercom: Assign conversations to teammates and teams](https://www.intercom.com/help/en/articles/6561699-assign-conversations-to-teammates-and-teams),
  [Zendesk: Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace))
- Для ручного claim нужен versioned command: LiveChat показывает, что при ручной
  очереди после pick-up другие агенты уже не могут забрать тот же чат. Lola должна
  достигать этого reservation/expected-version на backend, а UI после `409` обязан
  перечитать Case и объяснить, кто и когда изменил назначение.
  ([LiveChat: Understanding chat assignment](https://www.livechat.com/help/chat-assignment/))

## 2. Conversation и composer

- Центр — хронологическая лента сообщений, внизу composer; справа —
  сворачиваемый inspector. Zendesk объединяет каналы в ticket interface, а
  Intercom и LiveChat держат customer/context details рядом с перепиской.
  ([Zendesk: About the Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace),
  [LiveChat: Customer Details](https://www.livechat.com/help/customer-details/))
- Composer обязан иметь два постоянно различимых режима: **«Ответ пользователю»**
  и **«Внутренняя заметка»**. Не достаточно разного цвета: название режима,
  placeholder и label submit должны говорить, куда уйдёт текст. В Zendesk internal
  note — private comment, видимый сотрудникам, но не end user, и он допускает
  formatting/attachments; Intercom по умолчанию возвращает composer в note, когда
  последним элементом был note. Этот удобный, но опасный default нельзя слепо
  переносить в Lola.
  ([Zendesk: Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace),
  [Intercom: Start a conversation from the Inbox](https://www.intercom.com/help/en/articles/6433002-start-a-conversation-from-the-inbox))
- Возможности composer должны объявляться каналом, а не имитироваться единым
  rich-text editor: Zendesk меняет controls по каналу. Поэтому frontend получает
  channel capabilities от сервера и disable/объясняет неподдерживаемый формат,
  attachment или действие до send.
  ([Zendesk: Composing messages in the Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408831849882-Composing-messages-in-the-Zendesk-Agent-Workspace))
- Draft хранится отдельно по `Conversation × mode`; вложения никогда не переносятся
  между note и public reply. Перед send UI отображает ожидаемый channel/язык,
  attachment readiness и конкретный результат действия («Отправить пользователю»,
  «Добавить заметку»).
- Новое входящее сообщение не должно сдвигать оператора, читающего историю: держать
  scroll anchor и показать кнопку «Новые сообщения (N)». Presence/typing — только
  hint о коллизии, а не lock composer. Assignment и AI suspension — устойчивые
  Case states в header, а просмотр/typing — TTL realtime-индикация.
- Для outbound в offline-состоянии не блокировать send в браузере: показать
  server state `ACCEPTED / DELIVERED / READ / FAILED` на конкретном сообщении и
  дать безопасный retry только если это разрешает сервер. Zendesk показывает
  delivery/read state рядом с отправленным сообщением; это подтверждает
  message-level, а не один глобальный «чат offline» паттерн.
  ([Zendesk: Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace))

## 3. Вложения, macros, notes и внутренние знания

- Upload tray нужен до отправки: имя, тип, размер, progress, cancel/retry и
  различимые `uploading / scanning / ready / rejected`. `READY` — единственное
  состояние, с которым доступна отправка. Secure download не должен быть вечным
  URL: Zendesk после завершения чата требует authentication для secure
  attachments; Lola уже нормирует короткоживущий scoped grant и scan до preview.
  ([Zendesk: Allowing secure chat attachments](https://support.zendesk.com/hc/en-us/articles/4408842669594-Allowing-secure-chat-attachments-in-the-Zendesk-Agent-Workspace))
- Поддержать picker, paste и drop, но не делать drag-and-drop единственным путём.
  W3C требует альтернативу dragging без dragging movement.
  ([W3C: Understanding Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))
- Macro должен вставлять **редактируемый draft**, а не сразу отправлять текст.
  Zendesk применяет макрос вручную в comment, может объединять text/actions и
  предлагает shortcut `/`; Intercom позволяет оператору перед send изменить
  actions, но запрещает одному macro одновременно public reply и internal note.
  Для Lola это аргумент к типизированному macro mode и отдельному review перед
  связанными Case actions.
  ([Zendesk: Creating macros for repetitive ticket responses and actions](https://support.zendesk.com/hc/en-us/articles/4408844187034-Creating-macros-for-repetitive-ticket-responses-and-actions),
  [Intercom: Creating and managing macros](https://www.intercom.com/help/en/articles/6433193-creating-and-managing-macros))
- В настройках macro нужны visibility (personal/team/shared), category/language,
  permissions, immutable revision и usage/audit. У Intercom macro можно
  ограничить командами/личным использованием, контент и действия учитываются в
  conversation events; LiveChat поддерживает shared/private и variables.
  ([Intercom: Creating and managing macros](https://www.intercom.com/help/en/articles/6433193-creating-and-managing-macros),
  [LiveChat: Canned responses](https://www.livechat.com/help/set-canned-responses/))
- Internal Knowledge — отдельная от public/assistant knowledge audience. В
  workspace оператору нужен поиск и preview/open статьи без ухода из Case;
  открытие не должно стирать draft. Intercom подтверждает, что internal articles
  доступны teammates, но не добавляются в public Help Center. В Lola к этому
  добавляется backend-required fail-closed audience isolation:
  `SUPPORT_INTERNAL` не может попадать в end-user AI/RAG.
  ([Intercom: Overview of content types](https://www.intercom.com/help/en/articles/9357928-overview-of-content-types-and-when-to-use-them))
- Knowledge drawer полезно дополнить `search → preview → open/link/quote`,
  pinned/recent results и явной меткой visibility/source. Zendesk позволяет
  искать, preview, link и quote content прямо в Agent Workspace и различать
  ограниченные внутренние и внешние источники; это подтверждает, что knowledge
  не должна быть отдельной страницей, но её доступ и публикация остаются
  управляемыми настройками.
  ([Zendesk: Using help-center content without leaving Agent Workspace](https://support.zendesk.com/hc/en-us/articles/5581313653530-Using-help-center-content-in-your-tickets-without-leaving-Agent-Workspace))

## 4. Assignment, SLA и контроль

- Header Case показывает assignee/team, state, priority, ближайшую SLA цель и
  явные actions claim/transfer/reassign/close. Нельзя кодировать всё одной
  «зелёной точкой»: availability определяет новую выдачу, assignee — ownership,
  watcher/typer — realtime presence.
- Routing UI обязан уметь объяснить результат: выбранная очередь/команда,
  причина, reservation и audit. Для team queue полезны способы «manual»,
  «round-robin», «least/balanced workload», но Lola должна применять собственные
  eligibility (skills, язык, capacity, priority, SLA), а не копировать алгоритм
  поставщика. Intercom документирует manual, round-robin и balanced с лимитом
  активных conversations; LiveChat — queue claim и re-transfer при inactivity.
  ([Intercom: Organize team inboxes](https://www.intercom.com/help/en/articles/197-organize-team-inboxes),
  [LiveChat: Understanding chat assignment](https://www.livechat.com/help/chat-assignment/))
- SLA UI показывает ближайший target, риск и статус, а inspector — полный набор
  clocks с pause reasons. Intercom подчёркивает, что на conversation может быть
  только один активный SLA; после ответа пользователя может смениться next-response
  target, а pause зависит от явно настроенных `snooze`/`waiting on customer`.
  Lola должна хранить свои shadow clocks отдельно: ожидание пользователя, системы
  и администратора нельзя неявно смешивать со статусом.
  ([Intercom: Set SLAs for conversations and tickets](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets))
- Режим лида: table filters/sort/columns, bulk actions с подтверждением охвата и
  permission checks, отдельные operational alerts. Bulk reply/note и bulk
  reassign всегда показывают, сколько Cases изменится, и пишут audit; не
  заменяют versioned commands для спорных единичных действий.

## 5. Доступность — обязательный acceptance scope

- Все динамические нетерминальные статусы (отправлено, upload progress,
  assignment updated, поиск завершён) должны быть программно определимыми без
  перехвата фокуса. W3C рекомендует `role=status` для результатов/состояния,
  `role=log` для последовательных обновлений; при этом предупреждает не делать
  live region «болтливым». В Lola новые сообщения не следует автоматически
  зачитывать, пока оператор не запросил такой режим; send/error/readiness —
  краткие status announcements.
  ([W3C: Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html))
- Виртуализированная/бесконечная лента должна сохранять читаемую клавиатурную
  навигацию и scroll anchor. Если используется ARIA feed, каждый message article
  получает accessible label/description, а во время пачки DOM-изменений
  применяется и затем снимается `aria-busy`; W3C описывает этот контракт для
  assistive technology.
  ([W3C ARIA APG: Feed pattern](https://www.w3.org/WAI/ARIA/apg/patterns/feed/))
- Inspector, upload tray и modal confirmation не могут скрыть focused control.
  Для modal: перенос фокуса внутрь при открытии, Tab loop, Escape и видимая
  кнопка закрытия; после закрытия — возврат к логическому trigger. Persistent
  overlays также не должны заслонять focus на responsive breakpoints.
  ([W3C ARIA APG: Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum))
- Каждое pointer действие должно быть доступно с keyboard: открыть/закрыть
  inspector, выбрать Case, переключить reply/note, вставить macro, добавить файл,
  назначить, поменять статус и отправить. Shortcut можно добавить (`/` macros,
  `A` assign, command palette), но он не заменяет фокусируемые controls и не
  должен конфликтовать с textarea/IME.

## Что это меняет в frontend-плане

1. Сначала закрепить shell `SupportOperatorWorkspace`: разделы Cases/All chats,
   query-driven inbox/table, conversation pane и permission-aware inspector.
2. Затем довести conversation contract: durable delivery, typing/viewing,
   translations, attachment lifecycle, clear reply/note modes и draft recovery.
3. После этого подключить Case workflows: classification/category/priority,
   assignment/reservations, SLA clocks, audit/activity и conflict recovery.
4. Отдельными вертикалями добавить настройки routing/categories/SLA/macros и
   internal knowledge; ни одна из них не должна быть локальным static UI.
5. Для каждой вертикали включить keyboard, screen-reader status semantics,
   focus management и permission/forbidden-state tests в Definition of Done.

## Источники и ограничения

Выводы о паттернах основаны на официальной документации выше. Ограничения
конкретных SaaS (планы, канальные timeouts, мобильные возможности) не являются
требованиями Lola. Нормативные решения Lola — lifecycle Case/Conversation,
permissions, cursor reads, delivery и изоляция internal knowledge — задаются
backend-спецификацией `docs/specs/support-platform`; внешние источники лишь
проверяют, что предложенный operator UX закрывает реальные рабочие сценарии.
