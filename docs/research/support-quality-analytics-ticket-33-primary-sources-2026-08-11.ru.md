# Support Quality и аналитика поддержки: исследование для Ticket 33

Дата исследования: 2026-08-11  
Дата доступа к интернет-источникам: 2026-08-11

## Задача исследования

Определить полный production-scope Ticket 33:

- какие показатели нужны оператору, lead, QA reviewer и руководителю поддержки;
- как считать их без расхождения определений и браузерных пересчётов;
- как связать показатель с обращениями и проверками без утечки данных;
- как обновлять оперативные данные без скачущего интерфейса и лишней нагрузки;
- какие графики и состояния дают понятный, доступный и адаптивный интерфейс;
- какие backend-контракты ещё нужно опубликовать до реализации фронта.

Использованы официальные справки производителей, стандарты и локальные контракты Lola. Выводы —
продуктовая интерпретация для Lola, а не копирование чужого интерфейса.

## Короткий вывод

Ticket 33 должен остаться одним тикетом и включать две связанные, но независимо защищённые
поверхности:

1. **Оценка качества** — оценочные листы, очередь проверок, неизменяемое доказательство, отзыв,
   спор и калибровка.
2. **Аналитика поддержки** — оперативное состояние, поток обращений, SLA, качество, клиентский
   результат, нагрузка команды, автоматизация, расходы и надёжность доставки.

Backend уже публикует базовый QA workflow и простой агрегат по одному оператору. Этого недостаточно
для полной аналитики. Support должен подключиться к общему Reporting & Dashboards context через
versioned Dataset/Metric/Dimension/Population Definitions и committed owner facts. Браузер получает
готовый Query Result и Resource Receipt, но не вычисляет показатели из загруженных сообщений.

Реальное время следует использовать как **сигнал об изменении**, а не как второй источник истины:
сервер сообщает, что появилась новая generation, интерфейс показывает «Есть новые данные» и по
кнопке перечитывает authoritative snapshot. На оперативном экране можно отдельно включить
автообновление с разумным интервалом. Исторические отчёты не нужно опрашивать каждые несколько
секунд.

## Что показывают зрелые продукты

### Определение показателя важнее красивого числа

Intercom публикует для каждого показателя источник, временную привязку, состав числителя и
ограничения выборки. Например, время обработки исключает ожидание в очереди, сон и работу бота, а
повторное обращение определяется отдельным окном 24/48/72 часа. Это подтверждает необходимость
server-owned Metric Definition, а не подписи, придуманной компонентом.

Источник: [Intercom — Reporting metrics & attributes](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes).

Zendesk отдельно объясняет first reply time, business hours и связь с SLA. Там же показан опасный
случай: first reply и full resolution могут использовать разные временные anchors, поэтому их нельзя
сравнивать без явного определения выборки.

Источники:

- [Zendesk — Understanding ticket reply time](https://support.zendesk.com/hc/en-us/articles/4408821871642-Understanding-ticket-reply-time);
- [Zendesk — Why first reply can be higher than full resolution](https://support.zendesk.com/hc/en-us/articles/4944878131994-Why-is-the-First-reply-time-higher-than-the-Full-resolution-time-on-my-Support-dashboard);
- [Zendesk — Defining SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies).

**Применение в Lola:** каждый результат обязан показывать definition revision, timezone, calendar,
population, time anchor, data-as-of, coverage, exclusions, exactness и no-data semantics.

### Оперативный обзор и исторический отчёт решают разные задачи

Intercom разделяет real-time dashboard и исторические reports. Оперативный экран показывает active
teammates, unassigned/waiting/open/idle/snoozed conversations, capacity, SLA miss rate, first response,
closed и CSAT. Это состояние для решения «что делать сейчас», а не для оценки квартала.

Источник: [Intercom — Monitoring team workload and capacity](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity).

Grafana рекомендует выбирать частоту обновления по реальной частоте появления данных и не запускать
частый refresh для часовых или дневных показателей. Слишком частое обновление мешает взаимодействию:
например, закрывает закреплённый tooltip.

Источники:

- [Grafana — Dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/);
- [Grafana — Troubleshoot dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/troubleshoot-dashboards/).

**Применение в Lola:** оперативные факты имеют отдельный freshness tier; real-time событие только
инвалидирует snapshot. Исторические страницы обновляются вручную или после завершения Query Run.

### Проверка качества — это цикл, а не одна средняя оценка

Zendesk QA использует versioned scorecards, категории и измеримые критерии. Calibration заставляет
нескольких reviewers оценить одну выборку и сравнить результаты; calibration scores не смешиваются
с обычным quality score. Отдельно оценивается согласованность самих reviewers.

Источники:

- [Zendesk — Viewing and managing scorecards](https://support.zendesk.com/hc/en-us/articles/8875998154906-Viewing-and-managing-scorecards);
- [Zendesk — Setting up calibration](https://support.zendesk.com/hc/en-us/articles/7043724530842-Setting-up-calibration-in-Zendesk-QA);
- [Zendesk — QA admin guide](https://support.zendesk.com/hc/en-us/articles/10093676975898-Getting-started-with-Zendesk-QA-Admin-guide);
- [Zendesk — Evaluating reviewers](https://support.zendesk.com/hc/en-us/articles/7043661635226-Evaluating-the-performance-of-reviewers).

**Применение в Lola:** показывать quality score вместе с coverage, scorecard revision, critical
failures, dispute state и calibration variance. Calibration не меняет рабочий score оператора.

### Скорость без качества создаёт вредную мотивацию

Intercom различает handling time, adjusted handling time, first/subsequent response, assignment to
close, recontact и first-contact resolution. В документации отдельно предупреждается о selection
bias при сравнении разговоров с Copilot и без него.

Источник: [Intercom — Reporting metrics & attributes](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes).

ICO требует необходимости, пропорциональности и прозрачности мониторинга работников. NIST AI RMF
требует документировать ограничения метрик, контекст, неопределённость и human oversight.

Источники:

- [ICO — Monitoring workers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/);
- [NIST — AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).

**Применение в Lola:** не строить публичный рейтинг сотрудников, не использовать один показатель
для дисциплинарного решения, подавлять малые выборки, показывать контекст и давать оператору доступ
к собственным submitted reviews и праву на спор.

### Доступ к отчёту, детализации и выгрузке — разные полномочия

Intercom разделяет права на просмотр reports, chart drill-in, sharing и CSV export. Экспорт
conversation data содержит reporting metadata, но не полный текст переписки.

Источники:

- [Intercom — Teammate permissions](https://www.intercom.com/help/en/articles/176-teammate-permissions-how-to-control-workspace-access);
- [Intercom — Report sharing and access controls](https://www.intercom.com/help/en/articles/9867813-report-sharing-and-access-controls);
- [Intercom — Export conversations data](https://www.intercom.com/help/en/articles/2046229-export-your-conversations-data).

**Применение в Lola:** read, drilldown, export, share и authoring получают отдельные permissions;
каждая операция повторно проверяет текущую Project Membership и field-level authority.

### График обязан оставаться понятным без цвета и анимации

IBM рекомендует заголовок, который формулирует вывод, прямые подписи вместо длинной легенды,
ограниченную сетку и цвет только для смыслового акцента. Атлас цветов Atlassian требует semantic
tokens и достаточного контраста. W3C требует текстовый эквивалент сложной визуализации.

Источники:

- [IBM Design Language — Data visualization basics](https://www.ibm.com/design/language/data-visualization/design/basics/);
- [Atlassian Design — Color](https://atlassian.design/foundations/color);
- [W3C — WCAG](https://www.w3.org/TR/WCAG22/).

**Применение в Lola:** у каждого графика есть итоговая фраза, единица, доступная таблица, keyboard
drilldown и текстовые состояния. Цвет не является единственным носителем роста, риска или серии.

## Полная карта аналитики поддержки

Это catalog target, а не требование поместить все числа на один экран. Backend публикует только
те Metrics и Dimensions, для которых есть owner-approved факты и корректная временная семантика.

### 1. Оперативное состояние

- новые и ожидающие первого ответа обращения;
- открытые, неназначенные, в работе, ожидающие пользователя/систему, отложенные;
- обращения под риском SLA и уже нарушившие SLA;
- возраст самого старого ожидания и распределение возраста очереди;
- active/away/offline operators, доступная и занятая capacity;
- routing offers: выдано, принято, отклонено, истекло;
- delivery/realtime degradation и задержка аналитической projection.

### 2. Входящий поток и backlog

- создано, переоткрыто, решено, закрыто и чистое изменение backlog;
- поступление и завершение по часу/дню/неделе;
- backlog по возрастным корзинам;
- channel, category, priority, language, team, queue, case type;
- duplicates, merges, transfers и повторные назначения;
- сезонность и сравнение с предыдущим сопоставимым периодом.

### 3. Скорость и SLA

- time to first assignment;
- first response, next/subsequent response;
- first resolution и full resolution;
- assignment-to-close и active handling time;
- waiting-for-customer/system/snoozed duration;
- p50/p75/p90/p95, а не только среднее;
- SLA applied/hit/missed, hit rate, miss rate, at-risk и time-to-breach;
- календарное и business time как разные metric definitions;
- нарушение SLA по policy/rule/priority/channel/category/team и reason code.

### 4. Клиентский результат

- CSAT/CES и response coverage;
- first-contact resolution;
- reopen rate;
- recontact 24/48/72 часа и same-category/same-topic recontact;
- abandonment до ответа;
- эскалация, жалоба и возврат после «решения»;
- связь качества и клиентского результата только как association, не причинность.

### 5. Оценка качества

- submitted review count и evaluated coverage;
- overall quality score и распределение, а не только average;
- score по category/item и critical failure rate;
- root causes и coaching themes без текста разговора в агрегате;
- review turnaround и просроченные проверки;
- dispute rate, outcomes и time-to-resolution;
- calibration variance, agreement и reviewer drift;
- доля N/A/незаполненных критериев;
- human/AI agent quality как разные populations.

### 6. Команда, routing и capacity

- assigned/open/snoozed/idle work per team и operator;
- capacity used/available и время at-capacity;
- workload distribution без публичной «турнирной таблицы»;
- assignment acceptance, reassignment, transfer и handoff rate;
- availability duration by state и schedule adherence, если опубликован schedule owner;
- active handling/occupancy только при честном activity contract;
- skill/language eligibility exclusions и routing fallback reasons;
- coverage по часам и прогноз дефицита capacity.

### 7. Автоматизация, Lola и расходы

- involvement, containment и human handoff rates;
- resolution подтверждённый и предполагаемый — отдельно;
- correction/override, false automation и safety escalation;
- classification/escalation accuracy по опубликованным evaluation revisions;
- latency p50/p95, failed/retried/unknown outcomes;
- token/currency cost per Case, resolved Case и accepted reply;
- model/provider/release/channel/language breakdown;
- Copilot suggestion shown/accepted/edited/ignored;
- сравнение с human-only cohort только с предупреждением о selection bias.

### 8. Контент, шаблоны и знания

- Macro usage, applied/edited/cancelled;
- Knowledge search, zero-result, opened/applied и helpfulness;
- устаревшие/непокрытые category/language combinations;
- связь использования с результатом только при owner-defined relationship.

### 9. Внешние задачи и доставка

- created/linked/unlinked external work;
- provider status, pending/unknown/recovered;
- sync/evidence refresh failures и age;
- reply accepted/delivered/read, failed/retried и delivery lag;
- duplicate prevention и unknown-outcome recovery;
- показатели по provider/channel без signed URL, content и credentials.

### 10. Надёжность самой аналитики

- projection lag и data-through;
- completeness/coverage и late facts;
- exact/estimated/suppressed state;
- Query Run duration, route, scanned rows/bytes и cache/coalescing;
- stale/partial/failed results;
- export/schedule success, expiry и revocation;
- owner source gaps, которые нельзя показывать как ноль.

## Что обязано входить в определение показателя

Каждая метрика должна публиковать:

- stable code, title, plain-language question и owner;
- definition revision и effective interval;
- numerator, denominator и population;
- event/time anchor, timezone, Project Business Calendar и границы окна;
- unit, value kind (`COUNT`, `RATE`, `DURATION`, `MONEY`, `SCORE`, `HISTOGRAM`);
- aggregation и разрешённые percentiles;
- compatible Dimensions, filters и comparisons;
- exactness/approximation и uncertainty;
- freshness tier, `computedAt`, `dataThrough` и expected lag;
- coverage, exclusions, corrections и retention;
- no-data/zero/not-applicable/suppressed semantics;
- minimum sample и small-cell suppression;
- classification, read/drilldown/export/share permissions;
- разрешённый drilldown target и безопасные поля;
- source revisions и Resource Receipt schema.

## Обновление данных

### Модель

```text
Committed owner facts
  → Support analytics projection / rollups
  → generation published
  → realtime invalidation without business values
  → UI shows “Есть новые данные”
  → user refreshes or live mode schedules a bounded reread
  → REST Query Result + Resource Receipt remains authoritative
```

SSE умеет доставлять server-to-client events, но транспорт не должен становиться владельцем
аналитического результата. Источник: [MDN — Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

OpenTelemetry различает counter/gauge/histogram, delta/cumulative temporality, gaps и отсутствие
значения. Эти различия должны сохраняться в server projection. Источник:
[OpenTelemetry — Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/).

### Как обновляется интерфейс

- По умолчанию snapshot не меняется под курсором пользователя.
- Realtime invalidation объединяется по Dataset/generation и не содержит числа, IDs End Users или
  content.
- В toolbar показываются `Данные по 14:32`, freshness state и кнопка `Обновить данные`.
- После события появляется спокойная кнопка `Есть новые данные · Обновить`; screen reader получает
  один live announcement.
- Оперативный экран может включить `Обновлять автоматически` с bounded interval; режим не переносится
  на все отчёты и отключается при hidden tab/offline.
- Обновление сохраняет period, filters, comparison, scroll, selected point и opened detail, если
  result identity совместима.
- При несовместимой generation detail закрывается с понятным объяснением.
- Stale data остаются видимыми с маркировкой, если contract разрешает; forbidden data очищаются.
- Skeleton используется только при первом чтении. Повторное обновление сохраняет старый snapshot и
  показывает progress в toolbar без белого мигания страницы.

## UI-направление

### Язык и характер продукта

- **Domain:** поток обращений, очередь, SLA clock, ответственность, доказательство, проверка,
  калибровка, клиентский результат, capacity, аналитическая generation.
- **Color world:** нейтральный рабочий canvas, белая/системная поверхность, operational blue,
  спокойный green для подтверждённого здоровья, amber для риска, red только для breach/critical,
  muted violet только для calibration comparison.
- **Signature:** `Support health spine` — один читаемый путь `Поступило → Назначено → Отвечено →
Решено → Не вернулось → Проверено`, который связывает поток, SLA и качество, но не смешивает их
  определения.
- **Rejecting:** стена одинаковых KPI-карточек → один главный вывод и supporting metrics; rainbow
  dashboard → нейтральные серии с semantic highlights; постоянный auto-refresh → generation badge и
  контролируемое обновление; leaderboard сотрудников → contextual team/operator detail с coverage.

### Информационная архитектура

```text
Поддержка
  Качество
    Очередь проверок
    Проверка
    Оценочные листы
    Калибровки
    Споры
  Аналитика
    Сейчас
    Поток и SLA
    Качество и клиенты
    Команда и нагрузка
    Автоматизация и расходы
    Сохранённые отчёты
```

### Формы данных

- KPI: одно главное число, denominator/coverage, trend и короткое объяснение.
- Line/area: изменение во времени; не больше 3–4 одновременно читаемых series.
- Stacked bar: composition только когда сумма частей действительно образует целое.
- Horizontal bar: category/team/channel comparison.
- Histogram/box-like distribution: response/resolution/handling time; average без distribution
  недостаточен.
- Funnel: committed stage transitions с server denominator.
- Heatmap: hour × weekday, quality item × team, safety/coverage matrix.
- Table: exact values, audit, drilldown и обязательная альтернатива графику.
- Donut: только 2–5 устойчивых категорий, всегда с прямыми labels и table alternative.

### Адаптив

- Desktop: sticky filter/receipt bar, главный вывод, затем 8–12 bounded Widgets на page/tab.
- Tablet: две колонки только для коротких KPI и связанных графиков; tables переходят в scrollable
  region с sticky first column, не расширяют document.
- Mobile: одна аналитическая задача на route; summary → chart/table → drilldown через browser Back;
  filters в отдельной drawer; график всегда переключается в таблицу.
- 200% zoom: reflow без горизонтального document scroll; исключение — ограниченная chart/table
  surface с собственной прокруткой и доступным описанием.

### Анимация и состояния

- Первое открытие: skeleton повторяет геометрию итогового Widget.
- Повторное обновление: старые данные не исчезают; toolbar progress и 120–180 ms opacity transition.
- Drilldown/drawer: 180–220 ms transform/opacity с origin от выбранной точки.
- Числа не «досчитываются» декоративной анимацией.
- `prefers-reduced-motion` отключает движение, но сохраняет status/copy.
- Обязательны: loading, refreshing, empty, no-data, not-applicable, suppressed, stale, partial,
  forbidden, failed, cancelled, expired.

## Локальная архитектурная сверка

Backend уже содержит внутренние `Reporting`, `Dashboard`, `SavedReport` и `ReportDelivery` gateways,
projection/query workers и permissions `project.dashboards.*`, но CMS HTTP/OpenAPI surface для них
не опубликована. Support Quality API уже покрывает scorecards, reviews, disputes, calibrations и
простой operator metrics aggregate.

Следовательно, Ticket 33 должен потребовать:

1. Support owner adapters и versioned Support semantic catalog в общем Reporting context.
2. CMS Product API/OpenAPI для catalog/query/run/result/receipt, Saved Report/Dashboard и delivery.
3. Support-specific curated Dashboard и QA task/sample contracts.
4. Realtime generation invalidation, но без browser-owned truth.
5. Отдельные IAM permissions и suppression для read/drilldown/export/share/authoring.

Нельзя строить временный frontend API, читать domain owner tables напрямую или вычислять employee и
Project metrics из загруженных Cases/Messages.

## Источники, которые нужно сохранить при реализации

- [Intercom reporting definitions](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes)
- [Intercom real-time workload](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity)
- [Intercom office hours](https://www.intercom.com/help/en/articles/8425113-how-to-use-office-hours-in-reporting)
- [Intercom report permissions](https://www.intercom.com/help/en/articles/176-teammate-permissions-how-to-control-workspace-access)
- [Zendesk support metrics](https://support.zendesk.com/hc/en-us/articles/4408832234394-Analyzing-the-metrics-that-matter-to-improve-customer-support)
- [Zendesk QA scorecards](https://support.zendesk.com/hc/en-us/articles/8875998154906-Viewing-and-managing-scorecards)
- [Zendesk QA calibration](https://support.zendesk.com/hc/en-us/articles/7043724530842-Setting-up-calibration-in-Zendesk-QA)
- [Grafana dashboard practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/)
- [IBM data visualization](https://www.ibm.com/design/language/data-visualization/design/basics/)
- [ICO worker monitoring](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/)
- [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [OpenTelemetry Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
