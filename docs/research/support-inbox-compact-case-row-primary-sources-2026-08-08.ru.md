# Компактная строка Case в Support Inbox: исследование первичных источников

Дата: 2026-08-08  
Область: операторская очередь Lola Support шириной примерно 285–320 px.

## Короткий вывод

Текущую строку не стоит превращать в набор одинаково заметных чипов и не стоит
показывать все SLA-поля одновременно. Зрелые helpdesk-продукты выводят в очереди
только данные, необходимые для выбора следующей работы: название, состояние,
приоритет/очередь и **ближайшую** SLA-цель. Остальной контекст остаётся в detail pane
или раскрывается по hover/focus.

Для Lola оптимальна трёхстрочная строка высотой около 80–88 px:

```text
48  Не поступил депозит                         26 июл.
    Ждём систему · Срочный · PAYMENTS
    ⏱ Пауза решения · 1 ч 30 мин · прогноз
```

Для Case без SLA достаточно двух строк; пустую третью строку резервировать не нужно.
Это не «карточка внутри карточки», а одна кликабельная строка списка с тихим
разделителем, подсветкой выбранной строки и узким маркером слева.

## Что подтверждают официальные источники

### 1. Helpdesk-очередь должна помогать выбрать следующую работу

- Jira Service Management позволяет настраивать колонки очереди и прямо рекомендует
  сортировать очередь по SLA, чтобы запросы, ближайшие к нарушению цели, поднимались
  выше. Источник: [Atlassian Support — What are queues?](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-queues/).
- В Zendesk Agent Home рекомендуемая сортировка помещает live messaging наверх, а
  остальные tickets сортирует по ближайшему SLA breach. Источник:
  [Zendesk — Using Agent Home to manage your work efficiently](https://support.zendesk.com/hc/en-us/articles/5064623131418-Using-Agent-Home-to-manage-your-work-efficiently).
- Zendesk отдельно объясняет, что билет с более низким priority может быть важнее
  срочного билета, если его SLA истекает раньше. Следовательно, priority и SLA нельзя
  визуально подавать как два равных независимых «главных» сигнала. Источник:
  [Zendesk — Agent Home Solutions Guide](https://support.zendesk.com/hc/en-us/articles/6438860911258-Agent-Home-Solutions-Guide-to-optimize-ticket-workflow).

### 2. В строке нужен ближайший SLA, а не полный набор SLA-данных

- Intercom показывает на conversation card ближайшую SLA-цель; дополнительные SLA
  metrics доступны в details по hover. Для сортировки `Next SLA` карточка показывает
  срок цветным pill. Источники:
  [Intercom — Set SLAs for conversations and tickets](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets) и
  [Intercom — Inbox Sorting](https://www.intercom.com/help/en/articles/6989006-inbox-sorting).
- Zendesk показывает в ticket ближайшее требуемое действие и оставшееся до breach
  время. Точная дата и остальные активные targets раскрываются по hover на SLA badge.
  Источник: [Zendesk — Viewing and understanding SLA targets](https://support.zendesk.com/hc/en-us/articles/4408832852122-Viewing-and-understanding-SLA-targets).

Практический вывод для Lola: в строке оставлять один `slaSignal`, полученный от
сервера, в форме «действие · оставшееся время · режим». Полную SLA-политику,
точный timestamp, объяснение shadow/stale/degraded и другие targets показывать в
Inspector. Это вывод из источников, а не прямое требование конкретного design system.

### 3. Строка списка имеет явные роли headline / supporting / trailing

- Официальный Material Web List Item разделяет содержимое на `headline`,
  `supporting-text` и `trailing-supporting-text`. В примере trailing-значение получает
  фиксированную узкую область и выравнивается по правому краю. Источник:
  [Material Web — Lists](https://material-web.dev/components/list/).
- Material 3 рекомендует list-detail layout для интерфейса, где список объектов и
  подробности выбранного объекта находятся в соседних panes. Источник:
  [Material Design 3 — Canonical layout examples](https://m3.material.io/foundations/layout/canonical-examples/overview).

Практический вывод для Lola: дата относится к trailing metadata и не должна
конкурировать с названием; подробности Case доступны в центральной/правой области,
поэтому queue row должна быть обзором, а не мини-инспектором.

- Carbon прямо предназначает `Contained list` для небольших областей, включая
  sidebars. Строки должны иметь одинаковую структуру, могут содержать несколько строк
  краткого текста, поддерживают clickable rows и обычные row dividers. Для одной строки
  базовые размеры составляют 32/40/48/64 px, а фактическая высота может расти по
  содержимому. Источник:
  [Carbon Design System — Contained list](https://carbondesignsystem.com/components/contained-list/usage/).
- Fluent определяет список как повторяющийся вертикальный набор подобных объектов и
  требует параллельной визуальной/контентной структуры и сходной длины строк ради
  сканируемости. При единственном основном действии весь item должен быть доступен по
  click, Enter и Space. Источник:
  [Fluent 2 — List](https://fluent2.microsoft.design/components/web/react/core/list/usage).

Это дополнительно подтверждает выбранную модель: все Case используют одинаковые
слоты, но строка без SLA не обязана резервировать пустую высоту.

### 4. Чип — только для действительно значимого атрибута

- Atlassian определяет lozenge как компактную метку meaningful attribute, который
  влияет на понимание, приоритизацию или действие. Это аргумент не превращать status,
  priority, topic и SLA одновременно в четыре равных цветных capsule. Источник:
  [Atlassian Design System — Lozenge](https://atlassian.design/components/lozenge).
- Carbon рекомендует tags для категоризации, а длинный tag не переносить на несколько
  строк: его следует обрезать и раскрывать целиком по hover/focus tooltip. Источник:
  [Carbon Design System — Tag](https://carbondesignsystem.com/components/tag/usage/).

Практический вывод для Lola: цветной compact label нужен максимум для priority,
причём прежде всего для `HIGH / URGENT / CRITICAL`. Статус и `groupCode` лучше
оставить спокойным текстом. Обычный priority можно показать текстом без заливки.

### 5. Обрезание допустимо только для восстановимого вторичного контента

- Atlassian советует не обрезать текст; если обрезание неизбежно для
  пользовательского содержимого неизвестной длины, должен быть другой способ прочитать
  его полностью. Источник:
  [Atlassian Design System — Applying typography, Truncation](https://atlassian.design/foundations/typography/applying-typography).
- Carbon для обычных списков рекомендует перенос строк вместо truncation, но также
  отмечает, что сложным данным больше подходит data table. Источник:
  [Carbon Design System — List](https://carbondesignsystem.com/components/list/usage/).
- В отдельном overflow guidance Carbon разрешает ellipsis для длинного имени, но не
  для labels и status-сообщений; полное значение должно быть доступно через tooltip.
  Источник:
  [Carbon Design System — Overflow content](https://carbondesignsystem.com/patterns/overflow-content/).
- Fluent 2 также требует короткие ясные labels и tooltip для усечённых labels,
  badges и quick actions. Источник:
  [Fluent 2 — Tree](https://fluent2.microsoft.design/components/web/react/core/tree/usage).

Практический вывод для Lola:

- title можно ограничить одной строкой с ellipsis, потому что полный title сразу виден
  в открытом Case; для мыши добавить `title`/tooltip;
- `groupCode` можно обрезать после сохранения понятного начала и раскрывать по
  hover/focus;
- статус, priority и SLA-смысл нельзя молча обрезать;
- точное время доступно через `datetime` и tooltip, а в строке достаточно `26 июл.`.

## Рекомендуемая информационная архитектура Lola

### Геометрия при ширине 285–320 px

| Область | Рекомендация |
|---|---|
| Строка | `min-height: 80px` с SLA, около `64–68px` без SLA; высота растёт только если локализация действительно не помещается |
| Внутренние отступы | `10px 12px`, сетка 4 px |
| Левый rail | 24–28 px для `projectSequence`, tabular numerals; bell/attention можно встроить сюда, не добавляя ещё одну текстовую метку |
| Gap после rail | 8 px |
| Заголовок | 14 px / 650, одна строка, ellipsis; полный текст доступен в Case и tooltip |
| Дата | 11 px / 500, muted, `flex: 0 0 auto`, точное время в tooltip |
| Metadata | 11–12 px, одна строка, gap 4–6 px; цветом выделяется только actionable priority |
| SLA | 11–12 px, одна строка по возможности; число tabular, risk/breach получает semantic color |
| Состояния | hover — тихий tonal shift; selected — brand-soft + 2 px rail; focus — видимый focus ring |

### Иерархия строк

1. **Headline:** title слева, дата справа.
2. **Operational metadata:** status → priority → group/topic.
3. **Nearest SLA:** тип следующей цели → countdown → режим прогноза.

ID не должен занимать место в headline: он остаётся в фиксированном левом rail.
Дата не должна переноситься. При нехватке места сначала сокращается/обрезается
`groupCode`, но не title до бессмысленного фрагмента и не SLA countdown.

### Что убрать из текущей композиции

- Не выводить одновременно `Нужен оператор` и `Нужна реакция`: это два текста об
  одном attention-состоянии. Оставить статус в metadata, а реакцию передать bell/цветом
  левого rail и доступным `aria-label`.
- Не делать status и priority одинаковыми pill. Это стирает иерархию и увеличивает
  ширину; priority — compact lozenge, status — текст.
- Не писать техническое `теневой прогноз` целиком в каждой строке. Для оператора
  понятнее короткое `прогноз`; полное объяснение «тестовый SLA-расчёт, не официальный
  срок» должно быть в tooltip/Inspector. Если rollout state един для всей очереди,
  его лучше один раз показать в заголовке/легенде очереди, а не повторять в каждом
  Case. Это продуктовая рекомендация, которую нужно сверить с контрактом: если режим
  может отличаться по Case, короткая метка должна остаться в строке.
- Не добавлять отдельные bordered cards внутри списка. Row + divider + selected tint
  дают достаточную структуру и оставляют визуальный фокус диалогу.

## Конкретные варианты

Обычный Case:

```text
46  Восстановление доступа                       26 июл.
    Решено · Обычный · ACCOUNT
```

Case с ближайшим SLA:

```text
48  Не поступил депозит                         26 июл.
    Ждём систему · Срочный · PAYMENTS
    ⏱ Пауза решения · 1 ч 30 мин · прогноз
```

Case, требующий вмешательства:

```text
47  Не запускается игра                         26 июл.
    Нужен оператор · Высокий · GAMES
    ⏱ Первый ответ · 15 мин · прогноз
```

У выбранной строки bell размещается рядом с номером или заменяет нейтральный marker;
повторный текст `Нужна реакция` не добавляется.

## Проверяемые критерии для реализации

1. На 285, 300 и 320 px обычная строка занимает две строки, SLA-строка — три; соседние
   Case не перекрываются.
2. Title и дата остаются на первой строке; дата не переносится.
3. `HIGH / URGENT / CRITICAL` различимы не только цветом: текст priority сохраняется.
4. Видна только ближайшая SLA-цель; полная SLA-информация доступна в Inspector.
5. Title/group, если усечены, полностью доступны мышью, клавиатурой и в detail pane.
6. Нет дублирования `Нужен оператор` + `Нужна реакция`.
7. Row имеет hover, selected, focus-visible; весь row — единая доступная цель нажатия.
8. На mobile row сохраняет ту же иерархию, но может позволить title максимум в две
   строки вместо горизонтального overflow.

## Итоговый verdict

Проблема не в недостатке места, а в равном визуальном весе всех полей и дублировании
attention. Нужна не меньшая типографика, а жёсткая трёхуровневая иерархия: title/date,
status/priority/topic, один ближайший SLA. Это сохраняет всю оперативно значимую
информацию, уменьшает строку примерно до 80–88 px и делает очередь заметно быстрее
для сканирования.
