# Выбор события из большого каталога: UX/UI-рекомендация для Lola

Дата исследования: 7 августа 2026 года.

## Задача

Определить единый паттерн выбора одного Event Definition, когда в проекте могут
быть сотни событий и пользователю нужны:

- поиск по названию, описанию и коду;
- фильтры доступности события для backend и frontend;
- серверная пагинация;
- компактное, но информативное представление результата;
- безопасное подтверждение выбора и понятное отображение уже выбранного события.

Исследование опирается на первичные источники: W3C WAI-ARIA APG, IBM Carbon,
Microsoft Fluent 2, Ant Design, Shopify и GOV.UK Design System. Галереи, блоги,
Dribbble, Behance и пересказы паттернов не использовались.

## Короткое решение

Для Lola рекомендуется **не расширять текущий dropdown**, а заменить его единым
`EventPicker` из двух частей:

1. На форме постоянно виден компактный блок выбранного события с явной кнопкой
   **«Выбрать событие»** или **«Изменить»**.
2. Кнопка открывает широкое transactional dialog **«Выбор события»**. Внутри
   находятся поиск, видимые фильтры, счётчик результатов, одновыборный список,
   серверная пагинация и фиксированный footer **«Отмена / Выбрать»**.

Иными словами, визуальный ритм можно взять у command palette, но семантически и
поведенчески это **dialog picker**, а не command menu: пользователь выбирает
значение поля, а не запускает команду.

Ближайший официальный precedent —
[Shopify Picker](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/picker-api):
он открывает selection dialog для app-specific ресурсов из custom data source,
поддерживает searchable fields, single select и компактные строки с metadata.
[Shopify Resource Picker](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/resource-picker-api)
добавляет preselected ids, server filter query и возврат результата после
подтверждения выбора.

## Почему не dropdown

| Вариант                        | Где уместен                                                                                                                                                                  | Ограничение для каталога событий                                                                                                                                                                   | Решение Lola                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Нативный `select`              | Простая форма и короткие однотекстовые варианты; особенно полезен на mobile.                                                                                                 | Нет полноценных поиска, фильтров, описания и server pagination.                                                                                                                                    | Не использовать для Event Definition.                                                                    |
| Searchable combobox / dropdown | Один выбор из длинного, но всё ещё простого списка. Fluent прямо рекомендует combobox для очень длинных списков; Carbon — когда нужно печатать для поиска.                   | Carbon требует краткий, недескриптивный option text, не советует multiline и запрещает перегружать dropdown сложной информацией. Несколько категорий фильтров также не следует прятать в dropdown. | Оставить как допустимый быстрый слой только для маленьких справочников, но не как основной event picker. |
| Popover                        | Небольшой набор интерактивных настроек рядом с trigger.                                                                                                                      | Carbon рекомендует переходить к modal, если popover шире четырёх колонок; поиск, два фильтра, описания и pagination заведомо требуют больше пространства.                                          | Не использовать для полного каталога.                                                                    |
| Dialog picker                  | Сфокусированная задача, требующая дополнительного ввода и подтверждения. APG допускает dialog как popup выбора; Carbon transactional modal задаёт отмену и явное завершение. | Модальность оправдана только если задача действительно сложнее простого выбора. Здесь это так.                                                                                                     | Основной паттерн. На узком экране тот же компонент становится полноэкранным sheet/view.                  |

Основание:

- [Fluent 2 Combobox](https://fluent2.microsoft.design/components/web/react/core/combobox/usage)
  рекомендует combobox для очень длинного списка и замену placeholder выбранным
  значением после single-select.
- [Carbon Dropdown](https://carbondesignsystem.com/components/dropdown/usage/)
  требует короткий option text, не рекомендует multiline и описывает combo box
  как поиск по длинному списку.
- [Carbon Filtering](https://carbondesignsystem.com/patterns/filtering/)
  рекомендует несколько категорий размещать сверху или слева от набора данных,
  а не внутри menu/dropdown.
- [Carbon Popover](https://carbondesignsystem.com/components/popover/usage/)
  рекомендует modal, когда popover перерастает четыре колонки.
- [WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
  явно допускает popup с ролью `dialog`, выбор значения действием внутри dialog
  и отмену без изменения прежнего значения.

## Закрытое состояние: как показывать выбранное событие

Поле не должно выглядеть как редактируемый text input: ввод происходит только
в поиске внутри dialog. Постоянный блок на форме имеет видимую label
**«Событие»**, а справа — отдельную текстовую кнопку.

### Пустое состояние

```text
Событие
┌──────────────────────────────────────────────────────────────┐
│ Событие ещё не выбрано                    [Выбрать событие] │
└──────────────────────────────────────────────────────────────┘
```

### Выбранное состояние

```text
Событие
┌──────────────────────────────────────────────────────────────┐
│ Успешный депозит                              [Изменить]     │
│ deposit.succeeded                                           │
│ Депозит подтверждён и зачислен на баланс…                   │
│ Backend · принимает   Frontend · запрещён                   │
└──────────────────────────────────────────────────────────────┘
```

Рекомендация для визуального слоя Lola:

- название — главный текст, одна строка;
- `code` — вторичная monospace-строка;
- описание — максимум две строки в широких формах, одна строка в тесном
  контексте; полный текст доступен в picker;
- каналы — два коротких текстовых status badge, цвет только дополняет текст;
- пустое действие называется «Выбрать событие», выбранное — «Изменить»;
- при повторном открытии текущее событие preselected;
- вся поверхность может давать hover, но основным и однозначным trigger остаётся
  кнопка; у неё доступное имя включает текущее значение, например
  `Изменить событие: Успешный депозит`.

Так выбранное значение остаётся читаемым без повторного открытия picker-а.
Обычный menu button для этого хуже: APG отмечает, что menu button не имеет
value в закрытом состоянии, тогда как поле выбора должно сообщать и имя, и
текущее значение ([WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).

## Dialog «Выбор события»

### Рекомендуемая композиция

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Выбор события                                                   [×] │
│ Найдите событие по названию, описанию или коду.                     │
├──────────────────────────────────────────────────────────────────────┤
│ [🔎 Название, описание или код…                                  ] │
│ Backend [Все|Принимает|Выключен]  Frontend [Все|Разрешён|Запрещён] │
│ 128 событий                                      [Сбросить фильтры] │
├──────────────────────────────────────────────────────────────────────┤
│ ○ Успешный депозит                         Backend ✓  Frontend —    │
│   deposit.succeeded                                               │
│   Депозит подтверждён провайдером и зачислен на баланс…            │
├──────────────────────────────────────────────────────────────────────┤
│ ● Просмотр товара                           Backend ✓  Frontend ✓   │
│   product.viewed                                                  │
│   Пользователь открыл страницу товара в web-приложении…            │
├──────────────────────────────────────────────────────────────────────┤
│ …                                                                  │
├──────────────────────────────────────────────────────────────────────┤
│ ‹ Назад       1–20 из 128       Вперёд ›    [Отмена] [Выбрать]     │
└──────────────────────────────────────────────────────────────────────┘
```

Desktop-рекомендация Lola: ширина `880–1040px`, максимум `90vw`, высота до
`88vh`. Header, toolbar и footer остаются на месте, прокручивается только список.
На compact/mobile dialog занимает viewport; фильтры раскрываются внутри него по
кнопке **«Фильтры · N»**, а не открывают второй modal.

Carbon требует, чтобы длинный modal прокручивался только вертикально, а header
и footer оставались фиксированными; горизонтального scroll быть не должно
([Carbon Modal](https://carbondesignsystem.com/components/modal/usage/)).

### Фильтры

На широком dialog оба фильтра всегда видимы: это основные инструменты поиска,
не «настройки», поэтому icon-only gear ухудшает обнаружимость. Рекомендуемые
категории:

- **Backend:** `Все`, `Принимает`, `Выключен`;
- **Frontend:** `Все`, `Разрешён`, `Запрещён`.

В текущей модели backend-доступность соответствует `policy.enabled`, а
frontend-разрешение — `policy.enabled && policy.clientIngestible`. Если общий
приём выключен, строка должна объяснять зависимость текстом
`Frontend · недоступен: backend выключен`, а не показывать независимый зелёный
статус. Эти поля уже входят в доменную модель
[`event-catalog-contract.ts`](../../src/shared/api/repository/event-catalog/event-catalog-contract.ts).

Фильтры обновляют выдачу сразу, поскольку категорий всего две. Если реальные
ответы API окажутся медленными, допустим batch-вариант с «Применить фильтры»:
Carbon рекомендует batch update для нескольких категорий и медленного ответа,
а instant update — для одной категории или малого числа изменений
([Carbon Filtering](https://carbondesignsystem.com/patterns/filtering/)).

На узком экране скрытый фильтр обязан показывать количество активных условий и
дать общий reset без повторного раскрытия; это также прямое требование Carbon.

### Строка результата

Результат — не карточная сетка, а **condensed selectable structured list**:
сотни однотипных объектов быстрее сравнивать по устойчивым строкам. Carbon
предназначает structured list для большого числа похожих элементов, допускает
иерархию текста и single-select rows
([Carbon Structured list](https://carbondesignsystem.com/components/structured-list/usage/)).

Каждая строка содержит:

1. radio/selected marker;
2. название, `14px`, semibold;
3. `code`, `12px`, monospace;
4. описание, `12–13px`, максимум две строки;
5. два коротких текстовых статуса Backend/Frontend;
6. при необходимости вторичные metadata: `Системное/Проектное`, версия схемы.

Практический размер строки Lola — `72–88px`; горизонтальные и вертикальные
отступы — `12–16px`. Status metadata не должны отнимать ширину у названия:
на узком экране они переносятся под описание. Внутри строки не должно быть
отдельных ссылок, кнопок или tooltip-only действий: APG предупреждает, что
семантика потомков option превращается в плоское имя, а интерактивные элементы
внутри listbox option недоступны как самостоятельные controls
([WAI-ARIA APG Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)).

Для реализации внутри dialog предпочтителен нативный `radiogroup` с одной
radio-row на событие: это честно отделяет draft selection от focus и не требует
притворяться, что богатая строка является menu command. Если используется
`listbox`, выбранная строка получает `aria-selected="true"`, а focus и selection
должны визуально различаться.

## Поиск

Поиск должен быть глобальным внутри допустимого каталога:

- OR-match по `metadata.name`, `metadata.description` и `code`;
- регистронезависимый Unicode-поиск;
- trim пробелов; пустая строка возвращает первую страницу;
- debounce `250–350ms`;
- новая строка или фильтр сбрасывают cursor/page;
- старый HTTP-ответ не может перезаписать более новый результат;
- текст результата сообщает `N событий`, включая `0`.

Ant Design официально поддерживает поиск Select по нескольким полям через
массив `optionFilterProp` с OR-сопоставлением и позволяет отдельно настроить
option/selected-label rendering
([Ant Design Select](https://ant.design/components/select/)). Это подтверждает
ожидаемую семантику поиска по нескольким представлениям одного объекта, но для
Lola фильтрация должна происходить на сервере, а не по уже загруженному массиву.
[GOV.UK Pagination](https://design-system.service.gov.uk/components/pagination/)
отдельно требует применять sort/filter ко всему набору, не только текущей
странице, и возвращать пользователя на первую страницу отфильтрованных
результатов.

Текущий [`EventDefinitionSelect.vue`](../../src/features/events/EventDefinitionSelect.vue)
сначала загружает **весь** активный каталог, затем локально ищет только по
`metadata.name` и `code`; описание не участвует. Текущий OpenAPI тип
[`EventCatalogListParams`](../../src/shared/api/generated/models/eventCatalogListParams.ts)
публикует только `lifecycle`, без query, channel filters, limit и cursor.
Следовательно, настоящий поиск по сотням событий требует backend-контракт, а не
только новый UI.

## Server pagination, loading и ошибки

Рекомендуемый контракт чтения:

```ts
interface EventDefinitionPickerQuery {
  lifecycle: "ACTIVE";
  query?: string;
  backend?: "ENABLED" | "DISABLED";
  frontend?: "ALLOWED" | "FORBIDDEN";
  limit: number; // UI default: 20
  cursor?: string;
}

interface EventDefinitionPickerPage {
  items: EventDefinitionPickerItem[];
  nextCursor: string | null;
  total?: number;
}
```

Для dialog рекомендуется явная постраничная навигация `Назад / Вперёд` с
диапазоном `1–20`, а не бесконечный scroll: пользователь сравнивает строки и
должен сохранять позицию. Если backend предоставляет только forward cursor,
frontend хранит стек посещённых cursor-ов для «Назад». Carbon рекомендует
pagination, когда весь набор долго загружать или невозможно показать в одном
view, и помещает control рядом с относящимся к нему содержимым
([Carbon Pagination](https://carbondesignsystem.com/components/pagination/usage/)).

Состояния обязательны:

- initial load — 6–8 skeleton rows той же высоты, чтобы layout не прыгал;
- search/filter refresh — строки остаются на месте с локальным progress state,
  если это не создаёт впечатление, что старые данные уже соответствуют запросу;
- empty — `События не найдены` + «Сбросить фильтры» при активных фильтрах;
- error — короткое безопасное сообщение и `Повторить`, query и filters сохранены;
- pagination load — controls временно disabled, выбранное draft-значение не
  теряется.

Carbon описывает skeleton и loading indicator как сигнал, что интерфейс не
замёрз, и отдельно поддерживает progressive loading
([Carbon Loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/)).

## Выбор и подтверждение

В dialog используются два разных состояния:

- **текущее значение формы** — то, что было сохранено до открытия;
- **draft selection** — строка, выбранная сейчас в dialog.

Клик по строке или `Space` меняет только draft selection. Кнопка **«Выбрать»**
применяет его к форме и закрывает dialog. **«Отмена»**, `Escape` и `[×]`
закрывают dialog без изменения значения. Если draft ушёл из текущей страницы
из-за поиска или фильтра, footer продолжает показывать
`Выбрано: <название>`; фильтрация не должна молча сбрасывать выбор.

Это соответствует APG: действие внутри dialog назначает значение, а cancel
возвращает focus к trigger без изменения прежнего значения
([WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).
Carbon transactional modal также требует, чтобы Cancel отменял изменения, а
primary action завершал задачу; название кнопки должно быть активным и точным,
не абстрактным `OK` или `Готово`
([Carbon Modal](https://carbondesignsystem.com/components/modal/usage/)).

Немедленное закрытие по клику строки допустимо только в упрощённом combobox без
фильтров и подробного сравнения. В едином сложном picker Lola явное
подтверждение предсказуемее и одинаково работает во всех формах.

## Accessibility contract

- Trigger — настоящий `button` с `aria-haspopup="dialog"`; он сообщает пустое
  или выбранное значение и имеет видимую label поля.
- Dialog имеет `role="dialog"`, `aria-modal="true"`, видимый заголовок через
  `aria-labelledby`; фон inert.
- При открытии focus переходит в search input. `Tab/Shift+Tab` остаются внутри,
  `Escape` отменяет, после закрытия focus возвращается в тот же trigger.
- Search имеет постоянную label, не только placeholder.
- Radio rows управляются `Arrow Up/Down` и `Space`; focus не равен draft
  selection визуально.
- Loading/result count объявляются через ненавязчивый `role="status"`, ошибка —
  через `role="alert"` без вывода сырого backend-текста.
- При частичной DOM-загрузке listbox-вариант задаёт `aria-setsize` и
  `aria-posinset`; APG прямо требует их для динамически подгружаемого набора.
- Цвет не является единственным признаком Backend/Frontend или выбранной строки.

Modal должен удерживать focus, закрываться по `Escape` и иметь видимую кнопку
закрытия по правилам
[WAI-ARIA APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
Требование `aria-setsize/aria-posinset` для частично присутствующих options
опубликовано в [WAI-ARIA APG Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).

## Граница единого компонента

`EventPicker` должен скрыть внутри себя:

- запрос выбранного объекта по id, если его нет в текущей странице;
- search/filter/pagination state;
- race cancellation и retry;
- draft selection и apply/cancel;
- отображение выбранного значения;
- dialog focus management и адаптивный fullscreen режим.

Формы-потребители передают только `projectId`, `modelValue`, label/required,
disabled и, при необходимости, ограничения допустимости. Они не загружают
каталог, не строят локальный `<select>` и не повторяют фильтрацию. Это создаёт
один проверяемый контракт для сценариев, сегментов, интеграций и будущих мест.

## Критерии готовности реализации

- Во всех местах выбора Event Definition используется один picker; нативных и
  локально собранных event `<select>` больше нет.
- Выбранное событие читается на форме без открытия dialog: название, код,
  описание и эффективные Backend/Frontend статусы.
- Поиск с backend возвращает совпадения по названию, описанию или коду во всём
  каталоге, а не только в загруженной странице.
- Backend/Frontend filters применяются до pagination; смена query/filter
  сбрасывает cursor.
- Результаты имеют устойчивые компактные строки, две строки описания и текстовые
  статусы; нет hover-only критичной информации.
- Выбор staged: Cancel/Escape ничего не меняют, «Выбрать» применяет draft.
- Loading, empty, error, retry, первая/следующая/предыдущая страница и
  восстановление выбранного id покрыты component tests.
- Проверены keyboard-only path, возврат focus, screen-reader names, `200%` zoom,
  ширины `320/390px` и desktop.

## Прямые источники

- [W3C WAI-ARIA APG — Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [W3C WAI-ARIA APG — Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
- [W3C WAI-ARIA APG — Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [IBM Carbon — Dropdown](https://carbondesignsystem.com/components/dropdown/usage/)
- [IBM Carbon — Filtering](https://carbondesignsystem.com/patterns/filtering/)
- [IBM Carbon — Modal](https://carbondesignsystem.com/components/modal/usage/)
- [IBM Carbon — Popover](https://carbondesignsystem.com/components/popover/usage/)
- [IBM Carbon — Structured list](https://carbondesignsystem.com/components/structured-list/usage/)
- [IBM Carbon — Pagination](https://carbondesignsystem.com/components/pagination/usage/)
- [IBM Carbon — Loading pattern](https://carbondesignsystem.com/patterns/loading-pattern/)
- [Microsoft Fluent 2 — Combobox](https://fluent2.microsoft.design/components/web/react/core/combobox/usage)
- [Ant Design — Select](https://ant.design/components/select/)
- [Shopify — Picker API](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/picker-api)
- [Shopify — Resource Picker API](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/resource-picker-api)
- [GOV.UK Design System — Pagination](https://design-system.service.gov.uk/components/pagination/)

## Что является синтезом для Lola

Источники подтверждают границы компонентов и ожидаемое поведение, но не задают
готовый event picker Lola. Конкретные размеры dialog/row, состав metadata,
effective-логика Backend/Frontend, cursor stack и единая component boundary —
это проектная рекомендация, полученная из текущего доменного контракта и задачи.
Её нужно проверить на реальных самых длинных названиях и описаниях, на 20
результатах в viewport и в responsive visual tests.
