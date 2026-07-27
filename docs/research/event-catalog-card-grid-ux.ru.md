# Каталог событий: карточная сетка, статусы и адаптивный UX

Дата исследования: 27 июля 2026 года.

## Задача

Спроектировать каталог Event Definition как быстро сканируемую карточную сетку,
в которой без открытия detail видны:

- смысл события и полное описание;
- принимает ли событие backend;
- разрешена ли отправка из frontend/browser;
- системное событие или проектное;
- активное состояние, версия и состав payload;
- основные действия.

Исследование опирается на первичные источники: Material Design, IBM Carbon,
Microsoft Fluent 2 и W3C/WAI. Nielsen Norman Group используется только для
прямых выводов из их исследований сканирования listing pages. Предложения для
Lola — синтез источников, а не копирование готового компонента одной системы.

## Что именно не работало в исходном экране

До редизайна карточка в [`EventsPage.vue`](../../src/pages/EventsPage.vue)
фактически являлась одной горизонтальной строкой: icon → main → stats → actions.
Описание занимало одну строку с ellipsis, а справа одновременно находились
switch и несколько действий. Поэтому важный диагностический признак
`clientIngestible` не был виден в каталоге, а статус `enabled` был отделён от
контекста «backend / frontend».

Это расходится с двумя устойчивыми рекомендациями:

- карточка должна группировать информацию и действия одного объекта в явные
  header/body/footer и сначала показывать небольшой набор наиболее важной
  информации; действия естественно помещать в footer
  ([Fluent 2: Card](https://fluent2.microsoft.design/components/web/react/core/card/usage));
- каждый listing entry должен иметь собственную mini-IA: приоритетные атрибуты
  сверху и слева, а соответствующие атрибуты — в одинаковых местах всех
  элементов, чтобы поддерживать быстрое сравнение
  ([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).

## Главные решения для Lola

1. **Сделать визуальную CSS-grid, но сохранить семантику обычного списка
   статей.** Карточки являются однородной коллекцией Event Definition и
   визуально reflow-ятся из трёх колонок в две и одну. Не следует добавлять
   `role="grid"` только из-за CSS Grid: ARIA grid — composite widget с одним
   tab stop и обязательным управлением фокусом стрелками, `Home` и `End`
   ([WAI APG: Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)).
2. **Карточка — не одна большая кнопка.** В ней есть switch, disclosure и
   несколько самостоятельных действий, поэтому нужен неинтерактивный
   `<article>` с отдельными controls. Carbon прямо запрещает вкладывать
   отдельные CTA в полностью clickable tile и рекомендует base tile для
   сложных карточек с внутренними действиями
   ([Carbon: Tile usage](https://carbondesignsystem.com/components/tile/usage/),
   [Carbon: Tile accessibility](https://carbondesignsystem.com/components/tile/accessibility/)).
3. **Поставить диагностические статусы сразу под названием, а не прятать их в
   tooltip или switch.** Две независимые текстовые строки «Backend» и
   «Frontend» позволяют сразу локализовать проблему. Badge должен быть рядом с
   объектом, содержать короткий текст состояния и использовать цвет намеренно
   ([Fluent 2: Badge](https://fluent2.microsoft.design/components/web/react/core/badge/usage/)).
4. **Показывать описание в карточке и дать раскрыть его целиком.** По умолчанию
   допустим читаемый preview в 3–4 строки, но постоянный ellipsis без пути к
   полному тексту недопустим. Карточка с interactive elements раскрывается
   отдельной кнопкой, а не кликом по всей поверхности
   ([Carbon: Expandable tile](https://carbondesignsystem.com/components/tile/usage/#expandable),
   [WAI APG: Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)).
5. **Оставить видимыми два частых действия, остальные убрать в overflow.**
   Рекомендуемый footer: `Открыть/Редактировать`, `Журнал`, `⋯`. В меню:
   «Скопировать контракт», «История версий» и редкие операции. Carbon
   рекомендует overflow в cards при более чем трёх interactive icons и
   размещение overflow вместо третьего действия
   ([Carbon: Menu buttons](https://carbondesignsystem.com/components/menu-buttons/usage/#overflow-menu),
   [Carbon: Data table inline actions](https://carbondesignsystem.com/components/data-table/usage/#inline-actions)).
6. **Разделить системные и проектные события явными секциями с количеством.**
   Заголовки секций должны быть настоящими headings, а не только разным фоном:
   визуально переданные структура и отношения должны быть доступны
   программно
   ([W3C: Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html),
   [W3C: Section Headings](https://www.w3.org/WAI/WCAG22/Understanding/section-headings.html)).
7. **Поиск, фильтры и сортировка живут в одной toolbar над коллекцией.**
   Категории «Тип», «Backend», «Frontend» независимы; активные фильтры
   показывают count и имеют «Сбросить всё». Carbon рекомендует размещать
   несколько категорий сверху или слева, показывать число применённых фильтров
   в закрытом состоянии и давать общий reset
   ([Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/)).

## Рекомендуемая анатомия карточки

```text
┌────────────────────────────────────────────┐
│ Системное                         v12   [⋯] │  eyebrow / badges
│ Успешный депозит                           │  h3
│ deposit.succeeded                          │  code
│                                            │
│ Backend   ● Принимает                      │  status text + icon
│ Frontend  ⊘ Запрещён политикой             │
│                                            │
│ Когда депозит подтверждён платёжным        │
│ провайдером и зачислен на баланс…          │
│ [Показать описание полностью]              │
│                                            │
│ 5 полей · 3 обязательных · amount · …      │  compact metadata
├────────────────────────────────────────────┤
│ [Приём события switch]                     │  policy control
│ [Редактировать] [Журнал]               [⋯] │  actions
└────────────────────────────────────────────┘
```

Header, body и footer должны быть одинаково расположены во всех карточках:
Fluent специально выделяет эти slots, а NN/g показывает, что предсказуемое
положение соответствующих атрибутов ускоряет сравнение
([Fluent 2: Card](https://fluent2.microsoft.design/components/web/react/core/card/usage),
[NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).

Карточки одной строки могут растягиваться до одинаковой высоты, а footer
прижимается вниз. Masonry-layout не рекомендуется: он разрушает устойчивые
строки и делает визуальный путь и keyboard focus менее предсказуемыми; WCAG
требует, чтобы focus order сохранял смысл и операбельность
([W3C: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)).

### Приоритет информации

Порядок внутри карточки:

1. название + тип + lifecycle;
2. `code`;
3. Backend/Frontend readiness;
4. описание;
5. payload summary и версия;
6. control и actions.

Это применяет правило NN/g: верхняя и левая части listing entry получают больше
внимания, а визуальный приоритет должен следовать важности атрибутов
([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).

## Модель статусов Backend / Frontend

В текущем доменном контракте `enabled` — общая ingestion policy, а
`clientIngestible` — разрешение принимать событие со стороны клиента/browser;
они уже редактируются как две отдельные политики в
[`EventDefinitionWorkspacePage.vue`](../../src/pages/EventDefinitionWorkspacePage.vue).
В каталоге нужно показывать **эффективный**, а не только сырой статус:

| `enabled` | `clientIngestible` | Backend        | Frontend                       | Что понимает оператор                                            |
| --------- | ------------------ | -------------- | ------------------------------ | ---------------------------------------------------------------- |
| `true`    | `true`             | `Принимает`    | `Принимает`                    | Оба канала доступны                                              |
| `true`    | `false`            | `Принимает`    | `Запрещён политикой`           | Backend исправен; проблему искать во frontend policy/integration |
| `false`   | `true` или `false` | `Не принимает` | `Недоступен: backend выключен` | Сначала включить общий приём                                     |

Тексты должны быть видимыми и не зависеть от распознавания зелёного/красного:
WCAG запрещает использовать цвет как единственный носитель смысла
([W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).

Для краткого визуального слоя допустимы badges:

- `Backend · принимает`;
- `Frontend · разрешён`;
- `Frontend · запрещён`;
- `Приём выключен`;
- `Системное` / `Проектное`;
- `Архив`.

Fluent рекомендует badge в одно-два слова рядом с описываемым объектом, поэтому
если формулировка длиннее, badge содержит короткий статус, а причина остаётся
рядом обычным текстом
([Fluent 2: Badge](https://fluent2.microsoft.design/components/web/react/core/badge/usage/)).

`Системное` должно быть видимым текстовым badge. Lock icon может его дополнять,
но tooltip не должен быть единственным объяснением read-only: critical meaning
не следует скрывать за hover, а любой hover/focus popup должен быть dismissible,
hoverable и persistent по правилам WCAG
([W3C: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)).

## Длинное описание без «размазывания» сетки

Рекомендуемый компромисс:

- preview занимает не одну строку, а 3–4 строки;
- если текст длиннее, появляется явная кнопка «Показать описание полностью»;
- раскрытие происходит внутри карточки и никогда не открывается только по
  hover;
- после раскрытия полный текст переносится по словам, без fixed height и
  внутреннего scroll;
- кнопка меняется на «Свернуть описание», но её accessible name и состояние
  остаются однозначными.

Carbon использует expandable tile именно для скрытия/показа большого объёма
контента, а при наличии внутренних controls требует отдельную expansion button
([Carbon: Tile usage](https://carbondesignsystem.com/components/tile/usage/#expandable)).
Disclosure button должен поддерживать `Enter`/`Space`, иметь
`aria-expanded` и при необходимости `aria-controls`
([WAI APG: Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)).

Preview должен начинаться с самого информативного предложения. NN/g рекомендует
короткие, сканируемые блоки и inverse-pyramid structure, но не предлагает
отбрасывать глубину: подробность должна оставаться доступной во вторичном слое
([NN/g: Be Succinct](https://www.nngroup.com/articles/be-succinct-writing-for-the-web/)).

Если продукт решит, что каждое описание должно быть полностью раскрыто по
умолчанию, сетка всё равно должна сохранять единые header/footer и обычные
CSS-grid rows. Это хуже по плотности, но лучше постоянного ellipsis; выбор между
default-expanded и 3–4-line preview следует проверить на реальных самых длинных
описаниях, потому что NN/g рекомендует определять состав listing entry по
analytics и user research, а не по произвольному числу атрибутов
([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).

## Действия и switch

### Видимые действия

- Primary: `Редактировать` для проектного события или `Просмотреть` для
  системного.
- Secondary: `Журнал`.
- Overflow: `Скопировать контракт`, `История версий` и менее частые команды.

Карточки могут содержать несколько actions, но их расположение в коллекции
должно быть консистентным; Material рекомендует supplemental actions внизу и
ограничение двумя действиями плюс overflow
([Material Design: Cards](https://m1.material.io/components/cards.html#cards-actions)).

Overflow должен быть постоянно видим хотя бы как `⋯`, а пункты меню — иметь
прямые текстовые названия. Carbon указывает, что overflow используется при
дефиците места в rows/cards и отделяет destructive action divider-ом
([Carbon: Overflow menu](https://v10.carbondesignsystem.com/components/overflow-menu/usage/)).

### Switch приёма

Switch допустим, потому что `enabled` — бинарная policy. Его видимая label
должна быть стабильной, например «Приём события», а состояние должен передавать
сам switch через `aria-checked`. Label нельзя менять с «Включить» на
«Выключить» вместе с состоянием
([WAI APG: Switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)).

Изменение switch не должно убирать карточку из текущей выдачи: это ломает
пространственный контекст. После server response badge и summary обновляются
рядом с control, а успех/ошибка объявляются как status. WCAG требует, чтобы
status message был доступен assistive technology без переноса фокуса
([W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)).

Для read-only/system события switch либо заменяется статическим текстом
«Управляется Lola», либо остаётся disabled только если рядом видна причина.
Disabled styling сам по себе не обязан проходить контраст в Carbon, поэтому
полагаться только на бледный switch нельзя
([Carbon: Tag disabled state](https://carbondesignsystem.com/components/tag/usage/#behaviors)).

## Группировка, фильтры и сортировка

### Уровни навигации

1. `Активные / Архив` остаётся верхним lifecycle switch: это два
   взаимоисключающих набора.
2. Внутри активного набора toolbar содержит search, filters и sort.
3. Результаты по умолчанию разделены headings:
   `Проектные события · N` и `Системные Lola · N`.

Content switcher подходит для альтернативных представлений одного связанного
набора и использует короткие noun labels, но только один section виден
одновременно
([Carbon: Content switcher](https://carbondesignsystem.com/components/content-switcher/usage/)).
Для системных/проектных событий здесь лучше headings, потому что оператору
полезно видеть обе группы и их количества одновременно; при необходимости
скрыть одну группу используется filter `Тип`.

### Toolbar

```text
┌ Поиск по названию или code ───────────────┐
│ [Тип: Все ▾] [Backend: Все ▾] [Frontend: Все ▾] [Сортировка ▾] │
│ 3 фильтра применено · [Сбросить всё]            Найдено 12     │
└────────────────────────────────────────────────────────────────┘
```

Рекомендуемые категории:

- `Тип`: все / проектные / системные;
- `Backend`: все / принимает / не принимает;
- `Frontend`: все / принимает / запрещён политикой / недоступен из-за backend;
- `Сортировка`: название / недавно обновлённые / статус / версия.

Carbon допускает dropdown для filter/sort, но для двух вариантов рекомендует
не прятать выбор в dropdown; поэтому lifecycle остаётся видимым switch, а более
длинные категории живут в фильтрах
([Carbon: Dropdown](https://carbondesignsystem.com/components/dropdown/usage/)).

На desktop категории могут быть видимы горизонтально; на compact screen
search остаётся полной ширины, а фильтры открываются в sheet/drawer. В закрытом
состоянии кнопка показывает `Фильтры · 3` и соседнее `Сбросить`; Carbon требует
видимый applied-count и очистку без повторного открытия контейнера
([Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/#filter-states)).

Количество результатов после search/filter следует обновлять через
`role="status"`/live region без перемещения фокуса; WAI публикует отдельный
рабочий пример именно для объявления числа search results
([W3C working example: role=status for search results](https://www.w3.org/WAI/WCAG22/working-examples/aria-role-status-searchresults/)).

## Responsive-композиция

Следующие размеры — стартовые ограничения прототипа Lola, а не универсальные
брейкпоинты из дизайн-системы. Переключение должно происходить по доступной
ширине content container, а не по названию устройства. Fluent описывает
reposition, resize, reflow и show/hide как responsive techniques, а Android
рекомендует задавать max width и менять presentation вместо растягивания
controls
([Fluent 2: Layout](https://fluent2.microsoft.design/layout),
[Android: Adapt layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout)).

| Доступная ширина каталога | Предложение Lola | Поведение                                                            |
| ------------------------- | ---------------- | -------------------------------------------------------------------- |
| ≳ 1200 px                 | 3 колонки        | Bounded content; toolbar в одну строку; одинаковые card slots        |
| ≈ 720–1199 px             | 2 колонки        | Filters могут перейти на вторую строку; card footer остаётся снизу   |
| < 720 px                  | 1 колонка        | Search full width; filters в drawer; actions: primary + overflow     |
| 320–390 px                | 1 колонка        | Padding 12–16 px; badges переносятся; metadata без horizontal scroll |

Практичная CSS-модель — `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))` с
ограниченной максимальной шириной карточки или container. Это следует
проверить с реальным AppShell/sidebar: Android прямо предостерегает от
растягивания content и controls на всю expanded width
([Android: Adapt layouts](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout)).

На телефоне карточка не превращается обратно в горизонтальную строку. Header,
statuses, description, metadata и footer идут одним естественным вертикальным
потоком. WCAG 1.4.10 требует сохранить информацию и функции без двумерной
прокрутки при эквиваленте 320 CSS px
([W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

Нельзя скрывать Backend/Frontend statuses на tablet/mobile ради плотности:
Fluent допускает show/hide secondary metadata, но responsive layout должен
сохранять равный доступ к информации, а WCAG запрещает потерю функций и
содержимого при reflow
([Fluent 2: Layout](https://fluent2.microsoft.design/layout),
[W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Доступность

- Коллекция — `<section aria-labelledby>` с `<ul>`/`<li>` или набором
  `<article>`; CSS-grid не получает `role="grid"`, пока не реализована полная
  composite keyboard model
  ([WAI APG: Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)).
- Название каждой карточки — heading одного уровня; секции «Проектные» и
  «Системные» — headings уровнем выше. Визуальная структура должна иметь
  программный эквивалент
  ([W3C: Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)).
- DOM order совпадает с визуальным order: title → statuses → description →
  metadata → switch → actions. CSS не должен визуально переставлять controls
  так, чтобы keyboard focus «прыгал»
  ([W3C: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)).
- Status нельзя кодировать только цветом; нужны текст и при желании icon
  ([W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).
- Обычный текст проверяется на 4.5:1, крупный — 3:1; границы controls, focus и
  смысловые icons — 3:1 к соседнему цвету
  ([Fluent 2: Accessibility](https://fluent2.microsoft.design/accessibility),
  [W3C: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- Все icon-only actions получают accessible name с объектом: «Открыть меню
  события Успешный депозит», «Открыть журнал события …». Name, role, value и
  состояние custom controls должны определяться программно
  ([W3C: Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)).
- Минимум WCAG 2.2 AA для targets — 24 × 24 CSS px с описанными исключениями;
  для switch, overflow, disclosure и card actions на touch следует принять
  44 × 44 CSS px как внутренний enhanced target
  ([W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
  [W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)).
- Результат фильтрации, сохранения switch и ошибка обновления policy
  объявляются без переноса focus; error остаётся рядом с карточкой/control
  ([W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
  [Fluent 2: Message bar](https://fluent2.microsoft.design/components/web/react/core/messagebar/usage)).

## Проверяемый пользовательский путь

1. Оператор открывает «События» и без hover видит группы, название, code,
   Backend и Frontend status каждой карточки. Это проверяет видимость system
   status и недопустимость color-only meaning
   ([Fluent 2: Badge](https://fluent2.microsoft.design/components/web/react/core/badge/usage),
   [W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).
2. По строке `Backend: принимает` + `Frontend: запрещён политикой` оператор
   сразу понимает, что общий ingestion работает, а browser source запрещён;
   статусы стоят в одинаковом месте во всех карточках, поддерживая comparison
   ([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).
3. Оператор раскрывает длинное описание клавишей `Enter` или `Space`, читает
   его целиком без внутренней прокрутки и сворачивает той же кнопкой
   ([WAI APG: Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)).
4. Оператор фильтрует `Frontend: запрещён`; число результатов обновляется
   визуально и объявляется screen reader, а applied filter можно сбросить без
   повторного открытия drawer
   ([Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/),
   [W3C role=status example](https://www.w3.org/WAI/WCAG22/working-examples/aria-role-status-searchresults/)).
5. Оператор редактирует частое событие одной видимой кнопкой; история и copy
   остаются доступны через labelled overflow без четырёх конкурирующих icons
   ([Carbon: Menu buttons](https://carbondesignsystem.com/components/menu-buttons/usage/#overflow-menu)).
6. При 320 px и 400% zoom все те же статусы, description disclosure и actions
   доступны в одной колонке без горизонтального scroll
   ([W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Матрица визуальной и функциональной проверки

| Проверка            | Desktop                                   | Tablet                                       | Mobile                                 |
| ------------------- | ----------------------------------------- | -------------------------------------------- | -------------------------------------- |
| Viewport            | 1440 × 1000                               | 1024 × 768 и 768 × 1024                      | 390 × 844 и 320 × 568                  |
| Grid                | ожидаемо 3 колонки                        | ожидаемо 2 или 1 по реальной ширине AppShell | 1 колонка                              |
| Long description    | 1, 3, 8 и 20 строк; expand/collapse       | то же, без overlap соседней card             | полный wrap, без nested scroll         |
| Status combinations | все 3 строки status matrix                | badges wrap без потери label                 | причина Frontend видна, не только icon |
| Actions             | primary + secondary + overflow            | footer не обрезается                         | targets 44 × 44, primary + overflow    |
| Filters             | inline toolbar                            | wrap или compact trigger                     | full-width search + drawer             |
| Accessibility       | Tab order, screen reader names, 200% text | portrait/landscape                           | 400% zoom/320 CSS px, touch            |

Viewport-набор — тестовый минимум Lola; нормативная часть состоит в сохранении
функций при 320 CSS px/400% zoom и достаточном target size
([W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
[W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

## Критерии готовности дизайна и реализации

- Каталог визуально является сеткой 3/2/1, но семантически остаётся list/articles
  без необоснованного ARIA `grid`
  ([WAI APG: Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)).
- У каждой карточки без hover видны Backend, Frontend, system/custom и
  lifecycle statuses; цвет только дополняет текст
  ([Fluent 2: Badge](https://fluent2.microsoft.design/components/web/react/core/badge/usage),
  [W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).
- Описание не заканчивается необратимым ellipsis: preview содержит несколько
  строк, а полный текст доступен через disclosure с `aria-expanded`
  ([Carbon: Expandable tile](https://carbondesignsystem.com/components/tile/usage/#expandable),
  [WAI APG: Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)).
- Card slots и actions находятся в одинаковых местах; masonry не используется
  ([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).
- Видимы максимум два item actions плюс overflow; switch считается отдельным
  policy control и имеет стабильную label
  ([Carbon: Menu buttons](https://carbondesignsystem.com/components/menu-buttons/usage/#overflow-menu),
  [WAI APG: Switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)).
- Filters показывают applied count, result count и reset-all; dynamic result
  count объявляется без focus jump
  ([Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/),
  [W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)).
- При 320 CSS px, 200% text resize и 400% page zoom нет clipping, overlap или
  горизонтального scroll страницы; все controls сохраняются
  ([Fluent 2: Accessibility](https://fluent2.microsoft.design/accessibility),
  [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Ограничения исследования

Внешние источники подтверждают иерархию, поведение карточек, disclosure,
filtering, responsive и accessibility, но не доказывают, что именно три
колонки или ровно четыре строки preview оптимальны для данных Lola. Эти числа
являются стартовой гипотезой и должны быть проверены на реальных Event
Definitions, особенно с длинными русскими названиями/code и максимальными
описаниями. NN/g прямо рекомендует определять атрибуты listing entry через
analytics и usability research
([NN/g: The Anatomy of a List Entry](https://www.nngroup.com/articles/list-entries/)).

Dribbble, Behance, Pinterest, UI-галереи и сторонние «best practices» не
использовались как доказательство.
