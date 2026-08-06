# Support Workspace: Conversation experience

## 1. Модель ленты

Conversation — упорядоченная сервером последовательность Messages и ограниченный
набор публичных system announcements. Frontend не сортирует сообщения по
`createdAt`: canonical key — `ordinal`, а `messageId` служит identity.

Минимальная view model сообщения:

```ts
type SupportMessage = {
  id: string;
  conversationId: string;
  ordinal: number;
  role: "END_USER" | "LOLA" | "SUPPORT_OPERATOR" | "SYSTEM";
  visibility: "PUBLIC" | "INTERNAL_NOTE";
  authorSnapshot: {
    actorId: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  originalContent: MessageContent;
  translation?: TranslationProjection;
  attachments: AttachmentProjection[];
  delivery: DeliveryProjection;
  createdAt: string;
  editedAt?: string;
  tombstone?: TombstoneProjection;
};
```

`authorSnapshot` неизменяем и показывается даже после переименования или
удаления сотрудника. System/Scenario не маскируется под человека. Internal Note
имеет отдельные visibility, фон, label и доступность.

## 2. Загрузка истории и scroll

- первая страница содержит bounded page, first/last ordinal и read summaries;
- при открытии viewport ставится на `firstUnreadOrdinal`; если unread нет — к
  последнему сообщению;
- старые страницы загружаются вверх с сохранением visual anchor;
- «Загрузить предыдущие» остаётся keyboard/screen-reader fallback к infinite
  scroll;
- получение нового сообщения не автоскроллит оператора, читающего историю;
  появляется «Новые сообщения (N)»;
- near-bottom пользователь остаётся прикреплённым к низу после append;
- duplicate Message по `id/ordinal` merge-ится, а не рендерится второй раз;
- gap или revision mismatch запускает REST reconcile.

Лента использует `role="log"` и `aria-live="polite"`. При смене Conversation
объявляется новый заголовок, а не вся история. Incoming Message объявляется
автором и кратким текстом/типом attachment.

## 3. Read и unread

Read position — actor-relative durable high-water по ordinal.

Frontend отправляет read ACK только если одновременно выполнены условия:

1. Message отрендерен;
2. Message попал в видимую область через `IntersectionObserver`;
3. документ видим и окно имеет focus;
4. выбранная Conversation всё ещё актуальна;
5. ordinal выше последнего подтверждённого high-water.

ACK группируется/debounce-ится и монотонен. Socket receipt, открытый route или
фокус composer сами по себе не означают read. После reconnect watch
восстанавливается, затем read summary сверяется с REST.

Публичный human receipt End User и личный CMS unread — разные projections.
Claimant может двигать human-support receipt по backend policy; watcher — нет.

## 4. Delivery

```text
PENDING → ACCEPTED → DELIVERING → DELIVERED → READ
                 ↘ FAILED / CANCELLED
```

- optimistic bubble до server receipt имеет label «Отправляем»;
- HTTP/socket acceptance не подписывается «Доставлено»;
- `DELIVERED` означает durable receipt публичного клиента;
- `READ` означает, что End User high-water прошёл ordinal;
- `FAILED` показывает safe reason и server-provided retry action;
- unknown outcome показывает «Проверяем результат» и делает idempotency lookup;
- retry использует исходный logical message/retry contract, не создаёт слепой
  новый текст;
- агрегированный failure виден в inbox, подробность — у сообщения.

Каждый state имеет текст и accessible name. Неопределённая доставка не
закрашивается зелёным из-за online presence.

## 5. Composer

### Два режима

Composer всегда находится в одном из явно подписанных режимов:

- **Ответ пользователю** — публичное сообщение;
- **Внутренняя заметка** — только для сотрудников.

Кнопка отправки называется «Отправить пользователю» или «Добавить заметку».
Цвет и иконка дополняют название, но не заменяют его. При reload/recovery режим
перепроверяется до разблокировки Send.

Draft key:

```text
projectId + actorId + conversationId + mode
```

Текст, translation preview и attachments public/note никогда не переносятся
между режимами. Draft сохраняется при navigation, `409`, reconnect и временном
`403`; при окончательном revoke sensitive draft очищается согласно security
policy с понятным уведомлением.

### Разрешение на отправку

Send активен, только если:

- projection не stale сверх server policy;
- action присутствует в `allowedActions`;
- выбран точный Conversation/channel;
- есть текст или хотя бы один READY attachment;
- нет UPLOADING/SCANNING attachment;
- translation policy выполнена;
- idempotency key создан для attempt;
- version/claim state соответствует command precondition.

Disabled action объясняет временную причину. Если permission отсутствует,
чувствительная action не монтируется.

### Отправка и recovery

1. UI фиксирует immutable attempt из draft.
2. Команда отправляется с idempotency key и expectedVersion.
3. Draft очищается только после authoritative accepted receipt.
4. При timeout выполняется lookup/reconcile до предложения Retry.
5. При `409` draft и READY attachments остаются; UI показывает изменившийся
   claimant/assignment/AI state.
6. Повторная отправка создаёт attempt по правилам backend, а не по двойному клику.

`Enter` не отправляет во время IME composition. Основной вариант — Enter по
настройке пользователя; `⌘/Ctrl+Enter` всегда доступен и подписан в shortcut help.

## 6. Public responder и AI mode

Frontend отображает server projection, не выводит её из последних сообщений:

- `LOLA`;
- `SUPPORT_REQUESTED`;
- `SUPPORT_LIVE`;
- `SUPPORT_AWAY`;
- `LOLA_SUSPENDED`.

`Assignment`, `claimant` и `AI Suspension` показываются отдельно. Public reply
без допустимого claim не должен незаметно создавать второго responder. Действие
«Приостановить AI и отправить» является одной атомарной backend-командой.

## 7. Presence, viewing и typing

Ephemeral state имеет TTL и generation:

- End User online/offline;
- оператор смотрит Conversation;
- End User/Support Operator печатает;
- Lola отвечает — только из leased AssistantTurn projection.

Typing показывается только для выбранной Conversation. Stale start/stop после
reconnect игнорируется. Viewer/typing предупреждает о возможной коллизии, но
hard ownership определяют assignment/claim commands. Viewing не меняет
availability и не назначает Case.

Нельзя передавать draft text в typing/viewing events.

## 8. Activity и system announcements

В публичной ленте остаются только понятные End User события:

- передача от Lola человеку;
- возврат к Lola;
- закрытие/возобновление Conversation;
- доступные публичные attachment/delivery сообщения.

Assignment, SLA, routing, policy versions, retry receipts и commands идут в
`Activity` inspector. Raw event payload не рендерится; технические детали
загружаются отдельной permission-guarded projection.

## 9. Вложения

### Upload tray

```text
LOCAL → UPLOADING → UPLOADED → SCANNING → READY
                   ↘ FAILED / REJECTED / CANCELLED
```

Карточка показывает filename, type, size, progress, scan state, Retry/Cancel.
Thumbnail не означает scan success. Send разрешён только для READY files.

Плановые ограничения backend должны отображаться до выбора файла: до 10 файлов,
20 MiB на файл, 50 MiB на Message и опубликованный MIME allowlist. Реальные
значения берутся из capabilities, а не зашиваются в component.

Требования:

- picker, paste и drag-and-drop; picker — обязательная альтернатива drag;
- attachment-only Message разрешён;
- смена Conversation сохраняет tray по draft key;
- retry unknown upload создаёт новый безопасный upload intent;
- signed URL не хранится как identity, в router или persistent storage;
- open/download сначала запрашивает новый grant;
- revoked/quarantined/tombstoned файл показывает устойчивую карточку;
- image lightbox поддерживает keyboard, zoom/pan и возврат focus;
- document card показывает безопасное имя, тип, размер, scan/extraction state;
- malware override — отдельное audited permission, не обычная action оператора.

## 10. Message actions

Overflow конкретного Message может содержать только server-allowed действия:

- копировать разрешённый original/translation;
- ответить/цитировать;
- открыть attachment;
- retry failed delivery;
- привязать evidence к Case/QA;
- redact/history — только специальное permission;
- открыть technical receipt — только диагностическое permission.

Action всегда привязана к `messageId + ordinal + revision`. Клиент не меняет
историю локально без authoritative receipt.

## 11. Производительность

- DOM virtualization допускается только с сохранением scroll/read semantics;
- bounded message pages — до 100 элементов согласно workspace contract;
- inspector и старые страницы загружаются лениво;
- selected Conversation имеет приоритет realtime reconcile;
- фоновые Conversations получают invalidation/revision, не полные bodies;
- изображения используют constrained dimensions и lazy decoding;
- heavy translation/AI/attachment panels загружаются dynamic import.

Цель: переключение уже загруженной Conversation ощущается мгновенным; новый
selection не показывает данные старого target даже на один frame.

## 12. Acceptance criteria

- порядок одинаков при разных `createdAt`, потому что используется ordinal;
- первый unread попадает в viewport и только видимые сообщения двигают read ACK;
- чтение истории не сбивается incoming append;
- accepted, delivered, read и failed различимы текстом;
- double click/reconnect не создаёт duplicate Message;
- public reply и note невозможно спутать до и после отправки;
- `409` сохраняет draft и READY attachments;
- typing/viewing истекают по TTL и не влияют на ownership;
- attachment нельзя отправить до READY, а signed grant не остаётся в state;
- screen reader слышит новое сообщение, автора и ошибку, но не весь log заново.
