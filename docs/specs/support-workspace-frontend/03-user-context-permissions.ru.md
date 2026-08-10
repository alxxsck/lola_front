# Support Workspace: контекст пользователя и права

## 1. Правило источника истины

Inspector не извлекает сведения о пользователе из DOM виджета, текста последних
сообщений или socket payload. Каждая карточка использует конкретную backend
projection с отдельными permission, freshness и error state.

| Данные                | Источник                               | Назначение                              |
| --------------------- | -------------------------------------- | --------------------------------------- |
| Safe identity summary | `SupportOperatorWorkspace.SELECTION`   | Header/inbox без лишних PII             |
| Полный профиль        | Profile projection                     | Inspector при `project.profiles.read`   |
| Case                  | Case projection                        | Workflow, evidence, SLA, assignment     |
| Conversation          | Workspace/message history              | Chat и public states                    |
| Presence/session      | Presence/Interaction Session           | Ephemeral online/page/device            |
| Assignment            | Assignment projection                  | Ownership и команды                     |
| Availability          | Workforce projection                   | Eligibility/capacity оператора          |
| Product events        | Bounded event recipes                  | Диагностика конкретного вопроса         |
| User Memory           | AI-derived projection                  | Подсказка с provenance, не факт профиля |
| Knowledge             | Published content search/read          | Ответ оператору                         |
| Integrations          | Source-labelled integration projection | Состояние внешней системы               |
| Language              | Backend language decision              | Перевод и его provenance                |

Данные не копируются в общий chat store. Inspector tabs владеют своими query,
кэшом и generation guard.

## 2. Safe identity summary

Без `project.profiles.read` workspace всё равно может показать разрешённый
операционный минимум:

- stable End User ID;
- разрешённый display name;
- channel identity в masked виде;
- language decision label;
- timezone, если разрешена support summary;
- ссылки на Case/Conversation.

Email, телефон, адрес, raw external identifiers и arbitrary profile fields не
должны автоматически попадать в inbox/message projection.

## 3. Profile fields

Текущий `ProfileProjectionResponseDto` уже содержит версию, sync status,
`observedAt`, provenance и field metadata. Новый inspector обязан отображать их,
а не сводить любое недоступное значение к «—».

Состояние поля:

| Измерение      | Значения                                             | Поведение                                 |
| -------------- | ---------------------------------------------------- | ----------------------------------------- |
| access         | `ALLOWED`, `REDACTED`, `FORBIDDEN`                   | value / явная redaction / отсутствие DOM  |
| availability   | `AVAILABLE`, `MISSING`, `STALE`, `DENIED`, `INVALID` | отдельные labels и recovery               |
| classification | `INTERNAL`, `PERSONAL`, `SENSITIVE`                  | группировка и permission gate             |
| trust          | trusted/untrusted                                    | предупреждение и запрет опасного auto-use |
| provenance     | source + observedAt                                  | «откуда» и «когда обновлено»              |

Карточка поля отвечает: что это, источник, свежесть и доверие. `FORBIDDEN` не
оставляет label, count или layout gap. `REDACTED` показывается только если actor
имеет право знать о существовании поля.

## 4. Inspector tabs

### Case

- category/workflow/status/waiting side;
- priority и SLA clocks с pause reason;
- assignment/team/claimant;
- связанные Conversations;
- evidence и outcome verification;
- allowed actions и version conflict history.

Существующий `/cases` остаётся полноценной Case surface. Inspector использует ту
же repository/domain model и не создаёт сокращённую несовместимую копию.

### Пользователь

- canonical identity и masked identifiers;
- preferred language/timezone;
- разрешённые contact и operational attributes;
- связанные Cases/Conversations;
- profile freshness/sync state.

### Данные

- project-approved attributes по группам;
- source/freshness/classification;
- sensitive group только по отдельному permission;
- User Memory отдельным блоком «AI-память» с provenance и review action.

### События

- только versioned event catalog/recipes;
- обязательные filters и bounded range;
- pagination/cursor с backend authority;
- raw payload, arbitrary SQL/filter expression и неограниченный timeline
  запрещены;
- AI analysis сначала показывает scope, estimate/cost и permission.

### Knowledge

Определена в [04-translation-ai-content.ru.md](./04-translation-ai-content.ru.md).

### Интеграции

- название source, status, freshness;
- safe summary и разрешённые deep links;
- retry/reconnect только отдельной command;
- error не раскрывает credentials, endpoint или raw payload.

### Activity

- assignment, routing, availability offer;
- SLA/policy revisions;
- message delivery/retry;
- AI suspension/resume;
- support commands и audit actor;
- causal links по IDs и revisions.

## 5. Модель авторизации

Frontend не проверяет `role === 'SUPPORT'`, `LEAD` или `ADMIN`. Role presets
могут назначать permissions на backend, но UI использует:

1. active project membership;
2. exact effective permission codes;
3. target authority для выбранного Case/Conversation;
4. server-provided `allowedActions` текущей projection;
5. revision/expectedVersion для команды.

Route guard уменьшает шум, но не является security boundary. Backend обязан
повторно авторизовать read, watch, download grant и command.

### Состояния action

- **не монтируется** — permission нет или existence чувствительно;
- **read-only** — видеть можно, менять нельзя;
- **disabled + причина** — permission есть, но state временно не позволяет;
- **enabled** — permission и allowed action подтверждены;
- **reconciling** — outcome неизвестен, повтор временно заблокирован.

## 6. Permission vocabulary

Frontend должен перестать поддерживать вручную неполный hardcoded каталог и
синхронизировать permission types/fixtures с опубликованным IAM contract.
Документированные support permissions:

```text
project.support.activity.read
project.support.alerts.read
project.support.alerts.manage
project.support.assignments.self_manage
project.support.assignments.override
project.support.availability.read
project.support.availability.self_manage
project.support.availability.override
project.support.internal_notes.read
project.support.internal_notes.write
project.support.internal_notes.history_read
project.support.internal_notes.redact
project.support.knowledge.read
project.support.knowledge.manage
project.support.lead_control.read
project.support.macros.read
project.support.macros.use
project.support.macros.manage
project.support.queues.read
project.support.queues.manage
project.support.routing.read
project.support.routing.manage
project.support.routing.receive
project.support.saved_views.read
project.support.saved_views.self_manage
project.support.saved_views.manage
project.support.search.read
project.support.sla.read
project.support.sla.correct
project.support.sla.manage
project.support.teams.read
project.support.teams.manage
project.support.content_legal_hold.manage
project.support.content_retention.manage
```

Conversation/profile/cases/translation permissions, уже используемые фронтом,
сохраняются до официальной IAM migration. Нельзя самостоятельно переименовать
их под `project.support.*`.

Для QA и исторической аналитики backend-контракт ещё не зафиксирован. В этой
спеке используются **предлагаемые**, но не готовые к реализации permissions:

```text
project.support.quality.read
project.support.quality.review
project.support.quality.manage
project.support.quality.sensitive_read
project.support.analytics.read
project.support.analytics.manage
```

До публикации в IAM/OpenAPI эти строки не добавляются как production truth.

## 7. Surface matrix

| Surface/action             | End User                  | Operator                     | Lead                 | Project Admin        |
| -------------------------- | ------------------------- | ---------------------------- | -------------------- | -------------------- |
| Своя публичная история     | Через Interaction Session | По target authority          | По scope             | По permission        |
| Internal Notes             | Нет                       | Read/write по authority      | По scope             | По permission        |
| Профиль/PII                | Свои public данные        | Отдельный profile permission | По scope             | По permission        |
| Claim self                 | Нет                       | Allowed action               | Allowed action       | По permission        |
| Transfer                   | Нет                       | Ограниченно                  | Override + reason    | По permission        |
| Availability self          | Нет                       | Self-manage                  | Self/override        | По permission        |
| Availability другого       | Нет                       | Нет                          | Override + reason    | По permission        |
| Operational control        | Нет                       | Обычно нет                   | `lead_control.read`  | По permission        |
| QA review                  | Нет                       | Полученные отзывы по policy  | Review scope         | Configure            |
| Analytics                  | Нет                       | Личные/разрешённые           | Team/project         | Configure            |
| Knowledge publish          | Нет                       | Обычно read                  | Manage               | Manage               |
| Redaction/malware override | Нет                       | Обычно нет                   | Отдельное permission | Отдельное permission |

End User и CMS user — разные actor classes. Наличие одинакового email не
объединяет их права.

## 8. Revoke и project switching

При смене project или `403` после revoke frontend обязан:

1. остановить watches/typing/read batches старого scope;
2. abort незавершённых sensitive queries;
3. очистить profile/events/notes/attachment grants из memory cache;
4. удалить sensitive persisted UI state;
5. пересчитать routes/navigation по новой session projection;
6. вернуть actor в ближайший доступный route;
7. сохранить только разрешённый локальный draft по утверждённой policy.

Нельзя оставлять предыдущий inspector видимым под overlay «нет доступа».

## 9. Логи и telemetry

Frontend events не содержат message body, translation text, note text, profile
values, signed URLs или attachment names. Допустимы IDs, enum state, duration,
result/error category, project-scoped feature flag и coarse viewport class.

Copy/reveal/download sensitive data и override actions должны иметь server audit;
клиентская analytics не заменяет audit trail.

## 10. Acceptance criteria

- support route работает с safe identity без profile permission;
- full profile появляется только после отдельной разрешённой query;
- stale/redacted/forbidden поля различаются и не сводятся к «—»;
- язык и user facts имеют source/freshness, client text inference не становится
  policy truth;
- UI нигде не ветвится по имени роли;
- action требует permission, target authority и allowed action;
- `403` очищает sensitive DOM/cache/watch;
- profile/event/notes не попадают в telemetry;
- QA/analytics permissions не считаются существующими до backend publication.
