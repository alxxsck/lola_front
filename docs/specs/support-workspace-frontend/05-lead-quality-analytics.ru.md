# Support Workspace: контроль, качество и аналитика

## 1. Почему нужны три раздела

`Операционный обзор`, `Проверка качества` и `Аналитика` решают разные задачи:

| Раздел             | Вопрос                              | Время              | Основной результат                   |
| ------------------ | ----------------------------------- | ------------------ | ------------------------------------ |
| Операционный обзор | Где прямо сейчас нужна помощь?      | Live/минуты        | Действие над Case/оператором/alert   |
| Проверка качества  | Правильно ли была выполнена работа? | Snapshot разговора | Versioned review и feedback          |
| Аналитика          | Как меняется система?               | Дни/недели/месяцы  | Тренд, сравнение, решение о процессе |

Их нельзя встраивать набором виджетов в Conversation. Каждая surface имеет свои
permissions, freshness, агрегаты и drill-down.

## 2. Операционный обзор `/support/control`

### KPI верхнего уровня

- incoming/open/unassigned;
- oldest unassigned;
- waiting first human reply / next reply;
- SLA at risk / breached;
- Cases без eligible operator;
- available/busy/away/draining/offline operators;
- load/capacity по Team/language/topic;
- delivery failures;
- attachment scan backlog;
- AI requested/handoff pending/suspended;
- unacknowledged operational alerts.

Каждая карточка показывает:

- значение и единицу;
- `asOf`/freshness;
- безопасную trend/delta только при сопоставимом окне;
- scope/filter;
- deep link в точный View;
- stale/error state.

Клиент не вычисляет эти числа из inbox page. Все агрегаты приходят из
authoritative lead-control projection.

### Action tables

Вместо декоративных графиков основные таблицы:

- breached/at-risk Cases;
- old unassigned;
- no eligible operator;
- frequent transfers/reopens;
- overload/availability exceptions;
- active alerts и owner;
- delivery/attachment infrastructure impact.

Строка открывает Case или causal investigation. Команды reassignment, priority,
availability override, acknowledge/close alert требуют permission, reason и
expectedVersion. Результат показывается по каждому target.

### Causal timeline

Для расследования:

```text
queue → routing decision → offer → accept/timeout → assignment
      → waiting clocks → messages/delivery → transfer/close
```

Timeline показывает revisions правил, но не раскрывает raw candidate PII или
секреты интеграций. `online` не используется как оценка работы сотрудника.

### Граница текущего backend

Backend Ticket 09 описывает Lead Control, Ticket 10 — alerts. Frontend подключает
их только после появления операций в pinned OpenAPI. Этот раздел не должен
создавать employee score или исторический scorecard: это отдельная аналитика.

## 3. Проверка качества `/support/quality`

### Навигация

```text
Очередь на проверку
Назначено мне
Завершённые проверки
Мои отзывы              [operator policy]
Калибровка              [reviewer/lead]
Настройки scorecards    [manage]
```

### Queue

Filters/sort задаются backend review query:

- period;
- team/operator;
- Case category/language/channel;
- SLA/result/CSAT;
- escalation/translation/AI involvement;
- random/risk/monitor source;
- unreviewed/assigned/completed/disputed.

Строка показывает только данные, нужные для выбора проверки. PII не появляется
по умолчанию.

### Review workspace

```text
Review queue | Read-only Conversation | Versioned scorecard
```

- Conversation зафиксирована по review snapshot/version;
- новый Message после snapshot отмечается, но не меняет оценяемый материал;
- можно оценить весь разговор, конкретный Message или конкретного operator;
- original/translation toggle доступен, а качество перевода оценивается отдельно;
- evidence — ссылки на ordinal/Case event, а не копия текста;
- private notes/sensitive profile подключаются только по специальной policy;
- autosave хранит server draft review;
- submit/finalize — versioned command;
- сотрудник видит разрешённые rating/comment/evidence и dispute flow;
- calibration results не попадают в production score.

### Scorecard schema

Frontend рендерит server-driven versioned schema. Минимальные категории:

- correctness;
- policy/security;
- diagnosis;
- communication;
- translation quality;
- resolution/next step;
- internal knowledge use;
- корректность AI handoff.

Weights, critical failures, N/A rules и thresholds не зашиваются в код.
Изменённая schema не переоценивает старый review.

### AI review

Автооценка показывается как предложение с confidence, evidence и model/policy
revision по permission. Она не выдаётся за human review. Reviewer обязан видеть,
какие criteria требуют ручной проверки. Feedback пользователю не содержит
скрытых chain-of-thought или внутренних model traces.

### Contract gap

В текущем pinned frontend OpenAPI нет QA review queue, snapshot, scorecard и
dispute contracts. Раздел готовится как route/architecture только после их
версирования. До этого нельзя считать score в браузере по загруженным Messages.

## 4. Аналитика `/support/analytics`

### Набор отчётов

#### Responsiveness и SLA

- first human response;
- next response;
- queue wait;
- handling и resolution time;
- SLA hit/miss/corrected;
- backlog age distribution.

#### Outcomes и качество

- resolved/reopened/transferred;
- CSAT и response rate;
- QA score/coverage/dispute;
- resolution verification;
- repeat contact в согласованном окне.

#### Workload

- volume/resolution по team/queue/category/language/channel;
- operator load и capacity utilization;
- assignment offer/accept/timeout;
- staffing coverage без вывода «работал/не работал» из socket online.

#### AI, перевод и контент

- AI containment/verified resolution/escalation/human recovery;
- translation usage/failure/bypass/quality;
- macro и knowledge usage;
- attachment upload/scan/extraction failures;
- AI allowance/cost отдельно от human performance.

### Metric contract

Каждая метрика обязана иметь:

- stable ID и human definition;
- numerator/denominator;
- inclusion/exclusion rules;
- timezone и bucket;
- cohort/filters;
- freshness/complete-through;
- corrected/backfilled state;
- minimum sample/privacy suppression;
- allowed dimensions;
- drill-down authority.

UI показывает median и percentiles/distribution там, где average скрывает хвост.
Сравнение недоступно, если окна или определения несовместимы.

### Filters и drill-down

Global report filters: time range, timezone, team, queue, category, language,
channel, priority и policy revision. Каждый chart повторяет эффективный scope.

Drill-down — отдельный backend query с собственной permission проверкой. Нельзя
строить список IDs из chart payload и затем читать Conversations в обход target
authority.

### Export и sharing

- export создаётся server-side, audited и ограничен текущими filters;
- CSV/Excel не содержит скрытые PII по умолчанию;
- сохранённый report хранит definition/version, не snapshot credentials;
- view/explore/edit/share — разные permissions;
- ссылка на report после revoke не сохраняет данные в client cache.

### Contract gap

Исторические support scorecards и Ticket 18 ещё не являются доступным frontend
контрактом. До публикации analytics API разрешены только skeleton routes/feature
flags, но не локальные расчёты из operational data.

## 5. Тексты и anti-gamification

- «Сейчас доступен», а не «работает»;
- «Нагрузка: 4 из 6», а не «эффективность 67%»;
- «Данные обновлены 4 минуты назад», а не ложный live indicator;
- «Недостаточно данных», а не `0%`;
- «SLA нарушен в 12 Cases», с переходом к Cases;
- corrections/backfill обозначаются рядом с метрикой.

Leaderboard по скорости ответа без качества, сложности и minimum sample не
входит в продукт. Операционный экран нужен для помощи и распределения работы,
а не скрытого employee surveillance.

## 6. Responsive и accessibility

- desktop dashboard использует grid, но reading order совпадает с DOM;
- tablet сворачивает вторичные breakdown, сохраняя action tables;
- mobile показывает KPI → alerts → action list, chart detail отдельным route;
- chart имеет доступную таблицу данных/summary;
- цвет риска дублируется label/icon;
- auto-refresh не перемещает focus и не меняет выбранную строку;
- screen reader получает ненавязчивое сообщение об обновлении, но не перечитывает
  весь dashboard;
- review scorecard полностью работает keyboard и сообщает validation у criteria.

## 7. Acceptance criteria

- любой live KPI имеет freshness и exact drill-down;
- stale aggregate не выглядит realtime;
- override требует reason/expectedVersion и не теряет partial failures;
- online/typing не участвуют в employee score;
- review привязан к snapshot и versioned scorecard;
- QA permissions независимы от чтения обычного inbox;
- аналитика показывает definition/timezone/cohort и защищённый drill-down;
- browser не вычисляет project metrics из неполных страниц;
- QA/analytics routes не включаются до готовности IAM и OpenAPI contracts.
