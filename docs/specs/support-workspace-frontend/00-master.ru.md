# Support Workspace: master-спецификация фронтенда

Статус: proposal  
Дата: 6 августа 2026 года  
Область: только `Lola_front`

## 1. Решение

Нужно построить отдельный операторский раздел **Support Workspace**. Это не
доработка backend Ticket 11 и не ещё одна карточка в `/live`. Frontend должен
собрать уже существующие возможности чата, перевода, AI Suspension, Cases и
профиля в единое рабочее место, а затем подключать новые support-контракты по
мере их публикации в OpenAPI.

Основной маршрут:

```text
/support/inbox
├── /cases/:caseId
└── /conversations/:conversationId

/support/control       — live-контроль лида
/support/quality       — проверка качества
/support/analytics     — историческая статистика
/support/settings/*    — настройки по отдельным permissions
```

Долгоживущая работа оператора должна происходить на route-level странице, а не
в модальном окне. `UserWorkspaceDialog` на переходном этапе остаётся быстрым
входом из `/users` и `/live` и монтирует тот же общий Conversation Surface, что
и Support Workspace, либо открывает его deep link. Отдельной реализации чата в
dialog и Support быть не может. `/live` остаётся диагностикой присутствия, а не
превращается в inbox.

## 2. Что входит в frontend-проект

- общий shell, навигация, deep links и responsive route stack;
- inbox для Cases и всех Conversations, фильтры, сортировка и Saved Views;
- лента сообщений с authoritative порядком, unread/read и delivery states;
- явные режимы composer: публичный ответ и внутренняя заметка;
- существующие перевод и AI Suspension без регрессий;
- assignment, availability, SLA, viewers/typing и конфликты;
- inspector Case, пользователя, данных, знаний, интеграций и activity;
- вложения, macros и Internal Knowledge после готовности контрактов;
- отдельные поверхности для оперативного контроля, QA и аналитики;
- точная permission/capability модель, accessibility и тестирование.

Не входят:

- реализация очередей, routing, SLA, read positions, delivery, вложений, QA или
  метрик на backend;
- создание frontend-истины из socket-событий, текста сообщений или названия
  роли;
- временные mock API, которые могут попасть в production;
- замена существующей backend domain-модели Case/Conversation одним понятием
  «тикет».

## 3. Документы пакета

| Документ                                                                               | Что фиксирует                                                         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [01-operator-workspace.ru.md](./01-operator-workspace.ru.md)                           | IA, inbox, layout, навигацию, responsive и сценарии оператора         |
| [02-conversation-experience.ru.md](./02-conversation-experience.ru.md)                 | сообщения, read/unread, delivery, composer, realtime, вложения        |
| [03-user-context-permissions.ru.md](./03-user-context-permissions.ru.md)               | источники данных пользователя, inspector, роли, permissions и masking |
| [04-translation-ai-content.ru.md](./04-translation-ai-content.ru.md)                   | перевод, AI takeover, notes, macros и knowledge                       |
| [05-lead-quality-analytics.ru.md](./05-lead-quality-analytics.ru.md)                   | контроль работы, QA и статистику                                      |
| [06-frontend-architecture-contracts.ru.md](./06-frontend-architecture-contracts.ru.md) | модули, state, API/realtime контракты и migration map                 |
| [07-testing-rollout-roadmap.ru.md](./07-testing-rollout-roadmap.ru.md)                 | этапы, acceptance criteria, тесты и rollout                           |

Исследование интерфейсов LiveChat, Intercom, Zendesk и требований W3C:
[support-operator-workspace-ux.ru.md](../../research/support-operator-workspace-ux.ru.md).

## 4. Нормативные продуктовые понятия

| Понятие                 | Значение в UI                                        | Нельзя подменять          |
| ----------------------- | ---------------------------------------------------- | ------------------------- |
| Case                    | Рабочая проблема, ответственность, workflow и SLA    | Conversation              |
| Conversation            | Канал и упорядоченная история сообщений              | Case                      |
| Assignment              | Кто отвечает за Case                                 | Кто смотрит или печатает  |
| Claimant                | Кто сейчас имеет право публично отвечать вместо Lola | Assignee                  |
| AI Suspension           | Приостановлено ли участие Lola                       | Assignment или presence   |
| Availability            | Можно ли назначать оператору новую работу            | Socket online             |
| Presence/viewing/typing | Краткоживущая подсказка о присутствии                | Ownership                 |
| Read position           | Личная durable позиция чтения actor                  | Socket receipt            |
| Delivery                | Доставка конкретного сообщения                       | HTTP success или presence |

Frontend обязан показывать эти состояния раздельно. Один зелёный индикатор
«активен» для них запрещён.

## 5. Пользователи и главные задачи

### Support Operator

1. Открыть свою очередь и увидеть, что требует ответа первым.
2. Понять Case, пользователя, язык, SLA, assignment и режим Lola.
3. Прочитать с первого непрочитанного, ответить или оставить note.
4. Перевести ответ, приложить файл, применить macro или knowledge.
5. Передать/закрыть Case без потери draft и контекста.

### Support Lead

1. Видеть очередь, нагрузку, риски SLA и проблемы назначения в реальном времени.
2. Провалиться из метрики в точный отфильтрованный список.
3. Назначить, передать, изменить priority или availability с причиной.
4. Проверить причинную timeline решения, а не оценивать сотрудника по online.

### QA Reviewer

1. Получить очередь Conversations для проверки.
2. Проверить snapshot разговора или конкретный Message по versioned scorecard.
3. Привязать evidence, комментарий и решение.
4. Не раскрывать лишние PII, private notes и системные данные.

### End User

End User не получает CMS routes и CMS permissions. Он видит только собственную
публичную Conversation через Interaction Session, публичные handoff-сообщения,
доступные ему вложения и собственные delivery/read состояния.

## 6. Принципы реализации

1. **REST projection — источник истины.** Realtime сообщает, что изменилось, и
   запускает bounded reconcile.
2. **Права по permission code и allowed actions.** Проверки по имени роли
   запрещены. Backend повторно авторизует каждый read/watch/command.
3. **Никаких догадок клиента.** Язык, SLA, assignment, delivery, доступность и
   eligibility приходят с источником и версией.
4. **Сначала сохраняем работу.** На `409`, reconnect, revoke или unknown outcome
   не теряются текст draft и READY attachments.
5. **Чувствительные данные загружаются лениво.** Отсутствующее permission-поле
   не оставляет label, count или placeholder в DOM.
6. **Состояние доступно не только цветом.** Все важные признаки имеют текст и
   accessible name.
7. **Mobile — отдельный route stack.** Четыре desktop-pane нельзя сжимать в
   экран 390 px.

## 7. Definition of Ready для frontend-вертикали

Вертикаль готова к разработке, только если:

- операция опубликована в зафиксированном frontend OpenAPI snapshot;
- известны permission, target authority и server-provided `allowedActions`;
- заданы revision/expectedVersion и idempotency rules;
- описаны empty/loading/stale/forbidden/conflict/unknown outcome состояния;
- приведены realtime hint и REST reconcile path;
- есть fixture/example для каждого варианта ответа и ошибки;
- определено, какие поля безопасны для inbox и realtime;
- согласованы audit, retention и masking.

Файлы или незамерженные изменения в backend worktree не считаются контрактом.

## 8. Definition of Done всего проекта

- оператор выполняет основной цикл из `/support/inbox` без модального
  «приложения внутри приложения»;
- Case и Conversation, assignment и claimant, availability и presence,
  accepted/delivered/read визуально и программно разделены;
- все action surfaces используют effective permissions и allowed actions;
- перевод и AI Suspension сохраняют текущие fail-closed гарантии;
- Users chat и Support используют один Conversation Surface, один message
  renderer/composer и один toggle `Оригинал / Перевод`; второй chat renderer
  отсутствует;
- reconnect/reload не создаёт дублей и восстанавливает authoritative state;
- 1440×1000, 1024×768 и 390×844 проходят visual и keyboard QA;
- axe не находит критических нарушений в основных сценариях;
- QA и analytics не строятся из сырых сообщений в браузере;
- legacy modal либо удалена, либо оставлена как совместимый adapter общего
  Conversation Surface/launcher без собственной chat implementation;
- rollout можно отключить project feature flag без миграции пользовательских
  данных назад.
