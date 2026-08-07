# Support Workspace: перевод, AI и внутренний контент

## 1. Общий подход

В `Lola_front` уже реализована сильная translation vertical: opt-in на
Conversation, ручной target locale, persisted translations, preview/edit/send,
conflict handling, realtime reconcile и fail-closed provider/budget поведение.
Support Workspace должен переиспользовать её repository и state machines, а не
создавать второй переводчик внутри нового chat component. Более того, Users и
Support обязаны монтировать один Conversation Surface: общий message renderer,
translation controller и существующий header toggle. Переиспользование только
repository при двух разных UI-реализациях не считается выполнением требования.

Нормативная существующая спецификация:
[support-chat-translation-frontend-release-proof.ru.md](../../support-chat-translation-frontend-release-proof.ru.md).
Если между документами появляется расхождение по безопасности отправки,
release-proof правила имеют приоритет до отдельного ADR.

## 2. Три независимых языка

Не объединять одним dropdown:

- locale интерфейса CMS;
- Working Locale оператора;
- locale End User / target ответа.

Timestamp показывается в timezone оператора; timezone пользователя доступен в
inspector с source/freshness. Смена CMS locale не меняет язык исходящего ответа.

## 3. Language decision

Backend language projection должна возвращать:

```ts
type LanguageDecision = {
  locale: string | null;
  confidence: number | null;
  source: "MANUAL" | "PROFILE" | "RECENT_MESSAGES" | "CASE" | "UNKNOWN";
  observedAt: string | null;
  revision: string;
  allowedActions: string[];
};
```

Frontend показывает источник решения. Короткое `ok`, emoji или имя не должны
автоматически закреплять новый язык. Существующий client `inferLocaleFromText`
можно использовать только для необязательной UI-подсказки, не для policy,
target, billing или автоматической отправки.

## 4. Inbound перевод

- единый Conversation toggle из текущего user chat: `Оригинал` /
  `Перевод · <Working Locale>`; он одинаков в Users и Support;
- Support не добавляет отдельную кнопку, dropdown, menu-only action или второй
  локальный state переключения всей ленты;
- original конкретного Message можно открыть только как secondary inspect
  action общего message renderer; это не альтернативный Support-only toggle;
- label: «Переведено с испанского» + persisted/error state;
- original остаётся доступен разрешённому оператору;
- original и translation не рендерятся постоянно двумя bubbles;
- provider/model/cost скрыты без `project.translation.read`;
- pending/error не меняют canonical message order;
- bulk translation сохраняет серверный лимит и частичные outcomes;
- перевод вложения или OCR не заявляется, если такой projection нет.

## 5. Outbound перевод

### Happy path

1. Оператор пишет на Working Locale.
2. UI запрашивает preview и показывает направление, например
   `Русский → Испанский`.
3. Preview содержит editable translated text, target source, glossary
   hits/warnings и revision.
4. Оператор подтверждает отправку выбранной версии.
5. Backend атомарно сохраняет original, выбранный translation и send intent.
6. После receipt bubble показывает original оператора и отправленную версию по
   разрешённому toggle.

### Инвалидация preview

Preview становится stale при:

- изменении source draft;
- смене target language;
- применении/изменении macro;
- изменении relevant glossary/policy revision;
- переключении public/note mode;
- восстановлении draft из другой revision.

Stale preview нельзя отправить молча. Повторный preview сохраняет исходный draft.

### Fail-closed

- provider/budget/allowance failure не отправляет original автоматически;
- bypass — отдельная action и permission с обязательной причиной;
- предупреждение явно говорит, какой текст получит End User;
- конфликт/`409` сохраняет source, edited preview и attachments;
- unknown outcome сначала делает reconcile/idempotency lookup;
- provider details не попадают в обычный operator error.

## 6. AI Suspension и handoff

Отображать отдельно:

- assignee/team;
- public claimant;
- AI Suspension;
- public responder mode;
- availability;
- presence/viewing.

### Header

`Приостановить AI` — отдельная state-changing action. После успеха persistent
banner показывает: кто приостановил, безопасную причину, срок, `Возобновить`,
`Продлить`, `История` по permission.

### Composer

`Приостановить AI и отправить` — атомарная command. UI не выполняет сначала
pause, затем reply двумя независимыми запросами. Если command конфликтует,
draft остаётся, новые allowed actions перечитываются.

### End User

Пользователь получает понятное system announcement о передаче человеку и
возврате Lola. Внутренние reason, TTL, operator availability и routing details
не раскрываются.

AI suggestion/Copilot, если появится, оформляется как черновая подсказка, а не
сообщение Lola или оператора. Вставка всегда требует явного действия.

## 7. Internal Notes

Internal Note — отдельный Message visibility, не special color публичного
ответа.

Требования:

- режим всегда подписан в composer и у отправленного note;
- End User никогда не получает note или его attachment grant;
- read/write/history/redact проверяются отдельными permissions;
- автор хранится immutable snapshot;
- note может ссылаться на Case/Message evidence;
- edit/redact history загружается только по permission;
- полнотекстовый поиск, exports, QA и AI scope учитывают note policy;
- copy/paste из note в public reply является явным действием и проходит
  translation/PII checks заново.

Frontend не должен скрывать обычный public composer за ambiguous dropdown,
который может восстановиться в режиме note после reload.

## 8. Macros

Macro ищется через `/` в composer и отдельную кнопку.

Карточка результата показывает:

- название и краткое описание;
- locale;
- target context/category;
- approval/rollout state;
- revision;
- связанные actions, если есть.

Backend рендерит macro для bounded Case/user context. Результат вставляется в
editable draft и никогда не отправляется автоматически. Подстановки с
missing/forbidden data остаются явными unresolved tokens; клиент не достраивает
их из cached profile.

Изменение macro result инвалидирует translation preview. Связанные Case actions
предлагаются отдельно и требуют собственного confirmation/command receipt.

## 9. Internal Knowledge

Knowledge tab ищет только published и разрешённый content.

Фильтры показываются пользователю:

- locale;
- product/category/topic;
- audience/permission scope;
- rollout/project;
- актуальность/revision.

Result содержит title, safe snippet, source, revision, locale и revoke state.
Действия:

- `Открыть`;
- `Вставить ссылку`;
- `Вставить цитату`;
- `Сообщить о проблеме`.

Полное тело статьи не копируется в Conversation projection. Открытие статьи не
сбрасывает draft. Вставленная цитата остаётся редактируемой, получает provenance
в служебном draft metadata и проходит перевод как обычный исходящий текст.

Legal hold, retention и rollout являются backend policy. UI показывает только
разрешённый state и не даёт обходить revoked/expired content из локального кэша.

## 10. Тексты интерфейса

| Ситуация            | Рекомендуемый текст                                        |
| ------------------- | ---------------------------------------------------------- |
| Public mode         | `Ответ пользователю`                                       |
| Note mode           | `Внутренняя заметка · пользователь её не увидит`           |
| Preview ready       | `Проверьте перевод перед отправкой`                        |
| Preview stale       | `Текст изменился — обновите перевод`                       |
| Translation failure | `Не удалось подготовить перевод. Сообщение не отправлено.` |
| Bypass              | `Отправить без перевода`                                   |
| AI active           | `Сейчас отвечает Lola`                                     |
| Support requested   | `Пользователь ожидает поддержки`                           |
| Human live          | `Сейчас отвечает оператор`                                 |
| Unknown outcome     | `Проверяем, было ли сообщение отправлено…`                 |

Текст ошибки не обвиняет пользователя и не обещает доставку раньше receipt.
Provider codes доступны только в permission-guarded details.

## 11. Acceptance criteria

- CMS locale, Working Locale и End User locale меняются независимо;
- language source/freshness видимы, client inference не становится truth;
- original/translation переключаются без удвоения всей ленты;
- изменённый draft нельзя отправить со stale preview;
- provider failure никогда не отправляет original без решения оператора;
- pause-and-send атомарен и сохраняет draft на конфликте;
- note невозможно принять за public reply;
- macro вставляется как editable draft и не отправляется автоматически;
- Knowledge использует published revision и не протаскивает статью в chat store;
- End User не получает internal reason, note или private attachment.
