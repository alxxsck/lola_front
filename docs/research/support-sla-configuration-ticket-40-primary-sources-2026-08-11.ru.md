# Frontend Ticket 40 — SLA Configuration Workbench: первичные UX-источники и решение для Lola

Дата исследования: 2026-08-11  
Область: Project-scoped Business Calendar + ordered SLA Policy + server-owned preview/impact + каталог `groupCode` + immutable history/diff/audit + rollback + строгий mutation lifecycle.  
Источник истины для сроков: backend. Браузер не рассчитывает дедлайны, `AT_RISK`, паузы или влияние самостоятельно.

## Короткий вывод

Ticket 40 не должен быть ещё одной длинной settings-формой. Нужен **операционный workbench публикации SLA** с четырьмя ясно разделёнными задачами:

1. собрать календарь в его часовом поясе;
2. упорядочить правила выбора и нормативы;
3. получить server-owned проверку и оценку влияния;
4. осознанно опубликовать новую неизменяемую версию, а затем уметь объяснить или восстановить любую публикацию.

Наиболее полезные внешние паттерны:

- Zendesk — отдельный недельный schedule с timezone, визуальными интервалами, закрытыми днями и holiday list; отдельный упорядоченный список SLA policies, где порядок разрешает пересечения;
- Jira Service Management — несколько интервалов в день, календарь как явная часть SLA goal, группировка нормативов по priority и отдельные start/pause/finish conditions;
- Intercom — компактное совместное редактирование First Reply, Next Reply, Resolution/Close, pause rules и office hours; видимая зависимость `Used by`; объяснение сложных сроков конкретными календарными примерами;
- Salesforce — неизменяемое versioning с номером и notes, создание новой версии вместо правки используемой, оценка числа затрагиваемых записей до применения и явные завершённые/частично завершённые outcomes.

Lola не должна копировать продукт целиком. Решение Lola ниже выводится из уже существующего V1 и целевого контракта Backend Ticket 36. Устаревшие `SHADOW rollout`, canary и feature gate **исключены**: успешная публикация валидной SLA-конфигурации создаёт новую immutable-версию и сразу делает её действующей для системы без отдельного переключателя.

## Метод и границы исследования

- Использованы только первичные источники: официальная product documentation, W3C/WAI, IETF/RFC, IANA и исходные backend/frontend contracts Lola.
- Скриншоты не копируются в репозиторий. Ниже сохранены canonical page URLs и прямые image URLs, чтобы команда могла открыть актуальную first-party версию и проверить лицензию/свежесть перед использованием в design board.
- Внешний продуктовый reference описывает доказанный interaction pattern, но не является нормативным контрактом Lola.
- Названия полей, лимиты, permissions, ETag, idempotency, preview, impact и version semantics должны идти из OpenAPI Ticket 36, а не из Zendesk/Jira/Intercom/Salesforce.

## Что уже задано контрактом Lola

### Существующий V1

Backend уже владеет одной Project-scoped парой `calendar + policy`, одним server draft, Published projection и командами read/replace draft/discard/publish. Текущие DTO задают:

- IANA `timeZone`;
- семь ISO weekdays, до восьми интервалов на день;
- до 730 date exceptions, где пустые intervals закрывают день, а непустые заменяют weekly schedule;
- до 100 ordered rules;
- условия по priority, `groupCode`, case type;
- три обязательных business-time target: first human response, next human response, resolution;
- `atRiskRemainingPercent` от 1 до 90;
- независимые pause statuses для каждого таймера;
- unconditional fallback последним;
- strong `actionEtag`, `If-Match`, `Idempotency-Key`, immutable Policy/Calendar revisions и server `tzdbVersion`/calendar engine revision.

Это видно в [текущем backend DTO](../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.dto.ts), [HTTP controller](../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.controller.ts) и [нормативной модели Ticket 08](../../../Lola_backend/docs/specs/support-platform/08-sla-policy-shadow-clocks.ru.md).

### Что добавляет Backend Ticket 36

Целевой backend должен добавить side-effect-free validate/preview/impact, aggregate revision identity, history/detail/diff/audit, rollback новой immutable-версией, Case-owned catalog `groupCode`, typed drift/conflict/outcome contracts и action-level permissions. Это закреплено в [Backend Ticket 36](../../../Lola_backend/.scratch/support-platform/issues/36-complete-sla-configuration-authoring.md).

В исходном тикете присутствует устаревший rollout. Для Frontend Ticket 40 нормативна актуальная продуктовая договорённость:

- нет rollout/readiness UI;
- нет `DISABLED/SHADOW` управления;
- нет canary/feature gate;
- publish confirmation прямо говорит, что опубликованная валидная конфигурация станет действующей;
- preview остаётся без побочных эффектов, publish остаётся единственным production-changing шагом.

### Текущая frontend-точка расширения

Уже есть route `/support/settings/sla-calendars`, форма календаря/правил, lifecycle `Published → server draft → local form`, локальная проверка, safe draft commands и unknown-outcome retry. Основные точки: [страница](../../src/pages/SupportSlaSettingsPage.vue), [calendar editor](../../src/features/support-sla/ui/SupportBusinessCalendarEditor.vue), [rules editor](../../src/features/support-sla/ui/SupportSlaRulesEditor.vue), [form serialization](../../src/features/support-sla/model/support-sla-configuration-form.ts) и [controller](../../src/features/support-sla/model/use-support-sla-configuration.ts).

Ticket 40 должен эволюционировать этот vertical, а не создавать рядом второй SLA editor.

## Первичные продуктовые references

### 1. Zendesk: calendar как отдельный понятный объект

Официальная документация Zendesk описывает schedule как имя + timezone + weekly business hours + holidays. В недельном редакторе интервалы можно перемещать, растягивать, удалять до состояния `Closed` и добавлять обратно; ночь разбивается по границе календарного дня. Holidays являются исключениями, не считаются business time и показываются хронологическим списком. Источник: [Setting your schedule with business hours and holidays](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays).

Что брать как reference:

- один явно подписанный timezone над расписанием;
- недельная сетка, где открытые и закрытые дни различимы с первого взгляда;
- несколько интервалов в одном дне;
- отдельный holiday/exception list;
- короткое объяснение правила overnight рядом с редактором;
- сохранение calendar как целого объекта, а не по строке.

Что не переносить буквально:

- drag-resize как единственный способ редактирования: Lola обязана сохранить точные inputs и keyboard path;
- ограничения Zendesk в один час/15 минут: у Lola нормативны server limits и seconds/minutes DTO;
- отдельное назначение schedule триггерами: у Lola calendar атомарно входит в одну SLA Configuration revision.

### 2. Zendesk: first-match порядок должен быть видимым

Zendesk прямо указывает: если совпало несколько SLA policies, система выбирает по порядку; наиболее ограничительные правила рекомендуются выше. UI использует grabber и drag-and-drop. Источники: [Ordering SLA policies](https://support.zendesk.com/hc/en-us/articles/5610005534618-Ordering-SLA-policies) и [Defining SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies).

Что брать:

- постоянный номер позиции;
- пояснение «первое подходящее правило применяется» непосредственно над списком;
- компактный summary закрытого правила;
- reorder без открытия rule body;
- fallback визуально закреплён последним.

Усиление для Lola: drag handle — только progressive enhancement. Рядом должны быть доступные `Переместить выше/ниже`, а после изменения порядок и его влияние подтверждает серверный preview.

### 3. Jira Service Management: calendar и goal должны соединяться семантически

Jira предлагает выбрать timezone, рабочие дни, добавить несколько time slots на день (в том числе два интервала вокруг обеда) и holidays; созданный календарь затем выбирается в SLA Goals. Источник: [Set up SLA calendars](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/).

Jira также группирует несколько priority targets под одним родительским условием, сохраняет `All remaining priorities` последним и наполняет dropdown значениями из Jira settings. Источник: [Use priority to group SLA goals](https://support.atlassian.com/jira-service-management-cloud/docs/use-priority-to-group-sla-goals/).

Что брать:

- один rule summary показывает одновременно scope, target matrix и calendar semantics;
- system-owned catalogs наполняют selector, пользователь не вводит внутренний token вслепую;
- catch-all явно подписан «Все остальные», а не выглядит пустым broken rule;
- сложность уменьшается группировкой: условие показывается один раз, приоритетные нормативы — компактной матрицей.

Для Lola priority уже входит в `when`, а targets одинаковы для всего rule; нельзя копировать Jira data model. Полезен только визуальный принцип: scope наверху, нормативы ниже, fallback последним.

### 4. Jira Service Management: пауза — часть lifecycle, а не неясный checkbox

Jira разделяет `Start counting time when`, `Pause counting time when`, `Finish counting time when` и объясняет OR semantics нескольких условий; waiting for customer приведён как pause example. Источник: [Set up SLA conditions](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/).

Lola не должна открывать произвольный condition builder: backend V1 разрешает только `WAITING_END_USER` и `WAITING_SYSTEM` и три независимых clock scopes. Но интерфейс должен перенести удачную семантику:

- строки — «Первый ответ», «Следующий ответ», «Решение»;
- столбцы — допустимые ожидания;
- checked означает «таймер не расходует рабочее время»;
- summary правила человеческим языком: «Решение приостанавливается, пока ждём пользователя или систему».

### 5. Intercom: четыре связанных параметра редактируются вместе

Intercom SLA drawer объединяет target durations, pause rules и linked office hours. Официальная документация различает First Reply, Next Reply, Time to Close/Resolution, паузу на snooze/waiting on customer; edit pre-fills текущие значения. Live list показывает `Used by` и раскрывает зависящие workflows. Источник: [Set SLAs for conversations and tickets](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets).

Что брать:

- targets, pause semantics и calendar context должны быть видимы в одном rule detail;
- список Published entities показывает dependency/usage impact до изменения;
- clone-from-existing ускоряет создание похожего правила;
- drawer/side panel подходит для просмотра details, но не для всей конфигурации из 100 rules.

Lola-решение: full-page workbench; side panel использовать для preview example, revision detail и audit event. Rule edit остаётся inline/accordion, потому что порядок и соседние rules — часть решения.

### 6. Intercom: сложные календарные эффекты нужно объяснять примерами

Intercom отдельно документирует, что office hours и holidays изменяют фактический wall-clock deadline; сообщение в пятницу может получить срок в понедельник, а pause пересекается с non-office hours без двойного вычитания. Также изменение office hours не обязано пересчитать уже существующие target dates. Источник: [SLAs and office hours](https://www.intercom.com/help/en/articles/9263617-slas-and-office-hours).

Для Lola это аргумент в пользу server-owned «контрольных примеров», а не browser math:

- input facts: локальный момент поступления, priority, case type, group;
- выбранное правило и почему;
- first/next/resolution deadlines с timezone/offset;
- участки рабочего и нерабочего времени;
- `AT_RISK` moment;
- pause/reopen caveats из server explanation;
- явная подпись версии calendar engine/tzdb для historical detail.

### 7. Salesforce: version notes и новая версия вместо изменения истории

Salesforce Entitlement Process versioning сохраняет несколько версий, использует version number + notes для различения и создаёт new version из выбранной старой. Новая версия не обязана автоматически заменять предыдущую. Источники: [Create a New Version of an Entitlement Process](https://help.salesforce.com/s/articleView?id=service.entitlements_process_creating_new_versions.htm&language=en_US&type=5), [Updating an Entitlement Process](https://help.salesforce.com/s/articleView?id=entitlements_versioning_overview.htm&language=en_US&type=5) и [Create a Version of an SLA Policy](https://help.salesforce.com/s/articleView?id=service.sla_creating_new_version.htm&language=en_US&type=5).

Что брать:

- version number, author/time и обязательный human-readable reason/notes;
- read-only Published detail;
- «создать следующую версию из этой» вместо редактирования истории;
- rollback не двигает pointer назад и не удаляет более новые versions.

Lola отличается: согласно Ticket 36 rollback создаёт новую immutable aggregate revision с audit provenance. UI должен говорить «Восстановить как новую публикацию», показывать `источник: версия N` и будущий номер; слова «откатить историю» избегать.

### 8. Salesforce: impact до действия и честный partial outcome

При обновлении entitlement process Salesforce показывает оценку числа entitlements/support records, затем progress; итог может быть `Completed` или `Completed With Exceptions`. Источник: [Use a New Version of an Entitlement Process](https://help.salesforce.com/s/articleView?id=sf.entitlements_process_using_new_versions.htm&language=en_US&type=5).

Что брать:

- до publish показывать bounded server estimate и его freshness;
- отделять evaluated count от exact count;
- не превращать partial/unknown outcome в success;
- после команды показывать canonical receipt, а не оптимистическое «готово».

Lola publish применяется прямо и атомарно; progress migration UI не нужен. Но preview должен явно различать `exact`, `bounded`, `sampled` или иной server-provided quality, а unknown outcome блокирует новый intent до outcome lookup/reconcile/exact retry.

### 9. Salesforce: календарь и milestone могут иметь разные scopes — полезное предупреждение, не модель Lola

Salesforce документирует приоритет business hours на milestone/process/record и паузу timer вне рабочих часов. Источники: [How Business Hours Work in Entitlement Management](https://help.salesforce.com/s/articleView?id=service.entitlements_business_hours.htm&language=en_US&type=5) и [Milestone Stop and Resume Behavior](https://help.salesforce.com/s/articleView?id=service.entitlements_milestones_timer_behavior.htm&language=en_US&type=5).

Lola не должна вводить такую иерархию: один aggregate revision атомарно pin-ит один Business Calendar и один SLA Policy. Полезный вывод — во всех preview/detail показывать **какая именно calendar revision** использована и не оставлять «рабочее время» без provenance.

## Визуальные references: страницы и прямые изображения

Все изображения принадлежат соответствующим продуктам. Использовать как reference для анализа композиции, не копировать в production assets.

| Reference | Canonical page | Direct image URL | Что рассмотреть | Что не копировать |
| --- | --- | --- | --- | --- |
| Zendesk schedule header | [Schedule docs](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays) | [schedules_1.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/schedules_1.png) | name + timezone над weekly schedule | Zendesk chrome и product color |
| Zendesk weekly time grid | [Schedule docs](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays) | [schedules_to_nearest_15_min.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/schedules_to_nearest_15_min.png) | открытый/закрытый день, интервал как блок, быстрая обзорность недели | drag-only editing, 15-minute restriction |
| Zendesk add holiday | [Schedule docs](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays) | [schedules_2.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/schedules_2.png) | компактный add exception flow | отсутствие partial-day semantics Lola |
| Zendesk schedule actions | [Schedule docs](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays) | [schedules_3.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/schedules_3.png) | secondary actions в overflow | скрывать частые действия на touch |
| Zendesk edit holiday | [Schedule docs](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays) | [schedules_4.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/schedules_4.png) | upcoming/past exception list и row edit | Zendesk-only date horizon |
| Zendesk SLA conditions | [Policy docs](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies) | [sla_define_conditions_new.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/sla_define_conditions_new.png) | condition rows и autocomplete | arbitrary field builder — Lola grammar closed |
| Zendesk metrics selection | [Policy docs](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies) | [sla_slametrics_define_new.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/sla_slametrics_define_new.png) | группировка response/update/resolution metrics | метрики вне Ticket 36 |
| Zendesk target matrix | [Policy docs](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies) | [sla_define_metrics_new.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/sla_define_metrics_new.png) | плотная матрица target + operating hours | Zendesk priority-target model |
| Zendesk compact metric summary | [Policy docs](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies) | [sla_metric_defined_new.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/sla_metric_defined_new.png) | summary после настройки без повторного открытия | скрывать rule selection scope |
| Zendesk reorder start | [Ordering docs](https://support.zendesk.com/hc/en-us/articles/5610005534618-Ordering-SLA-policies) | [slasgrabpolicy.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/slasgrabpolicy.png) | grabber + numbered/ordered list | hover-only discoverability |
| Zendesk reorder result | [Ordering docs](https://support.zendesk.com/hc/en-us/articles/5610005534618-Ordering-SLA-policies) | [slasdragpolicy.png](https://zen-marketing-documentation.s3.amazonaws.com/docs/en/slasdragpolicy.png) | drop location feedback | отсутствие keyboard alternative |
| Jira grouped priority goals | [Priority grouping docs](https://support.atlassian.com/jira-service-management-cloud/docs/use-priority-to-group-sla-goals/) | [screenshot_SLAgrouping](https://images.ctfassets.net/zsv3d0ugroxu/hI6akUr2ZERfFsVhT9eSq/87019e58b83fc781d460eae23a3d4323/screenshot_SLAgrouping) | parent condition + child target rows + remaining fallback | JQL exposure и Jira data model |
| Jira migrated existing goals | [Priority grouping docs](https://support.atlassian.com/jira-service-management-cloud/docs/use-priority-to-group-sla-goals/) | [screenshot_SLAGroupingExistingConfigMigrated](https://images.ctfassets.net/zsv3d0ugroxu/36eT0wDDvVlddvyG4O6QMJ/9dc4a422e408bf3fe5b0ecbdbe71c325/screenshot_SLAGroupingExistingConfigMigrated) | explicit `All matching/remaining` row | migration-specific messaging |

## Нормативные источники и обязательные последствия

Product docs и screenshots выше — только UX references. Нормативные внешние источники определяют семантику времени, HTTP concurrency и accessibility; полную business schema всё равно задаёт OpenAPI Lola.

| Нормативный источник | Что он определяет | Обязательное последствие для Ticket 40 |
| --- | --- | --- |
| [IANA tzdb Theory](https://www.iana.org/time-zones/theory), [tzdb overview](https://www.iana.org/time-zones/tz-link), [RFC 9557](https://www.rfc-editor.org/rfc/rfc9557.html) | named zones, mutable timezone rules, ambiguous/nonexistent local time | хранить IANA ID; offset только подсказка; deadline/DST только с backend |
| [Unicode CLDR timezone names](https://unicode.org/reports/tr35/tr35-dates.html#Time_Zone_Names) | локализованные timezone labels | human label + точный IANA ID, поиск не только по offset |
| [WHATWG local datetime](https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type=datetime-local)) | local datetime input не содержит timezone | выбранная SLA timezone всегда видима; не использовать timezone устройства |
| [RFC 9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1), [ETag](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3) | opaque validator и lost-update prevention | ETag не парсить; stale write не повторять с новым ETag молча |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) | typed HTTP Problem Details | machine branch по stable type/code; detail не парсить; field pointers связать с inputs, если backend выберет этот format |
| [WCAG Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | keyboard и non-drag alternative | rules reorder имеет видимые `Выше/Ниже`, drag только ускоритель |
| [APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [WCAG Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) | focus/confirmation/review | publish/rollback review + confirm; draft save без лишнего modal |
| [WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | programmatic announcements и 320 CSS px reflow | save/preview/reorder announcements; mobile unified diff и сохранение всех actions |

IETF draft `Idempotency-Key` не является финальным RFC. Exact retry в Ticket 40 опирается на опубликованный Backend 36 contract; Stripe ниже — first-party behavioral reference, не универсальный HTTP standard.

## Решение Lola: Information Architecture Ticket 40

### Главный пользователь и задача

Пользователь — Support Lead/администратор проекта, который отвечает за обещанные сроки и меняет их нечасто, но с большим operational impact. За пять минут до входа он изучал нарушения/нагрузку; через пять минут после публикации должен быть способен объяснить, почему конкретное обращение получило именно такой срок.

Интерфейс должен ощущаться как **спокойный контрольный стол перед публикацией**, а не как конструктор автоматизаций: высокая информационная плотность, минимум декоративного цвета, чёткая причинность, server evidence рядом с действием.

### Domain exploration для дизайна

- Domain: рабочее окно, норматив, первое совпадение, остаток времени, пауза, исключение, публикация, provenance, аудит, восстановление.
- Color world: нейтральный рабочий стол; спокойный синий для server-verified; янтарный для warning/AT_RISK; красный только breach/destructive; зелёный только confirmed Published; приглушённый серый для non-working/unchanged.
- Signature: **«Линейка срока»** в server preview — локальный received time → рабочие интервалы/паузы → `AT_RISK` → deadline, с подписью выбранного rule/calendar revision. Это элемент, характерный именно для SLA workbench.
- Rejecting defaults:
  - два одинаковых больших card-column → центральный editor + доказательная preview rail;
  - свободный JSON/textarea для `groupCode` → catalog-backed searchable selector с label + code;
  - wizard «Назад/Далее» → одна versioned work surface с anchors, потому что календарь и правила нужно сверять вместе;
  - один зелёный «валидация пройдена» → structured issues/warnings/impact + exact server receipt;
  - drag-only rules → drag + explicit move buttons + announced new position.

### Desktop shell

Рекомендуемая структура при ширине от ~1180 px:

```text
Page header: SLA Configuration                 [История] [Обновить]
Published v12 · действует сейчас     Draft v4 · изменён 8 мин назад
─────────────────────────────────────────────────────────────────
Anchors (220)        Editor (minmax 620)        Проверка (360–420)
Календарь            timezone/week/exceptions  status + issues
Правила              ordered compact cards     selected-rule example
Паузы и нормативы    expanded active rule      impact summary
Публикация                                      timeline / provenance
─────────────────────────────────────────────────────────────────
Sticky command bar: локально / draft / preview freshness
                    [Отменить] [Сохранить] [Проверить] [Опубликовать]
```

Ключевой focal point — состояние «готово/не готово к публикации» в правой rail и primary action в command bar. Lifecycle не должен занимать три равновесные декоративные cards: Published, draft и local edits показываются одной компактной version line.

### Состояния верхнего уровня

1. `UNCONFIGURED` — нет Published и draft; CTA «Создать конфигурацию», никакой выдуманной default policy.
2. `PUBLISHED_READ_ONLY` — summary текущей версии + preview examples + history; нет disabled-editing на сотнях inputs.
3. `DRAFT_SYNCED` — server draft открыт, локально чисто.
4. `LOCAL_DIRTY` — изменения только в браузере; preview помечен устаревшим.
5. `VALIDATING` — server preview pending, previous result остаётся видимым как stale, не исчезает.
6. `PREVIEW_READY_WITH_WARNINGS` / `PREVIEW_READY` — canonical normalized config и impact привязаны к fingerprint candidate.
7. `CONFLICT` — локальная форма сохранена; server head перечитан; доступны compare/rebase/reset, а не только «взять сервер».
8. `UNKNOWN_OUTCOME` — blocking recovery surface, новые intents запрещены.
9. `FORBIDDEN/REVOKED` — protected draft/detail немедленно очищены; опубликованная проекция также скрывается согласно permission contract.
10. `DEGRADED/UNAVAILABLE` — модуль остаётся видимым, но не обещает актуальность preview/history.

## Calendar editor

### Timezone

Свободный `InputText Europe/Madrid` заменить searchable combobox, наполненным server/standard catalog, с сохранением IANA zone ID как value. В option показывать:

- human-readable label: `Madrid` / `Europe/Madrid`;
- текущий offset как вспомогательный, но не как identity;
- локальное время «сейчас»;
- ближайшее известное DST изменение, если сервер его возвращает;
- pinned `tzdbVersion` только в technical detail/history, не как обычный label.

Не хранить fixed UTC offset вместо IANA name. Не обещать браузерную валидацию актуальности tzdb: browser check может дать мгновенную подсказку, authoritative result возвращает server preview.

Это не только UX preference. IANA определяет named zone как набор исторических и актуальных правил, которые могут меняться с выпусками tzdb; одинаковый текущий offset не доказывает одинаковые будущие правила. Источники: [IANA Time Zone Database — Theory](https://www.iana.org/time-zones/theory) и [IANA Time Zone Database overview](https://www.iana.org/time-zones/tz-link). [RFC 9557](https://www.rfc-editor.org/rfc/rfc9557.html) отдельно описывает, что local time у timezone transition может соответствовать нулю или нескольким instants, а offset alone недостаточен для будущих календарных вычислений.

Для human label использовать локализованные generic location names из CLDR, сохраняя IANA ID видимым вторично. Рекомендованный option: `Мадридское время — Europe/Madrid — сейчас UTC+02:00`. Current offset — подсказка на текущий момент, не stable identity. Источник: [Unicode CLDR — Time Zone Names](https://unicode.org/reports/tr35/tr35-dates.html#Time_Zone_Names).

### Weekly schedule

Каждая weekday row:

- checkbox/toggle `Рабочий день`;
- один или несколько точных `start – end` inputs;
- `Добавить интервал`;
- `Копировать на…` для массового применения к выбранным дням;
- visible total «8 ч» как локальная помощь, но не server deadline;
- closed state явно показывает `Выходной`, не пустое место;
- overnight input допустим в UI, но рядом объяснение «сервер нормализует в два дня» и preview canonical split.

Визуальная time strip повышает обзорность, но inputs остаются source of user input. Перетаскивание/resize опциональны.

### Exceptions и праздники

Один model: date exception. Presentation различает:

- `Закрыто весь день` — empty intervals;
- `Особые часы` — intervals replace weekly schedule;
- `Обычный день` — отсутствие exception.

UX:

- add single date или range только если будущий backend contract действительно принимает range; V1 сохраняет отдельные dates, поэтому frontend может batch-expand лишь с явной проверкой лимита 730 и review результата;
- upcoming list по умолчанию, past отдельно/collapsed;
- duplicate date подсвечивается в строке;
- bulk delete требует confirmation только если удаляется много exceptions; одна несохранённая локальная строка удаляется сразу с undo;
- list virtualization/pagination после десятков дат, но keyboard search и переход к issue остаются.

Если где-либо используется `<input type="datetime-local">`, его значение по HTML Standard не содержит timezone. Рядом обязан быть постоянный контекст выбранной IANA-зоны; интерпретация в timezone устройства запрещена. Date-only exception нужно сериализовать как local calendar date, не преобразовывая через UTC `Date`. Источник: [WHATWG HTML — Local Date and Time state](https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type=datetime-local)).

### DST presentation

Backend Ticket 08 задаёт сложную семантику nonexistent/repeated local minutes и pin-ит tzdb/calendar engine. Поэтому Ticket 40:

- никогда не вычисляет authoritative business seconds браузером;
- server warnings показываются возле затронутой даты/weekly interval;
- spring gap объясняется как «этого локального времени не существует»;
- autumn repeat объясняется как «интервал встречается дважды»;
- preview даёт абсолютные instants + local formatted values + offset;
- historical detail всегда использует pinned server timezone provenance, а не текущую browser tzdb для пересчёта.

## Ordered rules editor

### Compact row

Закрытая rule card должна отвечать на пять вопросов без открытия:

1. позиция и stable code;
2. человеческий scope (`VIP-клиенты · Critical/High · Action request`);
3. три target (`15 мин · 1 ч · 8 ч`);
4. risk threshold (`риск при 20% остатка`);
5. pause summary.

Если rule никогда не выбран preview corpus, показывать warning `Не покрывает текущую выборку`, но не объявлять rule недостижимым без server evidence.

### Reordering

- Drag handle на desktop.
- `Переместить выше`/`Переместить ниже` доступны по keyboard и touch.
- Можно предложить `Home/End` или modifier shortcuts только как documented enhancement.
- После move сохранять focus на перемещённой card и объявлять через polite live region: «Правило VIP перемещено на позицию 2 из 8».
- Fallback нельзя переносить или condition; оно отделено тонким divider и подписано `Для всех остальных`.
- Preview invalidates немедленно; publish запрещён до fresh server preview exact candidate.

Pointer-only drag нарушает не только keyboard path: WCAG 2.2 SC 2.5.7 требует single-pointer альтернативу без dragging, если drag не essential. Источники: [Understanding Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) и [Understanding Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html). Видимые buttons `Выше/Ниже` обязательны; `Alt+↑/↓` можно добавить как ускоритель с `aria-keyshortcuts`, но не вместо buttons.

### Conditions и `groupCode` catalog

`groupCodesText` должен исчезнуть. Новый selector:

- server-provided catalog revision;
- searchable multi-select;
- primary label человека, secondary monospace code;
- lifecycle badge только для unavailable/retired;
- selected retired value остаётся читаемым в historical revision;
- новое правило не может выбрать retired/unknown;
- `UNMAPPED` показывается человечески («Не определена») только если backend разрешает его для authoring;
- selected values не теряются при pagination/search;
- catalog drift 409 предлагает перечитать catalog и показывает, какие selections стали недоступны.

Catalog label — presentation. Stable code — submitted identity. Frontend не заменяет code при переименовании label.

### Targets

Три duration controls лучше представить одной matrix row, а не тремя одинаковыми вертикальными секциями:

| Таймер | Норматив | Паузы | Человеческое объяснение |
| --- | --- | --- | --- |
| Первый ответ оператора | duration | statuses | от создания/принятия согласно server semantics |
| Следующий ответ | duration | statuses | после очередного сообщения пользователя |
| Решение | duration | statuses | до resolution occurrence |

Input принимает удобные hours/minutes, но сериализует точное число секунд по контракту. Всегда показывать normalized summary (`1 д 4 ч рабочего времени`) и limits. Не использовать один dropdown из preset durations: custom valid value обязано поддерживаться.

### `AT_RISK`

Поле подписать не «порог AT_RISK 20%», а:

> Пометить «под угрозой», когда останется **20%** нормативного рабочего времени (израсходовано 80%).

Рядом mini bar, но numeric input обязателен. Preview показывает абсолютный `AT_RISK at` для примера. Цвет не единственный носитель состояния.

### Pause matrix

Два allowlisted статуса × три clocks удобнее шести multiselect chips. Использовать table/fieldset с row/column headers и checkboxes. Под matrix — сгенерированные human sentences. Unknown future status не отображать как unchecked known option; fail closed и показать contract update error.

## Server-owned preview и impact

### Команда и freshness

`Проверить изменения` отправляет candidate `calendar + policy` в side-effect-free endpoint и **не создаёт draft/revision**. Preview response связывается с:

- candidate hash/fingerprint;
- evaluated root/catalog versions;
- evaluatedAt;
- canonical normalized configuration;
- validation issues/warnings;
- impact quality/bounds;
- examples and selected-rule explanations.

Любое локальное изменение делает result stale. Stale preview можно оставить для сравнения, но publish запрещён или требует server revalidation согласно итоговому OpenAPI.

### Preview rail: порядок информации

1. readiness: ошибки, warnings, fresh/stale;
2. coverage: сколько cases match each rule, сколько только fallback, сколько неоценено;
3. delta vs Published: быстрее/медленнее/другое правило/другой calendar outcome;
4. три–пять безопасных representative examples без Case PII;
5. «линейка срока» выбранного example;
6. technical provenance collapsed.

### Exactness

UI повторяет server terms дословно:

- exact count → «1 284 обращения»;
- bounded → «не более 1 500» / server lower-upper;
- sampled → sample size + extrapolation caveat;
- unavailable → не подменять нулём;
- truncated list → «показаны 20 из …»;
- stale → result remains visible but clearly not publish proof.

`0` и `неизвестно` — разные состояния.

### Example explorer

Два режима, если backend их предоставляет:

- generated server examples — быстрые контрольные сценарии;
- aggregate impact sample — de-identified representative facts.

Filters: priority, case type, group label/code, received local time, initial status. Изменение фильтра вызывает новый server preview или выбирает из server-returned bounded examples; браузер не подменяет rule matching.

## Save, publish и direct stable behavior

### Command bar

В одной строке показывать три независимых факта:

- local: `Есть несохранённые изменения`;
- draft: `Черновик v4 сохранён 14:32`;
- preview: `Проверено для текущего черновика 14:34`.

Actions:

- `Отменить локальные изменения`;
- `Сохранить черновик`;
- `Проверить`;
- `Опубликовать` primary только при доступном action и fresh valid evidence.

### Publish confirmation

Это high-impact, но не destructive delete. Modal содержит:

- будущий version number, если server его гарантирует, иначе «новая версия»;
- concise semantic diff: timezone/calendar/rules/targets/pauses;
- impact summary с exactness и evaluatedAt;
- warnings requiring explicit acknowledgement;
- обязательный publish reason/note, если контракт Ticket 36 его требует;
- явный текст: **«После успешной публикации эта конфигурация сразу станет действующей для новых server-owned SLA calculations. Отдельного rollout-переключателя нет.»**
- secondary `Отмена` получает initial focus, если публикацию трудно отменить;
- primary label `Опубликовать и применить`.

Не писать «создаст версии, но не включает SLA»: это устаревшая SHADOW semantics.

### Publish success

Успех только после exact mutation receipt или outcome lookup/reconcile:

- Published version ID/number;
- server publishedAt;
- publisher/reason;
- content hash short form + copy technical details;
- link `Открыть версию`;
- impact result помечается historical evidence, не current live count.

## History, detail, diff, audit

### History list

Cursor-paginated table/list:

- version number;
- publishedAt в project/user locale + absolute timezone on demand;
- actor display snapshot;
- publish reason;
- source: regular publish / restored from vN / legacy backfill;
- counts of semantic changes;
- eligibility/action `Сравнить`, `Открыть`, `Восстановить как новую`.

Legacy provenance gaps показываются `Недоступно в старой версии`, не выдуманным system actor.

### Revision detail

Read-only exact aggregate:

- policy revision pin;
- calendar revision pin;
- compiler/calendar engine/tzdb versions;
- source draft generation;
- hashes, server timestamps, publisher/reason;
- normalized calendar/rules in friendly rendering;
- audit events и runtime references только в объёме permission contract.

Не показывать raw JSON как основной detail; добавить `Технические данные` collapsed/copy для support engineers.

### Semantic diff

Default diff — domain-aware:

- `Calendar`: timezone, weekday intervals, exceptions added/removed/changed;
- `Rules`: added/removed/moved;
- `Conditions`: catalog labels + stable codes;
- `Targets`: old → new with faster/slower annotation;
- `AT_RISK`: remaining + consumed interpretation;
- `Pauses`: status added/removed per clock;
- `Provenance`: compiler/tzdb change отдельно от authored content.

Moved rule не должен выглядеть как delete+add. Renamed catalog label без code change не должен выглядеть как policy semantic change; его можно показать как catalog presentation drift.

Здесь есть точные first-party аналоги immutable restoration, хотя их domain не SLA:

- Azure App Configuration называет snapshots immutable и связывает их с version history/comparison/audit: [Snapshots overview](https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-snapshots);
- AWS AppConfig предлагает копировать прошлую version в новый draft/version, а не править прошлую: [Edit configuration version](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-profile-feature-flags-editing-version.html);
- Confluence при restore создаёт latest copy выбранной старой версии и сохраняет последующие версии: [Page versions and history](https://support.atlassian.com/confluence-cloud/docs/create-edit-and-publish-a-page/#Pageversionsandhistory);
- HCP Terraform rollback создаёт новую state version: [Rollback to a previous state version](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/state-versions#rollback-to-a-previous-state-version).

Reference применяется только к immutable history/diff/restore. Deployment, rollout или staged activation из этих продуктов в Ticket 40 не переносится.

### Rollback

User-facing flow называется `Восстановить версию N как новую`:

1. открыть exact historical detail;
2. server diff `current Published ↔ source vN`;
3. server impact preview для restoration candidate;
4. reason;
5. confirmation, что новая immutable version станет действующей сразу;
6. mutation с expected current ETag + new idempotency key;
7. exact receipt или unknown-outcome recovery.

Нельзя:

- редактировать vN;
- удалять версии между vN и current;
- молча мигрировать already pinned active Case occurrences;
- показывать rollback action для legacy/ineligible source;
- говорить «вернулись на vN» без пояснения «создана новая версия из vN».

### Audit

History отвечает «что опубликовано», audit — «какие команды и решения были». Разделить filters/events:

- draft saved/discarded;
- preview evaluated, если backend аудитит protected impact read;
- publish attempted/succeeded;
- rollback attempted/succeeded;
- conflict/permission/break-glass evidence только по разрешению;
- actor/request/correlation provenance.

Version history и audit нельзя смешивать в одну таблицу. Official GitHub audit log фильтрует события по actor, action, resource и date и раскрывает event detail; это reference для отдельного audit projection, а не для published versions: [Reviewing the audit log for your organization](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization). Аналогично Azure App Configuration разделяет audit/write operations и request metrics: [Monitor App Configuration](https://learn.microsoft.com/en-us/azure/azure-app-configuration/monitor-app-configuration).

## Строгие ошибки и unknown outcome

### Field validation

Backend issue должен иметь stable code + path. Frontend:

- summary с количеством и first-error focus link;
- issue возле конкретного weekday/exception/rule/target;
- human copy + технический code в details;
- warning не смешивается с blocking error;
- unknown code fail closed: «Контракт проверки обновился; перечитайте страницу», а не generic success.

Если Backend Ticket 36 оформляет typed errors как `application/problem+json`, frontend должен ветвиться по стабильному `type`/domain code и HTTP status, не парсить human `title/detail`. RFC допускает extension со списком violations и JSON Pointer к полю; `instance` можно показывать как support reference. Источник: [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html). Если backend использует собственную closed schema `{ code, details }`, нормативом остаётся OpenAPI Lola, а RFC — лишь reference структуры.

### `409` classes

- stale root/draft: сохранить local form, перечитать head, предложить semantic compare;
- catalog drift: перечитать catalog, отдельно отметить retired/missing selections;
- duplicate Published: открыть существующую identical version, не предлагать бесконечный retry;
- draft missing: вернуться к Published/empty state и предложить создать новый draft;
- idempotency key reused with different body: заблокировать попытку и создать новый intent только после явного решения пользователя;
- rollback ineligible: объяснить legacy/provenance cause из server code.

Если финальный backend применяет стандартный `412 Precondition Failed` для `If-Match`, UI обрабатывает его как stale state так же строго, как typed OCC `409`. `428 Precondition Required` в штатном клиенте означает потерянный conditional header: reload + telemetry, не automatic force-save. Источники: [RFC 9110 — 412](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.13) и [RFC 6585 — 428](https://www.rfc-editor.org/rfc/rfc6585#section-3).

### Unknown outcome

После timeout/network loss нельзя показывать «не удалось» как факт. Blocking banner:

> Сервер мог завершить публикацию, но подтверждение не получено. Пока результат не установлен, новая публикация заблокирована.

Порядок recovery:

1. exact outcome lookup, если endpoint опубликован;
2. GET reconcile текущего root/history;
3. exact retry с теми же body, `Idempotency-Key` и `If-Match`;
4. только после terminal outcome разрешить новый intent.

Первичный reference для exact retry — [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests), где повтор с тем же key возвращает сохранённый результат, а несоответствие parameters отклоняется. Норматив Lola всё равно задаёт собственный backend receipt/outcome contract.

### Optimistic concurrency

HTTP `If-Match` предназначен для предотвращения lost update при state-changing methods: [RFC 9110, If-Match](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1). Следовательно:

- ETag — opaque; frontend не парсит version из строки;
- следующая mutation использует последний server-returned strong ETag;
- `409/412` не обходится force-save;
- response mutation atomic receipt предпочтительнее дополнительного optimistic GET; reconcile нужен для ambiguous transport outcome или contract requirement.

## Permissions

- `project.support.sla.read`: Published/current history/detail/diff в разрешённом объёме; draft скрыт.
- `project.support.sla.manage`: draft/preview/publish/rollback только если соответствующее `allowedAction` доступно.
- per-Case `project.support.sla.correct` не открывает settings authoring.
- UI использует server `allowedActions` на action level, но route-level permission guard остаётся fail closed.
- 403/revocation очищает protected draft, preview samples, history detail и recovery command из памяти.
- concealed cross-project 404 не раскрывает существование конфигурации.
- hidden button не считается security boundary.

## Accessibility и keyboard

### Dialogs

WAI-ARIA APG требует trap focus внутри modal, `Escape` close и возврат focus к invoking control; для трудно обратимого final step рекомендует initial focus на least destructive action. Источник: [WAI-ARIA Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Publish/rollback/discard dialogs должны использовать существующий accessible PrimeVue primitive, а не custom overlay.

WCAG error prevention не требует modal для каждого draft save. Значимые изменения должны быть reversible, checked или confirmed; в Lola draft save остаётся быстрым, а Published change проходит server preview/review и confirmation. Источник: [Understanding Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html).

### Catalog combobox

Timezone и `groupCode` используют combobox/listbox semantics: `Enter` принимает focused option, `Escape` закрывает popup и возвращает focus; browser text editing keys не перехватываются. Источник: [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

Group options должны иметь короткое уникальное accessible name; длинные составные интерактивные rows не помещать в plain listbox, потому что APG отмечает, что listbox option воспринимается как плоская строка и не поддерживает вложенные controls. Источник: [WAI-ARIA Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).

### Reordering

Rule ordering не зависит от pointer. Использовать native buttons/toolbar для move up/down; drag handle имеет keyboard alternative. Focus сохраняется, новая позиция объявляется через `role=status`. Если реализуется составной reorder widget, ориентир — [APG rearrangeable listbox examples из Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/), но сложные rule cards с вложенными controls лучше сохранять семантическим списком статей и отдельными buttons.

### Status messages

Save/preview/publish result, validation count и recovery progress должны программно объявляться без принудительного focus. WCAG 2.2 SC 4.1.3 требует programmatically determinable status message; W3C рекомендует `role=status` для результата/состояния и `role=alert` для ошибки, но предупреждает против слишком chatty live regions. Источник: [Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages).

### Calendar and matrices

- Недельный editor остаётся semantic list/table с реальными labels; не применять `role=grid`, пока не реализован полный arrow/Home/End/edit-mode keyboard contract.
- Pause matrix может быть native `<table>` с `<th scope>` и checkbox labels.
- Date picker использует доступный tested primitive; ручной `YYYY-MM-DD` input может быть дополнительным path.
- Ошибка связана с input через `aria-describedby`/`aria-invalid`; summary link переводит focus в control.
- `AT_RISK`, warning и diff additions/removals различаются текстом/иконкой, не только цветом.

Если PrimeVue DatePicker используется как modal calendar, проверить фактический keyboard contract: arrows по дням, `Home/End` по неделе, `Page Up/Down` по месяцам, `Enter/Space` для выбора, `Escape` с возвратом focus и live announcement месяца/года. Ориентир: [WAI-ARIA Date Picker Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/). APG помечает examples как illustrative, поэтому обязательны реальные tests с keyboard и VoiceOver/NVDA.

### Responsive/reflow

WCAG Reflow требует сохранить информацию/функции без двухмерного scrolling при эквиваленте 320 CSS px, кроме действительно двумерных областей: [Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Решение:

- 1180+ px: editor + preview rail;
- 760–1179 px: preview становится full-width sticky/collapsible section над command bar;
- <760 px: anchors превращаются в horizontal tabs/section menu; rule summaries и target matrix складываются в вертикальные rows;
- history table становится list cards с теми же actions;
- diff показывается unified sections, не side-by-side;
- sticky command bar может быть в две строки, buttons минимум 44 px hit area;
- modal width `min(..., viewport - 32px)` и содержимое reflows;
- preview timeline допускает собственный horizontal scroll только если абсолютная шкала действительно требует двумерности; под ней обязательна текстовая последовательность.

WCAG 2.2 AA задаёт target минимум 24×24 CSS px либо достаточное spacing; 40–44 px для row actions — проектное усиление Lola, а не цитата норматива. Источник: [Understanding Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Scale и performance

Контракт допускает 100 rules и 730 exceptions, поэтому acceptance должен включать:

- collapsed rule virtualization только если не ломает focus/anchor; открытый rule никогда не unmount внезапно;
- search/filter rules по code, catalog label, priority/type;
- `Показать только изменённые/с ошибками/с warning`;
- server-side cursor pagination истории/audit;
- diff загружается по требованию и имеет truncation markers;
- preview abort/debounce для явных быстрых filters, но основная проверка запускается явной кнопкой;
- stale responses отбрасываются по candidate hash/request generation;
- project/actor/permission switch abort-ит requests и purges state;
- no PII в impact examples; bounded counts и response size соблюдаются.

## Конкретный scope Frontend Ticket 40

### Обязательно

- синхронизировать pinned OpenAPI после Backend Ticket 36;
- расширить существующий repository/source endpoints: read, draft lifecycle, preview/impact, catalog, history list/detail, diff, audit, rollback, outcome lookup;
- domain adapter для unknown enums/codes и `allowedActions` fail closed;
- переработать calendar editor;
- catalog-backed group selector;
- accessible ordered rules и fallback;
- target/pause matrix;
- server preview/impact workbench;
- direct stable publish confirmation;
- history/detail/semantic diff/audit;
- restore-as-new immutable flow;
- exact unknown-outcome recovery;
- permissions/revocation purge;
- loading/empty/error/conflict/stale/degraded states;
- responsive desktop/tablet/mobile и keyboard path;
- unit/component/API adapter/e2e coverage с generated fixtures.

### Не входит

- расчёт deadline/AT_RISK/BREACHED в браузере;
- редактирование текущих Case clocks;
- migration already pinned active occurrences;
- routing/workforce settings;
- rollout, canary, feature gate, SHADOW enable/disable;
- arbitrary condition builder/JQL;
- импорт государственных holidays, если backend не публикует authoritative provider/catalog;
- правка immutable history.

## Acceptance checklist UX

- [ ] Read-only user видит Published summary/history, но никогда draft content/actions.
- [ ] Manager может начать draft из Published или empty state, сохранить/discard с ETag/idempotency.
- [ ] Timezone выбирается из доступного catalog/combobox; ID остаётся IANA name.
- [ ] Weekday closed/open, split intervals, overnight normalization и exceptions понятны без документации.
- [ ] `groupCode` выбирается по human label, code виден вторично; retired/unknown handled explicitly.
- [ ] Первое совпадение и fallback видны в compact list; reorder работает pointer, touch и keyboard.
- [ ] Все три targets, remaining-risk interpretation и pause matrix объясняются human copy.
- [ ] Preview не меняет server draft/revision и привязан к exact candidate hash.
- [ ] Impact различает exact/bounded/sampled/unavailable и не показывает PII.
- [ ] Publish невозможен при blocking issues/stale proof/unknown outcome/forbidden action.
- [ ] Confirmation содержит semantic diff, impact, reason и прямое применение после успеха.
- [ ] Success основан на exact receipt/reconcile; timeout не превращается в failure или success.
- [ ] History cursor-paginated; detail exact; diff semantic; audit separate.
- [ ] Restore создаёт новую immutable version из historical source и сразу применяет её после успешной публикации.
- [ ] Conflict сохраняет local edits и предлагает compare, а catalog drift указывает проблемные selections.
- [ ] Focus, status announcement, modal return, error linking и reorder announcement проходят keyboard/screen-reader tests.
- [ ] 320 CSS px reflow не теряет actions/data; desktop preview rail складывается корректно.
- [ ] 100 rules / 730 exceptions / long history не блокируют main thread и не ломают focus.
- [ ] Ни один UI/copy/test не содержит SLA rollout/canary/feature gate.

## Source index

### Product documentation

- Zendesk: [Setting business hours and holidays](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays), [Defining SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies), [Ordering SLA policies](https://support.zendesk.com/hc/en-us/articles/5610005534618-Ordering-SLA-policies).
- Atlassian/Jira Service Management: [SLA calendars](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/), [priority grouping](https://support.atlassian.com/jira-service-management-cloud/docs/use-priority-to-group-sla-goals/), [SLA conditions](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/).
- Intercom: [Set SLAs](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets), [SLAs and office hours](https://www.intercom.com/help/en/articles/9263617-slas-and-office-hours).
- Salesforce: [Business Hours in Entitlement Management](https://help.salesforce.com/s/articleView?id=service.entitlements_business_hours.htm&language=en_US&type=5), [Milestone Stop and Resume](https://help.salesforce.com/s/articleView?id=service.entitlements_milestones_timer_behavior.htm&language=en_US&type=5), [Create New Version](https://help.salesforce.com/s/articleView?id=service.entitlements_process_creating_new_versions.htm&language=en_US&type=5), [Updating Process](https://help.salesforce.com/s/articleView?id=entitlements_versioning_overview.htm&language=en_US&type=5), [Use New Version](https://help.salesforce.com/s/articleView?id=sf.entitlements_process_using_new_versions.htm&language=en_US&type=5), [Create SLA Policy Version](https://help.salesforce.com/s/articleView?id=service.sla_creating_new_version.htm&language=en_US&type=5).
- Stripe: [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### Standards

- IANA/Unicode/WHATWG: [tzdb Theory](https://www.iana.org/time-zones/theory), [tzdb overview](https://www.iana.org/time-zones/tz-link), [CLDR Time Zone Names](https://unicode.org/reports/tr35/tr35-dates.html#Time_Zone_Names), [HTML local datetime](https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type=datetime-local)).
- IETF: [RFC 9557 — named timezone and local-time ambiguity](https://www.rfc-editor.org/rfc/rfc9557.html), [RFC 9110 — If-Match](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1), [ETag](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3), [412](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.13), [RFC 6585 — 428](https://www.rfc-editor.org/rfc/rfc6585#section-3), [RFC 9457 — Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html).
- W3C/WAI: [Dialog modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Date Picker Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/), [Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), [Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/), [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages), [Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html), [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Immutable-history references: [Azure snapshots](https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-snapshots), [AWS AppConfig version copy](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-profile-feature-flags-editing-version.html), [Confluence page history](https://support.atlassian.com/confluence-cloud/docs/create-edit-and-publish-a-page/#Pageversionsandhistory), [HCP Terraform state rollback](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/state-versions#rollback-to-a-previous-state-version).

### Lola primary contracts

- [Backend Ticket 36](../../../Lola_backend/.scratch/support-platform/issues/36-complete-sla-configuration-authoring.md) — использовать без устаревшей rollout части.
- [Ticket 08 SLA semantics](../../../Lola_backend/docs/specs/support-platform/08-sla-policy-shadow-clocks.ru.md).
- [Backend DTO](../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.dto.ts).
- [Backend HTTP controller](../../../Lola_backend/src/composition/support-workspace/support-sla-configuration.controller.ts).
- [Current frontend SLA page](../../src/pages/SupportSlaSettingsPage.vue).
- [Current calendar editor](../../src/features/support-sla/ui/SupportBusinessCalendarEditor.vue).
- [Current rules editor](../../src/features/support-sla/ui/SupportSlaRulesEditor.vue).
- [Current form model](../../src/features/support-sla/model/support-sla-configuration-form.ts).
- [Current mutation controller](../../src/features/support-sla/model/use-support-sla-configuration.ts).
