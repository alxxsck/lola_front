# Операторский support workspace Lola: UX-исследование

Дата исследования: 6 августа 2026 года.

## Задача и границы

Цель — дать проверенную основу для полной frontend-спецификации операторского
чата Lola: inbox, работа с Conversation и Case, контекст пользователя,
назначение и права, перевод, AI → человек, realtime-состояния, вложения,
внутренняя совместная работа, контроль качества и операционная статистика.

Использованы только первичные источники:

- официальная документация LiveChat, Intercom и Zendesk о фактическом поведении
  их операторских продуктов;
- W3C/WAI: WCAG 2.2, WAI-ARIA 1.2 и ARIA Authoring Practices;
- нормативные документы Lola backend из
  `/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform`;
- текущий код и документация `Lola_front`.

Маркетинговые сравнения, обзорные блоги и неподтверждённые макеты не
использовались. Официальные продукты подтверждают рабочие паттерны, но не
определяют дизайн Lola дословно. Поэтому ниже **наблюдение источника** и
**рекомендация для Lola** разделены.

## Короткий вывод

Lola нужен не «экран чата с дополнительными карточками», а единый
**Support Operator Workspace** с двумя рабочими режимами:

1. **Conversation mode** для оператора: очередь/список слева, переписка в центре,
   сворачиваемый inspector справа.
2. **Table/control mode** для лида: настраиваемые колонки, фильтры, bulk actions,
   SLA/capacity/assignment и быстрый preview без потери контекста.

Внутри выбранной Conversation нельзя смешивать разные понятия одним статусом:

- `Assignment` — кто отвечает за Case;
- `AI Suspension / claimant` — кто сейчас имеет право публично отвечать вместо
  Lola;
- `Operator Availability` — можно ли назначать оператору новую работу;
- `online/viewing/typing` — краткоживущая realtime-подсказка;
- `ACCEPTED/DELIVERED/READ/FAILED` — фактическая доставка конкретного сообщения;
- личный unread оператора — его собственная позиция чтения.

Главный проектный принцип: интерфейс строится от authoritative backend
projections и server-provided allowed actions. Realtime лишь подсказывает, что
перечитать; отсутствие кнопки не заменяет серверную авторизацию.

## Что уже есть в `Lola_front`

Исследование не предполагает greenfield. Текущий код уже содержит значительную
часть вертикалей:

- `UserWorkspaceDialog.vue` совмещает профиль и чат, поддерживает список
  Conversations, pagination, realtime reconciliation и per-conversation drafts;
- `use-admin-conversation-console.ts` содержит merge/reconcile сообщений,
  presence и idempotent reply attempts;
- conversation translation включает inbound original/translated projection,
  outbound preview/edit/send и permission-guarded bypass;
- AI Suspension имеет header actions, banner, history и collision-safe state;
- рядом существуют User Memory, AI Review, AI usage/allowance, operational state
  и profile data;
- `ConversationTicketDrawer.vue` уже показывает направление будущего Case flow,
  но прямо сообщает, что Support API ещё не подключён.

Следовательно, frontend-спецификация должна описывать **миграцию и композицию**
этих возможностей вокруг `SupportOperatorWorkspace`, а не переписывание всего
чата одним большим компонентом.

## 1. Информационная архитектура

### Что подтверждают продукты

Zendesk объединяет каналы в одном Agent Workspace, располагает историю в центре,
а customer context, knowledge, apps и side conversations — в правой context
panel. Панель можно открыть, закрыть, переключить и изменить её ширину.
([Zendesk: About the Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace),
[Zendesk: Using the context panel](https://support.zendesk.com/hc/en-us/articles/4408836526362-Using-the-context-panel))

LiveChat также делит Chats section на chat list, chat feed и Customer Details
справа. Customer Details допускает настраиваемые/reorderable widgets и вкладки
интеграций.
([LiveChat: Chats section overview](https://www.livechat.com/help/how-to-chat-section/),
[LiveChat: Customer Details](https://www.livechat.com/help/customer-details/))

Intercom поддерживает chat layout и отдельный table layout. Таблица даёт
настраиваемые колонки, sort, bulk actions и preview справа; сам Intercom называет
её особенно полезной для support/shift managers.
([Intercom: The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained),
[Intercom: Customize the Inbox](https://www.intercom.com/help/en/articles/7911926-customize-the-inbox-to-suit-you-and-how-you-work-best))

### Рекомендация для Lola

Desktop ≥ 1280 px:

```text
┌──────────────┬────────────────────┬──────────────────────────┬──────────────────┐
│ Support nav  │ Inbox / Cases      │ Conversation             │ Inspector        │
│              │                    │                          │                  │
│ Мои Cases    │ unread · SLA       │ identity · assignment    │ Case             │
│ Команда      │ preview · owner    │ messages / events        │ Пользователь     │
│ Все диалоги  │ channel · failure  │ composer                 │ Данные / Events  │
│ Контроль     │                    │                          │ Knowledge / Apps │
│ Проверка     │                    │                          │ Activity         │
└──────────────┴────────────────────┴──────────────────────────┴──────────────────┘
```

- Support nav — постоянная навигация продукта, не часть выбранной беседы.
- Inbox pane — рабочая очередь оператора или Saved View.
- Middle pane — единственное место публичной переписки.
- Inspector — контекст, инструменты и чувствительные данные, показанные по
  permission.
- Inspector должен сворачиваться и запоминать выбранную вкладку/ширину на
  пользователя, но не скрывать критические conversation states.
- Table mode является альтернативным представлением той же query, а не второй
  независимой сущностью и не отдельным источником данных.

## 2. Навигация, inbox и очереди

### Базовые разделы

Рекомендуемая навигация frontend:

```text
Поддержка
├── Мои обращения
├── Неназначенные моей команды
├── Все обращения
├── Все диалоги
├── Сохранённые представления
├── Проверка качества       [permission]
├── Операционный обзор      [permission]
└── Настройки поддержки     [permission]
```

Cases и Conversations нельзя сливать в один термин. Case — рабочая проблема и
ответственность; Conversation — конкретный канал/история сообщений. Из Case
оператор переключается между связанными Conversations; «Все диалоги» позволяет
найти переписку, ещё не ставшую Case.

### Строка inbox

В обычном chat layout строка должна содержать только данные, влияющие на выбор
следующей работы:

- имя/безопасный идентификатор пользователя;
- last safe preview и время;
- actor-relative unread count и первый непрочитанный marker;
- Case status и сторона ожидания;
- assignee/team;
- priority и ближайший SLA deadline/countdown;
- channel/Conversation count, если Case объединяет несколько диалогов;
- компактные признаки: failed delivery, AI suspended, attachment needs attention;
- draft marker для текущего оператора.

Intercom позволяет сортировать inbox по Waiting since, Last activity, Next SLA,
reply SLA, priority и custom attributes, причём SLA bubble меняет значение в
соответствии с выбранной сортировкой.
([Intercom: Inbox Sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting))
Zendesk также показывает SLA time left в ticket views и использует SLA breach в
автоматизации и отчётности.
([Zendesk: Using SLA policies](https://support.zendesk.com/hc/en-us/articles/5604663490458-Using-SLA-policies))

Отсюда следует правило Lola: строка не должна одновременно показывать пять
конкурирующих таймеров. Она показывает **таймер, по которому сейчас отсортирован
список**, а остальные доступны в inspector.

### Search, filters, Saved Views

Intercom разделяет глобальный поиск и поиск внутри текущего view, поддерживает
structured filters по assignee, team, status, user, company, topic и attributes;
поиск по ID/email имеет отдельную понятную семантику.
([Intercom: Inbox search and filter](https://www.intercom.com/help/en/articles/6516006-inbox-search-and-filter))

Для Lola:

- `⌘/Ctrl+K` — command/search palette: Case ID, Conversation ID, Message,
  external user ID, email/телефон при наличии permission;
- поиск в текущем списке всегда сохраняет и явно показывает scope текущего View;
- filter chips отображают все применённые ограничения;
- Saved View хранит только разрешённый backend filter vocabulary, sort и columns;
- при потере permission view не должен молча расширяться: показать, какие поля
  больше недоступны, и запросить безопасную пересборку;
- keyset pagination, cursor binding и result authority остаются backend
  обязанностью.

## 3. Заголовок Conversation

Header должен отвечать на вопрос: «с кем, в каком диалоге, кто отвечает и что
мешает продолжить?»

Постоянная часть:

- End User display name + verified/canonical identifier;
- Conversation title/channel и link/counter других Conversations Case;
- current Case status/side waiting;
- claimant/assigned operator/team;
- SLA risk/next deadline;
- AI mode (`Lola отвечает`, `ожидается поддержка`, `оператор отвечает`,
  `AI приостановлен`);
- компактные действия уровня Conversation/Case: claim, transfer, priority,
  close/reopen, pause AI, overflow menu.

Не следует показывать `online`, `AVAILABLE` и `assigned` одной зелёной точкой.
Zendesk routing отдельно учитывает availability/status, capacity, skills, queue
и SLA/priority; unified agent status определяет, какую новую работу можно
назначить.
([Zendesk: About omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing))
Intercom teammate presence, напротив, лишь сообщает, что коллега активно смотрит
Conversation, и исчезает при переключении вкладки.
([Intercom: Conversations FAQs](https://www.intercom.com/help/en/articles/8838326-conversations-faqs))

Рекомендация:

- availability оператора — в глобальном profile/status control;
- assignment — в header Case;
- viewers/typers — рядом с участниками как краткоживущая подсказка;
- AI Suspension — устойчивый state chip и, когда активен, подробный banner;
- delivery failure — у конкретного сообщения плюс агрегированный attention icon
  в строке inbox, но не глобальный «offline» статус пользователя.

## 4. Лента Conversation и системные события

### Сообщения

Каждое сообщение должно иметь неизменяемую presentation identity автора:

- Lola;
- End User;
- конкретный Support Operator: snapshot имени и аватара на момент отправки;
- Scenario/System — визуально не имитирует человека;
- Internal Note — отдельный приватный визуальный тип.

Zendesk располагает chat/messaging comments от старых к новым, с новыми снизу,
чтобы сохранить естественный порядок переписки.
([Zendesk: About the Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace))

Лента Lola должна:

- сохранять scroll anchor при загрузке старых страниц;
- при входе ставить viewport на `firstUnreadOrdinal`, а не безусловно вниз;
- не автоскроллить оператора, который читает историю: показывать кнопку «Новые
  сообщения (N)»;
- группировать соседние сообщения одного автора, сохраняя доступное имя автора;
- показывать точный timestamp по hover/focus и полный timestamp в доступном
  описании;
- поддерживать attachment-only Message;
- не вставлять transport/realtime debug events в публичную ленту.

### События

Intercom по умолчанию фокусирует thread на сообщениях, а assignment, tags, AI и
SLA changes позволяет отдельно включить как conversation event timeline.
([Intercom: Conversation events in the Inbox](https://www.intercom.com/help/en/articles/13334840-conversation-events-in-the-inbox))

Lola следует разделить:

- **важные пользовательские system announcements** в ленте: передача Lola →
  человек, возобновление Lola, закрытие/возобновление диалога;
- **операционную Activity timeline** в inspector: assignment, SLA, routing,
  policy version, retries, commands;
- **техническую диагностику** — только permission-guarded detail, не сырые payload
  в UI оператора.

## 5. Read, unread, typing, viewing и delivery

Это пять разных state machines.

### Read/unread

Intercom намеренно не всегда отмечает первое сообщение пользователя прочитанным
от простого просмотра: оно становится Seen, когда сотрудник начинает отвечать;
после первого ответа последующие сообщения могут отмечаться при входе в composer.
Это продуктовая политика управления ожиданиями, а не универсальное свойство
socket delivery.
([Intercom: Real-time messaging explained](https://www.intercom.com/help/en/articles/258-real-time-messaging-explained))

Для Lola normative backend plan уже задаёт более строгую модель: личная CMS read
position двигается после фактической видимости во viewport, а публичный human
receipt относится только к claimant Case Escalation. Frontend должен реализовать
именно её:

- socket receipt не означает read;
- элемент должен быть реально rendered и видим;
- ACK — monotonic high-water, batched/debounced;
- hidden tab не двигает read position;
- reconnect сначала восстанавливает watch, затем сверяется с REST;
- local optimistic unread можно использовать для плавности, но после reconcile
  побеждает authoritative projection.

### Typing и viewing

Intercom показывает customer typing оператору, а typing оператора клиенту —
только после того, как сотрудник уже отправил первый ответ, чтобы не создавать
непонятное ожидание.
([Intercom: Real-time messaging explained](https://www.intercom.com/help/en/articles/258-real-time-messaging-explained))

Для Lola:

- typing имеет TTL и generation; stale stop/start после reconnect игнорируется;
- показывается только для selected Conversation;
- watcher/typing предупреждает о коллизии, но не блокирует composer;
- hard ownership задаётся assignment/versioned command;
- End User, Lola и Support Operator имеют разные подписи typing;
- Lola typing выводится из leased AssistantTurn state, не из frontend timer;
- viewing никогда не повышает operator availability и не назначает Case.

### Delivery

Zendesk отображает возле сообщения `Sent`, `Read` и `not delivered`, а ошибку —
у соответствующего сообщения.
([Zendesk: Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace))

Для Lola:

- `ACCEPTED`: сервер принял durable intent;
- `DELIVERED`: public client подтвердил локальное принятие;
- `READ`: durable end-user high-water прошёл ordinal сообщения;
- `FAILED`: terminal failure с безопасной причиной;
- «повторить» доступно только при server-provided allowed action и использует
  idempotent retry semantics;
- unknown outcome показывается как «Проверяем результат», затем REST reconcile;
- status не выводится одним цветом: нужен текст/accessible name;
- агрегированный delivery problem попадает в inbox row, но подробность остаётся
  у Message.

## 6. Composer: публичный ответ, note, macro и knowledge

### Явные режимы

Zendesk делает Internal note приватным comment type: его видят сотрудники, но не
End User; note поддерживает format, attachment и emoji.
([Zendesk: Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace))
Февральский incident Zendesk, при котором composer ошибочно открывался в режиме
Internal Note вместо public reply, показывает реальный риск неявного переключения
режима.
([Zendesk post-mortem: composer defaulting to private comments](https://support.zendesk.com/hc/en-us/articles/10352566064154-Post-mortem-February-11-2026-Agent-Workspace-All-pods-Agent-Workspace-Composer-defaulting-to-private-comments))

Поэтому в Lola:

- `Ответ пользователю` и `Внутренняя заметка` — два явно названных режима;
- цвет, иконка и placeholder дополняют, но не заменяют название режима;
- смена Conversation восстанавливает draft **того же режима**;
- attachments привязаны к draft mode и никогда не переносятся между public/note;
- send button содержит результат: «Отправить пользователю» / «Добавить заметку»;
- при любом auto-recovery режим перепроверяется до разблокировки Send.

### Macros

Zendesk вставляет macro в comment, после чего оператор может отредактировать
текст до отправки; наиболее часто использованные macros поднимаются наверх,
поиск доступен из menu и через `/` shortcut.
([Zendesk: Using macros to update tickets](https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets))

Для Lola macro:

- ищется по `/` и отдельной кнопке;
- сначала показывает relevant/approved варианты для Case context;
- server-rendered result вставляется как editable draft, но не отправляется
  автоматически;
- показывает название и revision macro во вторичном UI;
- изменение исходного draft делает translation preview stale;
- применение macro может предложить связанные Case actions, но каждое остаётся
  отдельной подтверждаемой командой.

### Internal Knowledge

Zendesk context panel умеет искать, linking и quoting knowledge content прямо в
ticket; администратор может задавать default filters по brand/language для
конкретного contextual workspace.
([Zendesk: Configuring the context panel](https://support.zendesk.com/hc/en-us/articles/4408828503450-Configuring-the-context-panel-in-the-Zendesk-Agent-Workspace),
[Zendesk: Setting up contextual workspaces](https://support.zendesk.com/hc/en-us/articles/4408833498906-Setting-up-contextual-workspaces))

Lola Knowledge tab должен:

- искать только published material, разрешённый текущему actor/Case;
- учитывать Case language/topic/product как видимые filters, не скрытые магические
  ограничения;
- давать `Открыть`, `Вставить ссылку`, `Вставить цитату`, но не копировать полное
  тело документа в Conversation projection;
- показывать source/revision/locale и revoke state;
- сохранять operator draft при открытии статьи.

## 7. Переводы

### Подтверждённые паттерны

Intercom переводит inbound сообщения в preferred language сотрудника, outbound
ответ — обратно в язык клиента. У сообщения есть indication исходного языка и
переключатель original/translated; language menu находится в header. Переводы
для дополнительных языков создаются on demand.
([Intercom: AI Inbox Translations](https://www.intercom.com/help/en/articles/10545610-how-to-use-ai-inbox-translations))

Zendesk определяет язык End User по недавним сообщениям; длина и количество
сообщений влияют на надёжность detection. При различии языков показывает banner
и позволяет оператору включить translation; для исходящего текста ожидает язык
профиля оператора. В event log сохраняются original и translated outbound
versions.
([Zendesk: Understanding conversation translation](https://support.zendesk.com/hc/en-us/articles/4408832500506-Understanding-conversation-translation))

### Рекомендация для Lola

Текущая Lola translation vertical уже сильнее базовых паттернов конкурентов:
preview-first outbound, manual conflict resolution, edit-before-send,
fail-closed provider/budget behavior и отдельный permission для bypass. Это надо
сохранить в полном workspace.

#### Inbound

- рабочий режим Conversation: `Перевод` / `Оригинал` на уровне всей ленты;
- у каждого translated Message доступен локальный toggle без смены всей ленты;
- подпись: «Переведено с испанского» + state/error, без provider/model для
  пользователя без `project.translation.read`;
- original всегда доступен авторизованному оператору, но не дублируется вторым
  постоянным пузырём: иначе лента вдвое длиннее;
- language source явно показывает `manual / profile / recent messages / case /
unknown`;
- короткий/неопределённый текст не должен автоматически закреплять ложный язык.

#### Outbound

- оператор пишет на Working Locale;
- перед первой отправкой или после stale source открывается editable translated
  preview;
- preview показывает направление `Русский → Испанский`, target source и glossary
  hits/warnings;
- Send доставляет выбранную translated version атомарно; после отправки оператор
  видит свой original и доступный delivered translation;
- provider/budget failure не отправляет original автоматически;
- bypass — отдельное permission-guarded действие с причиной и ясным
  предупреждением, кто получит какой текст;
- смена языка, macro edit или source edit инвалидирует старый preview;
- attachment/image content V1 не объявляется переведённым: интерфейс прямо
  сообщает это.

#### Локализация самого CMS

Working Locale ответа, locale End User и язык интерфейса CMS — три разных
настройки. Их нельзя связывать одним dropdown. Timestamp по умолчанию показывается
в timezone оператора, но inspector содержит timezone пользователя; Intercom
также даёт переключатель customer local time.
([Intercom: The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained))

## 8. AI → человек и обратно

Intercom сообщает handoff клиенту текстом, может собрать дополнительный контекст
перед передачей, а публичный ответ сотрудника прекращает Fin; простое
переназначение Conversation не гарантирует остановку AI.
([Intercom: Use Fin in Workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows),
[Intercom: Escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules))

Для Lola:

- `Assignment`, `claimant` и `AI Suspension` отображаются раздельно;
- standalone `Приостановить AI` остаётся в header;
- `Приостановить AI и отправить` остаётся явным атомарным composer action;
- после takeover нужен persistent state banner: кто, причина, срок,
  `Возобновить`, `Продлить`, `История` по permission;
- пользователь получает доступное system announcement о передаче человеку и
  handback, но не внутреннюю причину/срок;
- watcher не становится claimant;
- reply без claim не должен случайно создать двух публичных responders;
- при collision/`409` текст, mode и READY attachments сохраняются; UI перечитывает
  allowed actions и предлагает повторить осознанно;
- AI suggestion/Copilot, если появится, визуально отделяется от Lola как публичного
  автора: suggestion никогда не выглядит отправленным сообщением.

## 9. Вложения

LiveChat показывает выбранные файлы до отправки, поддерживает picker, paste и
drag-and-drop, image lightbox и отдельно предупреждает об опасных customer
attachments.
([LiveChat: Share files on chat](https://www.livechat.com/help/sharing-files-over-livechat/))
Intercom сканирует uploads, quarantines заражённые файлы и использует expiring
URLs; image lightbox поддерживает zoom/pan.
([Intercom: Control attachments](https://www.intercom.com/help/en/articles/2339426-control-how-attachments-are-uploaded-and-used),
[Intercom: The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained))
Zendesk показывает picker и drag-and-drop, фиксированные file type/size limits,
secure downloads и malware blocking до delivery/download.
([Zendesk: Agent Workspace for messaging](https://support.zendesk.com/hc/en-us/articles/4408821905434-Agent-Workspace-for-messaging),
[Zendesk: Malware scanning for messaging](https://support.zendesk.com/hc/en-us/articles/10561175103514-Announcing-malware-scanning-for-messaging-channels),
[Zendesk: Secure chat attachments](https://support.zendesk.com/hc/en-us/articles/4408842669594-Allowing-secure-chat-attachments-in-the-Zendesk-Agent-Workspace))

### Upload tray Lola

До выбора интерфейс показывает разрешённые типы/размер/количество. После выбора
каждая карточка проходит frontend/backend states:

```text
LOCAL → UPLOADING → UPLOADED → SCANNING → READY
                   ↘ FAILED / REJECTED / CANCELLED
```

- filename, type, size, progress и cancel видимы до Send;
- retry начинает новый безопасный upload, а не переиспользует unknown object;
- Send доступен только для READY selection;
- уход между Conversations сохраняет READY selection по Conversation и draft
  mode;
- thumbnail не означает scan success;
- image lightbox: zoom, pan, rotate при необходимости, download по новому grant;
- document card: safe filename, type, size, scan/extraction state, доступное
  download action;
- signed URL никогда не сохраняется в state/router/storage как identity;
- tombstoned/revoked/inaccessible file имеет устойчивую карточку без broken URL;
- malware override — отдельное чувствительное permission и audit action, не
  обычная кнопка оператора;
- drag-and-drop имеет picker/button альтернативу: WCAG 2.2 требует single-pointer
  alternative для dragging.
  ([W3C: Understanding Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))

## 10. Inspector: откуда брать информацию о пользователе

### Что подтверждают продукты

Zendesk customer context включает профиль, interaction history, pages viewed и
device information; администратор может подключать дополнительные profiles и
events из внешних приложений.
([Zendesk: Viewing customer context](https://support.zendesk.com/hc/en-us/articles/4408829170458-Viewing-customer-context-for-user-history-and-device-information))

LiveChat Customer Details показывает general info, timezone/location, pre/post
chat survey, tickets, browser/device и integration data; widgets можно скрывать
и переупорядочивать.
([LiveChat: Customer Details](https://www.livechat.com/help/customer-details/))

Intercom прямо описывает tracked user/company attributes и показывает некоторые
system attributes в conversation sidebar.
([Intercom: Tracking user data](https://www.intercom.com/help/en/articles/320-tracking-user-data-in-intercom))

### Source-of-truth policy Lola

Inspector не должен собирать user context из DOM widget, последних сообщений или
непроверенного realtime payload. Рекомендуемая иерархия:

1. **Canonical End User identity/profile projection** backend.
2. **Project-approved profile attributes** с label, value, source, updatedAt и
   sensitivity classification.
3. **Bounded Product Events** через разрешённый Event catalog/query.
4. **Current Interaction Session** для ephemeral page/device/session state.
5. **User Memory** как отдельная AI-derived projection с provenance, а не «факт
   профиля».
6. **External integrations** через source-labelled cards с freshness/error.
7. **AI analysis** только по явно выбранному bounded scope и после cost estimate.

### Вкладки inspector

- **Case** — category, workflow, priority, assignment, SLA, linked Conversations,
  evidence, allowed actions.
- **Пользователь** — canonical identity и permitted operational attributes.
- **Данные** — profile fields с source/freshness; sensitive section отдельно.
- **События** — bounded timeline с filter/range, без произвольного raw event dump.
- **Knowledge** — поиск published internal articles.
- **Integrations** — status + deep links/actions по permission.
- **Activity** — assignment/SLA/routing/delivery/policy timeline.

Каждое поле отвечает на четыре вопроса: что это, откуда взялось, насколько свежее
и можно ли ему доверять. Скрытое permission-поле не оставляет label/placeholder,
по которому можно догадаться о значении.

## 11. Assignment, роли и права

### Паттерны продуктов

Intercom ограничивает conversation access вариантами: всё, назначенные самому,
назначенные своим teams или всё кроме заданных teams. Ограничение применяется к
Inbox, reports и contact profiles; недоступный content redacted.
([Intercom: Limit access to conversations](https://www.intercom.com/help/en/articles/4707721-limit-teammates-access-to-conversations))
Intercom также разделяет permissions для dashboard, reassignment, participants,
merge, delete replies/notes, views, reports, knowledge и presence settings.
([Intercom: Teammate permissions](https://www.intercom.com/help/en/articles/176-teammate-permissions-how-to-control-workspace-access))

Zendesk отделяет End User, Agent, Admin и Owner, а custom roles задают ticket
scope, public/private comments, profile edits, assignment, views, macros,
redaction и malware management. End User не имеет agent/admin surfaces и пишет
только публично.
([Zendesk: Standard user roles](https://support.zendesk.com/hc/en-us/articles/4408883763866-Understanding-standard-user-roles-for-Zendesk-Support),
[Zendesk: Custom roles](https://support.zendesk.com/hc/en-us/articles/4408882153882-Creating-custom-roles-and-assigning-agents))

### Рекомендация для Lola

Не кодировать frontend по role name (`SUPPORT`, `LEAD`, `ADMIN`). Использовать:

- current Project Membership;
- exact permission codes;
- target authority текущего Case/Conversation;
- server-provided `allowedActions` для изменяемого состояния;
- version/expectedVersion для command.

Frontend guards нужны для UX, но backend повторно авторизует каждый read/watch/
command. Минимальная surface matrix:

| Surface/action                        | End User         | Support Operator                   | Support Lead         | Project Admin        |
| ------------------------------------- | ---------------- | ---------------------------------- | -------------------- | -------------------- |
| Публичная история своего Conversation | да               | по target authority                | по scope             | по permission        |
| Internal Notes                        | нет              | read/create по authority           | да по scope          | по permission        |
| Operational Attributes/Events         | нет              | bounded permitted                  | broader permitted    | по permission        |
| Claim self                            | нет              | если server allowed                | да                   | по permission        |
| Transfer self/team                    | нет              | ограниченно                        | да с reason          | по permission        |
| Lead override/availability другого    | нет              | нет                                | permission + reason  | по permission        |
| QA reviews                            | только свой CSAT | свои received reviews при политике | review scope         | configuration        |
| Reports                               | нет              | личные/разрешённые                 | team/project         | configuration        |
| Knowledge publish                     | нет              | обычно read                        | manage/publish       | configuration        |
| Malware override / redaction          | нет              | обычно нет                         | отдельный permission | отдельный permission |

В UI permission states различаются:

- **не существует в DOM**, если раскрывает чувствительную возможность;
- **disabled с объяснением**, если функция известна, но временно неприменима
  из-за state/capacity/version;
- **read-only state**, если пользователю разрешено видеть, но не менять;
- `403` после revoke очищает sensitive projection и watch, а не оставляет stale
  данные на экране.

## 12. Availability, assignment offer и capacity

Zendesk routing оценивает agent status, channel capacity, skills, queues,
priority/SLA; highest-spare-capacity и round-robin всё равно требуют eligible
status и свободной capacity.
([Zendesk: Omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing),
[Zendesk: Capacity rules](https://support.zendesk.com/hc/en-us/articles/4776409839770-Creating-capacity-rules-to-balance-agent-workloads))
LiveChat разделяет автоматическое назначение и manual selection; при manual
selection один агент атомарно забирает queued chat, после чего остальные уже не
могут его взять.
([LiveChat: Understanding chat assignment](https://www.livechat.com/help/chat-assignment/))

Lola operator chrome:

- глобальный availability selector: `AVAILABLE`, `BUSY`, `AWAY`, `DRAINING`,
  `OFFLINE` с понятным последствием;
- active load/capacity рядом, но без обещания, что socket online = AVAILABLE;
- `DRAINING`: «Новые обращения не назначаются; завершите N текущих»;
- reservation offer — отдельный time-bounded dialog/banner с Case summary,
  deadline и safe explanation;
- accept/decline idempotent, timeout устойчив к background tab;
- claim button показывает текущую team/owner и атомарный результат;
- transfer требует target + bounded reason; после успеха draft сохраняется или
  явно передаётся согласно policy;
- capacity/eligibility explanation для оператора безопасная; full candidate
  diagnostics только лиду.

## 13. Раздел «Проверка качества»

Zendesk QA даёт Conversations view с filters/sort, review всей Conversation или
конкретного Message/Agent, weighted scorecard, comments и notification
проверенному сотруднику. Агент видит received reviews, ratings/comments и может
работать с dispute по правилам продукта.
([Zendesk: Using the Conversations view](https://support.zendesk.com/hc/en-us/articles/7043661945370-Using-the-Conversations-view),
[Zendesk: QA as an agent](https://support.zendesk.com/hc/en-us/articles/7043760283546-Using-Zendesk-QA-as-an-agent))
Intercom Monitors используют filter-defined review queues, scorecard,
assignment и optional auto-review.
([Intercom: Monitors explained](https://www.intercom.com/help/en/articles/13584513-monitors-explained))
Zendesk AI conversation logs позволяют анализировать весь автоматический диалог,
конкретное сообщение, actions и API integration details.
([Zendesk: Reviewing AI agent conversation logs](https://support.zendesk.com/hc/en-us/articles/8357749580186-Reviewing-conversation-logs-for-AI-agents))

### Рекомендуемая IA

```text
Проверка качества
├── Очередь на проверку
├── Назначено мне
├── Завершённые проверки
├── Мои отзывы              [operator]
├── Калибровка              [lead/reviewer]
└── Настройки scorecards    [permission]
```

### Review workspace

- слева — filterable Conversation queue;
- центр — read-only Conversation с original/translation toggle и выбором
  конкретного Message/оператора;
- справа — scorecard categories, evidence link, comment, overall decision;
- review привязан к immutable conversation/message versions либо показывает,
  что после snapshot появились новые сообщения;
- private notes и sensitive fields включаются в review только по отдельной
  policy/permission;
- reviewer видит actor identities, но не лишние customer PII;
- AI review показывает confidence/evidence и не маскирует human reviewer;
- оператор получает review feedback, может подтвердить ознакомление и, если
  policy допускает, открыть dispute;
- calibration отделена от production score, чтобы обучение reviewers не меняло
  метрики сотрудников.

Минимальный scorecard: correctness, policy/security, diagnosis, communication,
translation quality, resolution/next step, use of internal knowledge, correct
AI handoff. Категории и веса являются versioned configuration; UI не зашивает их
в код.

## 14. Операционный обзор и статистика

### Что подтверждают продукты

Intercom real-time dashboard показывает active teammates, unassigned,
waiting-for-first-reply, open/idle/snoozed, SLA miss rate, first response time,
closed conversations и CSAT; teammate view содержит status, away reason,
time-in-status, last seen и capacity.
([Intercom: Monitoring workload and capacity](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity))
Его reporting templates отдельно покрывают Conversations, CSAT, responsiveness,
SLA, team inbox, teammate performance, tickets, Fin и Copilot; создание отчётов
защищено permission.
([Intercom: Reports explained](https://www.intercom.com/help/en/articles/200-intercom-reports-explained))

Zendesk live dashboard позволяет drill-down от статусов к agent workload и
capacity по каналам, а изменение чужого статуса требует admin/custom permission.
([Zendesk: Live agent status and activities](https://support.zendesk.com/hc/en-us/articles/4422485166746-Seeing-live-agent-status-and-activities-with-Explore))

LiveChat reports включают total/missed chats, satisfaction, response time,
duration, agent activity и staffing prediction.
([LiveChat: Reporting options](https://www.livechat.com/help/reporting-options-available-in-livechat/))

### Разделы Lola

#### 14.1. Операционный обзор — live, actionable

- incoming/open/unassigned/oldest unassigned;
- waiting first human reply / waiting next reply;
- SLA at risk / breached и duration;
- Cases without eligible operator;
- available/busy/away/draining/offline operators;
- load/capacity по Team/language/topic;
- delivery failures, reconnect pressure, attachment scan backlog;
- AI requested/handoff pending/suspended;
- operational alerts with owner/state.

Каждая карточка должна иметь timestamp freshness и drill-down в exact filtered
View. Live dashboard не заменяет authoritative list: при stale data показывает
«обновлено N минут назад», а не точное псевдореальное число.

#### 14.2. Аналитика — исторические тренды

- first response, next response, queue wait, handling и resolution;
- SLA hit/miss/fixed;
- transfer/reopen rate;
- backlog age distribution, не только average;
- CSAT и response rate;
- volume/resolution по queue/team/category/language/channel;
- operator load и capacity utilization;
- AI containment/verified resolution/escalation и human recovery;
- translation usage/failure/bypass и quality feedback;
- attachment upload/scan/extraction failure;
- macro/knowledge usage и связь с resolution/QA;
- cost/AI allowance — отдельно от human performance.

Показывать медиану и percentile/distribution там, где среднее скрывает хвост.
Определения metric, timezone, filters и data freshness доступны рядом. Report
access и underlying conversation drill-in независимо проверяют permission;
Intercom также разделяет view/explore/edit report levels.
([Intercom: Report sharing and access controls](https://www.intercom.com/help/en/articles/9867813-report-sharing-and-access-controls))

#### 14.3. Team Lead Control Center

Lead получает не «ещё один график», а operational action table:

- breached/at-risk Cases;
- old unassigned;
- no eligible operator;
- frequent transfers/reopens;
- operator overload/availability exceptions;
- alert owner/ack/close;
- causal timeline: queue → routing → offer → assignment → waits → delivery;
- versioned policy revisions used for decision;
- permission-guarded reassign/priority/availability intervention с reason и
  expectedVersion.

## 15. Keyboard и accessibility

Intercom использует `⌘/Ctrl+K` как discoverable action menu и прямые shortcuts
для navigation/composer/actions; table layout имеет отдельный shortcut.
([Intercom: The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained))
Zendesk macros доступны через `/` в comment.
([Zendesk: Using macros](https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets))

### Keyboard model Lola

- `⌘/Ctrl+K` — command palette и справка shortcuts;
- `j/k` либо documented arrows — next/previous inbox item, только вне text input;
- `r` — focus public reply;
- `n` — focus Internal Note;
- `/` в composer — macros;
- `⌘/Ctrl+Enter` — send текущего явно названного mode;
- `Esc` — закрыть menu/dialog/lightbox, не очищая draft;
- shortcut actions не срабатывают при IME composition и в editable content;
- character shortcuts можно отключить/remap согласно WCAG 2.1.4;
- все команды также доступны кнопкой/menu.

WCAG 2.2 требует keyboard access, видимый и не перекрытый focus, доступные status
messages, минимум target size 24×24 CSS px либо достаточный spacing и
альтернативу drag operation.
([W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
[W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html),
[W3C: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))

### Message log

Для append-only chat history подходит `role="log"`: WAI-ARIA 1.2 задаёт ему
implicit `aria-live="polite"`. Не следует делать всю ленту `assertive`, иначе
каждый realtime update будет перебивать работу screen reader.
([W3C: WAI-ARIA 1.2 `log`](https://www.w3.org/TR/wai-aria/#log))

- новое selected Conversation объявляется заголовком, не чтением всей истории;
- incoming messages politely announced с author и кратким text/attachment label;
- typing не объявляется на каждый keystroke;
- upload/delivery errors используют accessible status/alert по срочности;
- `aria-busy` снимается после page merge/reconciliation;
- infinite history имеет явную кнопку «Загрузить предыдущие» как доступный
  fallback; APG feed pattern требует осторожно управлять focus и dynamic load.
  ([W3C APG: Feed Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/feed/))

### Проверки

- keyboard-only полный flow: claim → прочитать → original/translation → macro →
  preview → attachment → send → close;
- screen reader: unread start, author, note/public distinction, delivery state,
  system handoff, upload progress/error;
- 200% text zoom и reflow;
- light/dark, high contrast, reduced motion;
- focus после dialog/menu/lightbox возвращается к trigger;
- sticky composer/header не закрывают focused history/control;
- information never relies only on color/avatar/icon.

## 16. Responsive behavior

Нельзя уменьшать четыре desktop panes до 390 px.

### Tablet 768–1279 px

- support nav сворачивается;
- inbox и Conversation работают как split view;
- inspector открывается overlay drawer, но не уничтожает scroll/draft;
- table mode сокращает secondary columns через column chooser.

### Mobile 320–767 px

Устойчивый route stack:

```text
Views → Inbox list → Conversation → Inspector detail
```

- browser Back идёт на предыдущий уровень без потери draft;
- header показывает user, back, primary state и overflow;
- composer sticky, но не закрывает focused control/keyboard;
- translation/AI/assignment details раскрываются sheets;
- inspector — отдельный screen, не узкая боковая колонка;
- attachment tray горизонтально прокручивается внутри себя либо складывается
  вертикально, не расширяя viewport;
- новый Message indicator находится над composer;
- touch targets проектировать ближе к 44×44 CSS px как product target, хотя
  WCAG 2.2 AA minimum ниже.

## 17. Что взять у LiveChat, а что не копировать

### Взять

- ясную структуру `chat list → chat feed → Customer Details`;
- `my / queued / supervised` как понятные рабочие группы;
- быстрый transfer и supervisor takeover;
- private hints/internal collaboration;
- customer details и integration widgets рядом с диалогом;
- picker/paste/drag-and-drop + preview для файлов;
- reports по missed chats, response time, activity и staffing.

Источники:
[LiveChat Chats](https://www.livechat.com/help/how-to-chat-section/),
[assignment](https://www.livechat.com/help/chat-assignment/),
[transfers and supervision](https://www.livechat.com/help/in-chat-cooperation-transfers-and-supervision/),
[Customer Details](https://www.livechat.com/help/customer-details/),
[reports](https://www.livechat.com/help/reporting-options-available-in-livechat/).

### Не копировать буквально

- coarse roles Owner/Admin/Agent недостаточны для granular Project-scoped Lola
  IAM;
- socket presence нельзя использовать как operator availability;
- «sneak peek» текста до отправки пользователя создаёт отдельные privacy и
  expectation риски и не нужен без явного продуктового решения;
- LiveChat chat/thread lifecycle нельзя накладывать на Lola Case/Conversation
  domain;
- один manual queue не заменяет skills/capacity/SLA routing;
- permanent-style attachment links не соответствуют Lola signed-grant model.

## 18. Приоритеты frontend-спецификации

### P0 — foundation и безопасный daily operator flow

1. Route-level Support workspace и navigation.
2. Authoritative Cases/All Conversations list + selected projection.
3. Inbox row: unread, safe preview, assignment, SLA, delivery attention.
4. Middle pane: identity, scroll/unread, delivery states, realtime reconcile.
5. Composer public/note separation, drafts, version conflict recovery.
6. Existing Translation и AI Suspension composition.
7. Inspector Case/User/Data/Activity с exact permissions.
8. Assignment/claim/transfer allowed actions.
9. Keyboard, responsive и screen-reader baseline.

### P1 — productivity

1. Attachments end-to-end.
2. Macros as editable drafts.
3. Internal Notes production flow.
4. Internal Knowledge search/link/quote.
5. Saved Views, global search, table mode.
6. Presence/watchers/typing.
7. SLA detail and operator capacity/availability.

### P2 — lead, QA и analytics

1. Operational overview with drill-down.
2. Team Lead Control Center and causal timeline.
3. QA review queue, scorecards, received reviews, calibration.
4. Historical reports and metric definitions.
5. AI conversation review/evaluation and translation quality feedback.

P2 не означает «неважно»: эти surfaces требуют отдельной information
architecture и permission matrix, но не должны раздувать P0 middle pane.

## 19. Вопросы, которые frontend-спека не должна выдумывать

До фиксирования acceptance criteria нужны versioned backend/product решения:

- Case↔Conversation cardinality и selection contract;
- claimant, assignment и AI Suspension transition matrix;
- actor-relative unread/read summary;
- exact message author snapshot;
- attachment types/limits/grants/scan/extraction states;
- server-provided allowed actions и `409` receipts;
- support permissions и target-authority rules;
- availability/capacity/offer projections;
- SLA deadlines, pause reasons и side waiting;
- QA snapshot/version, scorecard schema и dispute policy;
- metric definitions, timezone, freshness и report/drill-in authorization;
- profile attributes/event catalog, sensitivity и masking;
- retention/legal hold/tombstone behavior visible to CMS.

Frontend может описать presentation и recovery каждого state, но не должен
самостоятельно создавать domain truth.

## 20. Проверяемые UX-критерии для будущей спеки

- Оператор из «Мои обращения» открывает первый unread, понимает owner/AI/SLA и
  отвечает без перехода на другую страницу.
- Case с несколькими Conversations не допускает отправку не в выбранный диалог.
- Public reply и Internal Note различимы текстом до и после отправки; attachment
  не переносится между режимами.
- У каждого human Message видны snapshot имени/аватара и delivery status.
- Original/translation доступны на уровне Message и Conversation; preview можно
  исправить; failure не отправляет original автоматически.
- Watcher/typing предупреждают, assignment/claim hard-block определяет backend;
  `409` не теряет draft и READY attachments.
- Reload/reconnect не создаёт duplicate send и восстанавливает authoritative
  unread/delivery/assignment.
- User context показывает source/freshness и скрывает недоступные fields без
  утечки labels/value/count.
- Operator Availability, CMS online и End User presence показаны разными labels.
- Failed delivery можно безопасно reconcile/retry без duplicate.
- Вложения имеют upload/scan/ready/failure/tombstone states, picker alternative и
  grant-based open/download.
- Lead из dashboard drill-down открывает exact filtered Cases и видит freshness.
- Reviewer оценивает Conversation или конкретного оператора/message по versioned
  scorecard; оператор видит разрешённый feedback.
- Все actions доступны keyboard; focus не скрыт sticky UI; new messages и
  failures корректно объявляются screen reader.
- 1440×1000, 1024×768 и 390×844 покрыты light/dark visual QA без потери core
  flow.

## Первоисточники

### Lola

- `docs/specs/support-platform/00-master.ru.md`
- `docs/specs/support-platform/chat-experience-development-plan.ru.md`
- `docs/specs/support-platform/03-durable-conversation-delivery.ru.md`
- `docs/specs/support-platform/04-authoritative-workspace-read.ru.md`
- `docs/specs/support-platform/05-operator-availability.ru.md`
- `docs/specs/support-platform/07-manual-case-assignment.ru.md`
- `docs/specs/support-platform/08-sla-policy-shadow-clocks.ru.md`
- `docs/specs/support-platform/09-team-lead-control-center.ru.md`
- `docs/specs/support-platform/15-macros-internal-notes.ru.md`
- `docs/specs/support-platform/16-internal-knowledge.ru.md`

Все пути выше относятся к
`/Users/alxxsck/Documents/Lola_backend/docs/specs/support-platform/`.

### Intercom

- [The Inbox explained](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)
- [Inbox search and filter](https://www.intercom.com/help/en/articles/6516006-inbox-search-and-filter)
- [Inbox Sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting)
- [Real-time messaging explained](https://www.intercom.com/help/en/articles/258-real-time-messaging-explained)
- [AI Inbox Translations](https://www.intercom.com/help/en/articles/10545610-how-to-use-ai-inbox-translations)
- [Use Fin AI Agent in Workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)
- [Limit teammates' access to conversations](https://www.intercom.com/help/en/articles/4707721-limit-teammates-access-to-conversations)
- [Teammate permissions](https://www.intercom.com/help/en/articles/176-teammate-permissions-how-to-control-workspace-access)
- [Monitoring workload and capacity](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity)
- [Reports explained](https://www.intercom.com/help/en/articles/200-intercom-reports-explained)

### Zendesk

- [About the Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace)
- [Using the context panel](https://support.zendesk.com/hc/en-us/articles/4408836526362-Using-the-context-panel)
- [Viewing customer context](https://support.zendesk.com/hc/en-us/articles/4408829170458-Viewing-customer-context-for-user-history-and-device-information)
- [Receiving and sending messages](https://support.zendesk.com/hc/en-us/articles/4408843683226-Receiving-and-sending-messages-in-the-Zendesk-Agent-Workspace)
- [Understanding conversation translation](https://support.zendesk.com/hc/en-us/articles/4408832500506-Understanding-conversation-translation)
- [About omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing)
- [Using macros](https://support.zendesk.com/hc/en-us/articles/4408887656602-Using-macros-to-update-tickets)
- [Custom roles](https://support.zendesk.com/hc/en-us/articles/4408882153882-Creating-custom-roles-and-assigning-agents)
- [QA Conversations view](https://support.zendesk.com/hc/en-us/articles/7043661945370-Using-the-Conversations-view)
- [Live agent status and activities](https://support.zendesk.com/hc/en-us/articles/4422485166746-Seeing-live-agent-status-and-activities-with-Explore)

### LiveChat

- [Chats section overview](https://www.livechat.com/help/how-to-chat-section/)
- [Customer Details](https://www.livechat.com/help/customer-details/)
- [Chat assignment](https://www.livechat.com/help/chat-assignment/)
- [Transfers and supervision](https://www.livechat.com/help/in-chat-cooperation-transfers-and-supervision/)
- [Share files](https://www.livechat.com/help/sharing-files-over-livechat/)
- [Roles](https://www.livechat.com/help/livechat-roles-owner-administrators-and-agents/)
- [Reporting options](https://www.livechat.com/help/reporting-options-available-in-livechat/)

### Accessibility

- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C: WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria/)
- [W3C APG: Feed Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/feed/)
- [W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [W3C: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
