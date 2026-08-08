# Каталожный single-select для событий и элементов интерфейса

Дата: 8 августа 2026 года.

## Короткий вывод

Текущий `EventPicker` выбран в целом правильно: каталог на сотни записей не
нужно возвращать в dropdown. Нужен один переиспользуемый паттерн:

- компактное закрытое поле показывает уже выбранный объект;
- кнопка «Выбрать» / «Изменить» открывает большой dialog;
- внутри всегда видны поиск, простые фильтры и компактный список;
- клик по строке только меняет **черновой single-select**; checkbox нет;
- «Выбрать» фиксирует значение, а «Отмена» и `Escape` оставляют прежнее;
- desktop использует большой dialog, mobile — полноэкранный dialog;
- данные загружаются страницами; автоматический infinite scroll не является
  единственным способом получить следующую страницу.

Для элементов интерфейса следует не копировать `EventPicker`, а выделить из
него общий `CatalogPicker` с предметными адаптерами `EventPicker` и
`UiElementPicker`. Так поиск, пагинация, focus management, loading/error/empty и
адаптив исправляются один раз.

## Что сейчас есть в Lola

### EventPicker

[`EventPicker.vue`](../../src/features/events/EventPicker.vue) уже содержит
правильные базовые решения: PrimeVue `Dialog`, поиск с debounce, cursor loading,
защиту от устаревшего ответа, фильтр канала, draft selection, явное применение,
отдельные loading/error/empty states и компактное закрытое значение.

Single-select уже визуально не показывает checkbox: выбранная строка получает
outline. Это соответствует задаче. Outline через `box-shadow` не участвует в
расчёте размеров, поэтому сам по себе не создаёт внешних отступов или разную
высоту соседних controls.

Но перед переиспользованием паттерн нужно дочистить:

1. `radiogroup` собран из `button role="radio"`, но для него нет roving tabindex
   и обработки стрелок. Сейчас клавиатурная модель не соответствует APG.
2. У каждой строки остаётся отдельный tab stop; при 25 результатах это делает
   dialog медленным для клавиатуры.
3. Выбранное состояние и keyboard focus визуально близки. Они должны быть двумя
   разными состояниями: selection сохраняется, focus перемещается.
4. В trigger два одинаковых `pi-arrow-right`; это выглядит как случайный дубль,
   а не осознанная иконография.
5. `N на странице` сообщает число уже загруженных строк, но не размер результата;
   изменение search/filter не объявляется отдельным live region.
6. У search нет гарантированного, одинакового во всех браузерах clear control.
7. Mobile меняет footer и trigger, но сам dialog не становится полноценной
   `100dvh`-поверхностью с safe-area и предсказуемым поведением экранной
   клавиатуры.
8. `append-to="self"` помещает overlay внутрь локального component subtree.
   Это требует отдельной проверки clipping/stacking во всех родительских
   контейнерах. Особенно важно, что [`AIReviewDialog.vue`](../../src/features/ai-review/ui/AIReviewDialog.vue)
   уже показывает `EventPicker` внутри другого `Dialog`: Carbon прямо не
   рекомендует вложенные modal dialogs, потому что они усложняют контекст и
   управление фокусом ([Carbon dialog pattern](https://carbondesignsystem.com/patterns/dialog-pattern/)).

### Выбор элементов интерфейса

В сценариях поле `target` в
[`ActionConfigFields.vue`](../../src/features/actions/ActionConfigFields.vue)
сейчас является обычным PrimeVue `Select`: весь реестр заранее загружается,
строка показывает только `name` и `kind`, а поиск по описанию, фильтры и
пагинация отсутствуют. Этот компонент используется из
[`ScenarioNodeInspector.vue`](../../src/features/scenarios/ScenarioNodeInspector.vue).

Второе реальное место выбора опубликованной цели —
[`SendActionDialog.vue`](../../src/features/live/SendActionDialog.vue). Там также
используется обычный `Select`, а label склеивает `name · code`.

Текущий repository contract
[`api-repository.ts`](../../src/shared/api/repository/api-repository.ts)
вызывает `GET /ui-elements` без query/cursor/limit и получает весь массив.
Следовательно:

- локальные поиск и постраничный показ можно реализовать сразу;
- это улучшит UI, но не уменьшит сетевую загрузку;
- настоящая серверная пагинация и серверный поиск требуют расширения backend
  contract и регенерации клиента.

## Прикладное дизайн-направление

**Пользователь:** администратор или автор сценария, который уже настраивает шаг
и должен быстро связать его с каноническим объектом, не теряя контекст формы.

**Задача:** найти один объект среди 200–500 похожих сущностей, проверить его по
названию, коду и описанию и осознанно применить.

**Ощущение:** плотный, спокойный, технически надёжный каталог — в логике
существующей UI-системы Lola, а не декоративная галерея карточек.

- **Домен:** событие, target, системный код, описание, канал, тип цели, active
  policy, alias, сценарий.
- **Цветовой мир:** нейтральный canvas, белая рабочая поверхность, тихие
  разделители, фирменный синий только для focus/selection/primary action,
  мягкие semantic tints для статусов.
- **Signature:** `catalog row` — name как главный текст, monospace code,
  1–2 строки описания и компактные предметные badges в одинаковых местах.
- **Отвергаем:** огромный dropdown → dialog catalog; checkbox-таблицу для
  single-select → строка с outline; карточную сетку → плотный линейный список,
  который быстрее сканировать и проще адаптировать.

Это продолжает записанную в [`.interface-design/system.md`](../../.interface-design/system.md)
сетку `4px`, основные отступы `8/12/16px`, workbench-tight density и стратегию
«тихие borders + tonal surface shifts».

## Рекомендуемая анатомия

### Закрытое состояние

Поле должно занимать ту же высоту, что соседний control: базово `44px`, а в
локально компактной форме — тот же локальный control token, например `38px`.
Нельзя увеличивать высоту только потому, что значение выбрано.

```text
Элемент интерфейса
┌────────────────────────────────────────────────────────────┐
│ ◇ Блок пополнения     deposit.block       [Изменить →]    │
└────────────────────────────────────────────────────────────┘
```

- имя и code стоят в одной строке на широком поле;
- на узком поле code уходит во вторую строку **внутри той же заданной высоты**
  только если высота этого вида control согласована для всей строки формы;
- длинные значения обрезаются ellipsis, полные name/description доступны в
  dialog;
- кнопка сообщает текущее значение в accessible name;
- empty state использует тот же box model и текст «Выбрать».

### Desktop dialog

```text
┌ Выберите элемент интерфейса ─────────────────────────────── × ┐
│ Найдите цель по названию, коду, описанию или alias.           │
│ [⌕ Поиск по названию, коду или описанию…              ][×]   │
│ [Все типы] [Только активные]                    Найдено: 238 │
├───────────────────────────────────────────────────────────────┤
│ Блок пополнения                              Элемент · Active │
│ deposit.block                                                │
│ Подсвечивает блок ввода суммы и способа оплаты…              │
├───────────────────────────────────────────────────────────────┤
│ Выбор способа оплаты                        Элемент · Active │
│ deposit.method                                               │
│ Открывает доступные способы оплаты…                          │
├───────────────────────────────────────────────────────────────┤
│ 26–50 из 238                   [←] [2 / 10] [→]  [Отмена][Выбрать] │
└───────────────────────────────────────────────────────────────┘
```

- ширина около `min(960px, 100vw - 32px)`; сложный каталог оправдывает
  default/large modal ([Carbon Modal](https://carbondesignsystem.com/components/modal/usage/));
- header, results viewport и footer — три самостоятельные зоны;
- body скроллится, header/footer остаются на месте; горизонтального scroll нет;
- строка desktop ориентировочно `64–76px`: `12px` padding, name `0.84rem/650`,
  code `0.68–0.72rem` monospace, description максимум две строки;
- между строками `4px`, без внешних margin для selected state;
- selected: `1px` brand border + мягкий **inset** ring/tint; focus: отдельный
  внешний `2px` outline. Hover не должен выглядеть выбранным.

Carbon описывает modal через header/body/footer, советует фиксировать header и
footer при прокрутке длинного body и запрещает горизонтальную прокрутку
([Carbon Modal](https://carbondesignsystem.com/components/modal/usage/)).

### Mobile

На compact breakpoint dialog становится отдельной полноэкранной задачей:

- `width: 100vw; height: 100dvh; max-height: none`;
- padding учитывает `env(safe-area-inset-*)`;
- header и search остаются сверху, footer — снизу;
- type filter сворачивается в одну кнопку `Фильтры · N`, но не открывает второй
  modal: фильтры раскрываются inline внутри текущей поверхности;
- каждая строка остаётся одноколоночной; badges переносятся под description;
- footer оставляет range, previous/next и primary action; вторичные page-size
  controls скрываются;
- все touch targets не меньше `44×44px`.

Carbon задаёт для mobile ширину modal `100%`, допускает высоту `100%` экрана или
bottom-attached content height ([Carbon Modal style](https://carbondesignsystem.com/components/modal/style/)).
У Carbon pagination на малом breakpoint сохраняет range/total и previous/next,
убирая вторичные selects ([Carbon Pagination](https://carbondesignsystem.com/components/pagination/usage/)).

## Selection и accessibility

Для результата лучше семантика single-select `listbox`, а не самодельный
`radiogroup`:

- контейнер `role="listbox"`, строки `role="option"`;
- только один option имеет `aria-selected="true"`;
- checkbox и видимый radio не нужны;
- внутри option нет отдельных кнопок, ссылок или checkbox — вся строка одна цель;
- name, code, description и metadata образуют понятное accessible name/description;
- `Arrow Up/Down`, `Home/End` двигают focus; `Enter`/`Space` меняют draft;
- `Tab` входит в список одним tab stop и затем уходит к footer;
- focus не обязан автоматически менять selection: пользователь может осмотреть
  варианты стрелками и применить только осознанный выбор.

APG определяет listbox как single- или multi-select widget, использует
`aria-selected`, требует стрелочную навигацию и отдельно подчёркивает различие
focus и selection ([WAI-ARIA APG Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/),
[Keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)).
PrimeVue `Listbox`, уже доступный в зависимостях проекта, поддерживает single
selection по умолчанию, custom option slot, `aria-selected`, keyboard navigation
и virtual scrolling ([PrimeVue Listbox](https://primevue.org/listbox/)). Его
встроенный filter локальный, поэтому для server search search input должен
остаться внешним.

Dialog сохраняет PrimeVue primitive. При открытии focus ставится в search; `Tab`
и `Shift+Tab` остаются внутри; `Escape` закрывает без commit; после закрытия focus
возвращается на trigger. Это обязательный modal contract
([WAI-ARIA APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[PrimeVue Dialog](https://primevue.org/dialog/)).

## Search, filters и pagination

### Search

Search работает по нормализованному OR-набору:

- события: `name`, `code`, `description`;
- UI elements: `name`, `code`, `aiDescription`, `aiAliases`;
- placeholder честно перечисляет scope: «Название, код или описание»;
- debounce `200–300ms`, отмена/игнорирование устаревших запросов;
- изменение query сбрасывает страницу и scroll к началу;
- явный clear button появляется после ввода;
- result count, loading, no results и request error объявляются через
  `aria-live="polite"`; ошибка имеет retry.

Carbon рекомендует search именно для сложных/больших наборов, требует короткий
placeholder, который объясняет область поиска, и clear control после ввода
([Carbon Search](https://carbondesignsystem.com/components/search/usage/)).

### Filters

Фильтры видимы непосредственно над результатами:

- events: канал приёма / доступность;
- UI elements: `kind`, active state, при необходимости AI exposure;
- если action schema уже ограничивает `targetKinds`, это показывается как
  фиксированный scope badge, а не бессмысленный изменяемый filter;
- для одной простой категории результаты обновляются сразу;
- для нескольких дорогих server categories можно использовать draft filters +
  «Применить фильтры»;
- есть общий «Сбросить» и видимый счётчик активных filters.

Carbon рекомендует размещать несколько категорий сверху или слева от data set,
не прятать их вместе в dropdown, а для скрытой mobile-панели показывать число
активных filters и clear action
([Carbon Filtering](https://carbondesignsystem.com/patterns/filtering/)).

### Pagination

Для 200–500 объектов приоритетнее явная server pagination, чем бесконечная
автоподгрузка:

1. если API возвращает total/page — показывать range, total, current и
   previous/next в footer;
2. если API cursor-only — допустим явный `Показать ещё`, но не scroll-triggered
   infinite load как единственный путь;
3. выбранный key и выбранный option snapshot сохраняются между страницами;
4. query/filter change возвращает на первую страницу;
5. page load показывает skeleton/progress, не схлопывает высоту dialog;
6. virtual scrolling нужен только для уже загруженного большого массива и сам
   по себе не заменяет server pagination.

Carbon рекомендует pagination, когда полный набор дорог в загрузке или не
помещается в одном view, и размещает её непосредственно под связанными данными
([Carbon Pagination](https://carbondesignsystem.com/components/pagination/usage/)).
PrimeVue `Paginator` уже реализует `nav`, `aria-current`, live page report и
keyboard activation ([PrimeVue Paginator](https://primevue.org/paginator/)).

## Рекомендуемая граница компонента

Не переносить event-specific icon/filter/text в generic слой. Общая оболочка
должна принимать примерно такой контракт:

```ts
interface CatalogPickerOption {
  value: string
  title: string
  code?: string
  description?: string
  metadata?: Array<{ label: string; tone?: string }>
}

interface CatalogPickerRequest<Filters> {
  query: string
  cursor?: string
  limit: number
  filters: Filters
}

interface CatalogPickerPage {
  items: CatalogPickerOption[]
  nextCursor: string | null
  total?: number
}
```

`CatalogPicker` владеет dialog, draft/commit, focus, search, page state и common
states. Адаптер события задаёт ingestion filters и event badges; адаптер UI
element задаёт kind/active/AI metadata и преобразует `UiElement`.

## Acceptance checklist для визуальной проверки

- Trigger пустой и выбранный имеют одинаковую высоту во всех grid rows.
- Selection не меняет размер строки и расстояние до соседей.
- Один клик выбирает ровно один объект; checkbox нигде не появляется.
- Отмена, close и `Escape` не изменяют сохранённое значение.
- Повторное открытие показывает сохранённое значение и находит его даже после
  смены страницы/search.
- Search находит слово из description, не только name/code.
- Filters + search вместе сбрасывают page и не принимают старый network response.
- Desktop проверен минимум на `1440×900` и `1024×768`.
- Mobile проверен минимум на `390×844` и `320×568`, в том числе с экранной
  клавиатурой, длинным name/code/description и safe-area.
- Tab входит в results одним stop; arrows/Home/End перемещают focus; Enter/Space
  выбирают; focus и selected одновременно различимы.
- Loading, empty, error/retry, disabled, no-permission и no-compatible-targets
  не ломают размеры dialog.
- Вложенный picker внутри существующего modal проверен отдельно; предпочтительно
  перестроен без nested modal.

## Первичные источники

- [WAI-ARIA APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI-ARIA APG: Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
- [WAI-ARIA APG: Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [Carbon: Modal](https://carbondesignsystem.com/components/modal/usage/)
- [Carbon: Modal style and responsive sizes](https://carbondesignsystem.com/components/modal/style/)
- [Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/)
- [Carbon: Search](https://carbondesignsystem.com/components/search/usage/)
- [Carbon: Pagination](https://carbondesignsystem.com/components/pagination/usage/)
- [PrimeVue: Dialog](https://primevue.org/dialog/)
- [PrimeVue: Listbox](https://primevue.org/listbox/)
- [PrimeVue: Paginator](https://primevue.org/paginator/)
