# UI Product API request detail: discovery и рекомендации

Дата исследования: 27 июля 2026 года.

## Задача

Пересобрать read-only detail запроса Product API так, чтобы статус не растягивался
и оставался в предсказуемом месте, служебные значения быстро сканировались, JSON
читался как код, а drawer одинаково хорошо работал на desktop, mobile, с
клавиатурой и screen reader.

Исследование опирается на первичные источники: официальные документации PrimeVue,
IBM Carbon, PatternFly, GOV.UK, W3C WAI/WCAG и Highlight.js. Рекомендации для Lola
ниже — выводы из них с учётом существующего кода, а не прямое копирование одной
дизайн-системы.

## Короткий вывод

Оставить **right-side drawer**: для детали выбранной строки это подходящий
primary-detail pattern, сохраняющий контекст списка. На телефоне тот же drawer
должен становиться полноэкранным. Внутри нужны четыре ясно отделённых уровня:

1. заголовок `POST /api/v1/interaction-sessions`;
2. компактная строка итога: `201 · Успешно`, пользователь, получено, длительность;
3. компактный description list технических реквизитов с подписанным Log ID и
   copy-действиями у длинных значений;
4. read-only JSON code block с подсветкой, копированием и раскрытием только для
   длинного содержимого.

Drawer официально предназначен для контекстного содержимого у края экрана, а
PrimeVue поддерживает right/full-screen варианты и responsive utilities.
PatternFly отдельно приводит slide-out drawer как типичную деталь выбранной
строки в primary-detail layout.
([PrimeVue: Drawer](https://primevue.dev/drawer/),
[PatternFly: Primary-detail](https://v4-archive.patternfly.org/v4/demos/primary-detail/design-guidelines))

## Что именно не работает в текущем варианте

Текущая реализация находится в `src/pages/OperationsPage.vue`:

- drawer имеет разумное ограничение `min(760px, 100vw)`, поэтому менять сам
  desktop-паттерн не требуется;
- статус собран из широкого `Tag` с `201` и отдельного `SUCCEEDED` под ним. Они
  воспринимаются как два значения, а цветная полоса визуально становится главным
  элементом карточки. Конкретная причина растяжения — локальное правило
  `.detail-hero span { display: block }`: оно применяется и к корневому
  `<span>` компонента PrimeVue `Tag`;
- верхняя hero-сетка распределяет три колонки равными долями, хотя статусу
  достаточно ширины содержимого;
- `Request ID`, credential prefix, размер, duration и retention выстроены в одну
  длинную вертикальную «таблицу» с одинаковым весом;
- внутренний log ID показан неподписанной строкой в самом низу;
- payload уже форматируется через `JSON.stringify(..., null, 2)`, но остаётся
  обычным `<pre>` без копирования, подсветки и управления большой высотой.

Это не требует нового экранного паттерна. Нужна более строгая информационная
иерархия и переиспользование уже имеющихся примитивов.

## Рекомендуемая композиция

```text
Product API request                                      [×]
POST /api/v1/interaction-sessions

[✓ 201 · Успешно]  Пользователь probe_test_hash_3
                   Получено 27 июл. 2026, 19:02 · 147 мс · 183 Б

Реквизиты запроса
Request ID          721f…739bc                         [копировать]
Credential prefix   lola_srv_MvoVF47                   [копировать]
Log ID              50aa…018c                          [копировать]
Хранится до         26 авг. 2026, 19:02

Исходный JSON body                         JSON  [копировать]
┌────────────────────────────────────────────────────────────┐
│ {                                                          │
│   "externalUserId": "probe_test_hash_3",                   │
│   "profileSnapshot": { … }                                 │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
                                [Показать полностью]
```

### 1. Статус: один компактный, стабильный объект

Показывать HTTP code и outcome в одном read-only status chip:
**`201 · Успешно`**. Он должен занимать ширину содержимого
(`inline-flex`/`width: fit-content`, `white-space: nowrap`), а его колонка —
`max-content`, а не `1fr`. Это «фиксированное» размещение в смысле стабильной
геометрии; `position: fixed` здесь не нужен, потому что он создаст перекрытия при
scroll/zoom.

Статус ставится первым в summary и всегда остаётся в одном месте. Цвет — только
дополнительный сигнал: рядом остаётся текст, для success можно добавить
checkmark. W3C запрещает передавать смысл только цветом; Carbon также рекомендует
сочетать статус с текстом и дополнительным визуальным признаком. GOV.UK
использует tag именно для статуса и рекомендует минимально необходимое число
статусов, а не набор разноцветных меток.
([W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color),
[Carbon: Status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/),
[GOV.UK: Tag](https://design-system.service.gov.uk/components/tag/))

Не стоит показывать `201` в зелёном блоке, а `SUCCEEDED` второй строкой. Для
русского интерфейса основная подпись — «Успешно»/«Ошибка»; raw outcome можно
оставить только как вторичную техническую информацию, если он нужен поддержке.
PrimeVue `Tag` уже установлен и поддерживает severity, pill и icon — новая
библиотека для статуса не нужна.
([PrimeVue: Tag](https://primevue.dev/tag/))

### 2. Summary: только данные для ответа «что произошло?»

В верхнем summary оставить:

- статус;
- пользователя;
- время получения;
- duration и размер payload как короткие вторичные метрики.

Их можно уложить в две строки без трёх одинаковых больших колонок. Верхний блок
не должен дублировать все технические реквизиты. Визуально наиболее важны
endpoint и результат; идентификаторы нужны уже для расследования.

### 3. Реквизиты: semantic description list, не data table

`Request ID`, credential prefix, log ID и retention — это пары «термин —
значение» одной сущности, поэтому разметка `<dl><dt><dd>` семантически точнее
таблицы или набора несвязанных `div`. PatternFly description list прямо
предназначен для terms/descriptions и поддерживает compact, horizontal,
multi-column и responsive orientation. Carbon structured list также рекомендует
логичные, сканируемые read-only группы для простой информации.
([PatternFly: Description list](https://www.patternfly.org/components/description-list/),
[Carbon: Structured list](https://carbondesignsystem.com/components/structured-list/usage/))

Для Lola:

- desktop: две колонки пар `minmax(0, 1fr)`, но каждая пара вертикальная —
  короткий muted label над значением;
- узкий drawer: одна колонка;
- long IDs: monospace, `overflow-wrap: anywhere`, полное значение доступно без
  hover-only tooltip;
- у Request ID и Log ID — icon button «Скопировать Request ID/Log ID»;
- credential prefix копировать только если это реальная задача поддержки;
- внутренний log ID обязательно подписать, а не оставлять «хвостом» внизу.

Это не интерактивная коллекция, поэтому DataTable и карточка на каждое поле будут
избыточны. Разделители нужны между смысловыми группами, а не после каждой пары.

### 4. JSON: развить существующий CodeBlock

В репозитории уже есть
`src/features/end-user-attributes/ui/CodeBlock.vue`. Он обеспечивает:

- корректную read-only семантику `<figure><figcaption><pre><code>`;
- локальные vertical/horizontal scroll;
- focusable `<pre>`;
- кнопку копирования с доступным именем и видимым состоянием
  «Скопировано»;
- mobile-стили.

Carbon различает read-only code snippet и editable input, требует доступную
copy-функцию с коротким подтверждением и для multi-line snippet допускает
«Показать больше/меньше» либо вертикальный scroll после примерно девяти строк.
Фокус после копирования остаётся на кнопке.
([Carbon: Code snippet](https://carbondesignsystem.com/components/code-snippet/usage/))

Поэтому предпочтительный путь — не добавлять готовый JSON-tree viewer, а:

1. поднять существующий `CodeBlock` в общий UI-слой;
2. передавать `JSON.stringify(payload, null, 2)`;
3. добавить optional `collapsible`/`collapsedLines` и кнопку
   «Показать полностью»/«Свернуть» с `aria-expanded` и `aria-controls`;
4. не показывать toggle для короткого payload;
5. копировать всегда полный JSON, даже когда визуально он свёрнут.

Tree viewer с независимым раскрытием каждого объекта стоит добавлять только если
исследование реальных логов покажет, что payload часто очень велик и пользователи
ищут отдельные ветки. Для показанного payload это лишняя вложенная навигация.

### 5. Syntax highlighting: одно маленькое дополнение, не редактор

Сейчас библиотека подсветки в `package.json`/lockfile не обнаружена. Если
подсветка обязательна, минимальный вариант — `highlight.js` с импортом только
core и grammar JSON, без auto-detection и без Vue plugin. Официальная
документация рекомендует `<pre><code>` и показывает selective imports как самый
маленький bundle-вариант.
([Highlight.js: README and imports](https://highlightjs.readthedocs.io/en/latest/readme.html),
[Highlight.js: Core API](https://highlightjs.readthedocs.io/en/latest/api.html))

Практический контракт:

```ts
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("json", json);
const highlighted = hljs.highlight(formattedJson, { language: "json" }).value;
```

Не использовать auto-detection для данных, про которые уже известно, что это
JSON. В DOM допустим только HTML, сгенерированный highlighter из исходной строки;
нельзя передавать raw payload напрямую в `v-html`. Цвета strings, numbers,
booleans/null и keys должны использовать токены текущей светлой/тёмной темы и
сохранять достаточный contrast. Если зависимость нежелательна, лучше временно
оставить хороший моноширинный формат без подсветки, чем писать собственный
неполный JSON lexer.

Monaco, CodeMirror и полноценный editor сюда не нужны: данные read-only, а
Carbon прямо отделяет code snippet от редактируемого input.
([Carbon: Code snippet](https://carbondesignsystem.com/components/code-snippet/usage/))

## Responsive-поведение

### Desktop и tablet

- right drawer шириной около `720–760px`, но не больше viewport;
- header с close button остаётся визуально отделённым;
- scroll принадлежит body drawer, а не всей странице под ним;
- metadata — две колонки, JSON занимает всю ширину.

### Mobile / zoom

- под узким breakpoint drawer становится full-screen, без desktop margins и
  скругления внешней панели;
- summary и `<dl>` становятся одной колонкой;
- code block может иметь собственный горизонтальный scroll, но весь drawer не
  должен скроллиться по двум осям;
- close и copy остаются видимыми текстом или имеют полное accessible name.

PrimeVue предоставляет full-screen drawer и responsive mode. WCAG 2.2 Reflow
требует сохранения информации и функций при ширине, эквивалентной 320 CSS px,
без общего двухмерного scroll; code block является допустимым локальным
исключением, когда двумерная компоновка нужна для смысла.
([PrimeVue: Drawer](https://primevue.dev/drawer/),
[WCAG 2.2, SC 1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow))

Проверить минимум 320, 390, 768 и 1440 px, а также 200% text zoom. Критичные
значения нельзя скрывать на mobile; перестраивается сетка, а не информация.

## Accessibility-контракт

PrimeVue Drawer уже удерживает focus, поддерживает `Tab`/`Shift+Tab`, `Escape` и
keyboard close, но официальная документация требует явно связать trigger через
`aria-expanded`/`aria-controls` и позволяет передать собственные role и
`aria-labelledby`.
([PrimeVue: Drawer accessibility](https://primevue.dev/drawer/#accessibility))

Для этого экрана:

- использовать `role="dialog"`, `aria-modal="true"` и связать drawer с видимым
  `h2`;
- при открытии большого структурированного содержимого поставить initial focus
  на заголовок/начало drawer с `tabindex="-1"`, а не сразу в середину JSON;
- при закрытии вернуть focus на кнопку/строку, открывшую detail;
- не полагаться только на `row-click`: в строке должен быть явный keyboard-
  accessible control «Открыть детали запроса»;
- close button должен иметь accessible name;
- status передаётся текстом, не только зелёным цветом;
- copy feedback объявляется через видимый текст и/или `aria-live="polite"`;
- раскрытие JSON — настоящий `<button>` с `aria-expanded` и `aria-controls`;
- semantic headings, `<dl>`, `<pre><code>` сохраняют структуру; для такого
  сложного содержимого не задавать один длинный `aria-describedby` на весь drawer.

WAI-ARIA modal dialog pattern требует focus внутри, циклический Tab, Escape,
доступное имя, видимую close-кнопку и возврат focus к trigger. Для длинного
структурированного содержимого WAI рекомендует initial focus на статическом
элементе в начале и не советует превращать всё содержимое в одно
`aria-describedby`.
([WAI-ARIA APG: Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/))

## Приоритет реализации

### P0 — без новых зависимостей

1. Собрать status в один compact chip `201 · Успешно`; убрать растяжение.
2. Перегруппировать hero в компактный summary.
3. Заменить `audit-facts` на responsive `<dl>` и подписать Log ID.
4. Добавить copy для Request ID и Log ID.
5. Переиспользовать существующий `CodeBlock` для форматированного payload.
6. Явно связать accessible trigger, title и drawer; проверить focus return.
7. Сделать full-screen mobile layout.

### P1 — малое расширение общего компонента

1. Добавить в `CodeBlock` conditional collapse после 9–12 строк.
2. Добавить `aria-live` для результата копирования и обработку ошибки clipboard.
3. Перенести компонент из feature-local в shared UI, если он используется
   минимум в двух доменных экранах.

### P2 — одна небольшая dependency

Добавить selective `highlight.js/core + json` только если подсветка входит в
критерии готовности. Не добавлять editor или JSON-tree viewer до появления
сценария редактирования/навигации по большим payload.

## Проверяемые критерии готовности

- Status chip не шире содержимого и находится в одном месте при success/error,
  коротком/длинном user ID и разных viewport.
- В status одновременно читаются HTTP code и человекопонятный outcome; смысл не
  зависит от цвета.
- Пользователь за один взгляд на верх drawer видит endpoint, результат, время и
  duration.
- Каждый ID подписан; Request ID и Log ID копируются отдельной кнопкой.
- Нет неподписанного идентификатора внизу drawer.
- JSON сохраняет точные данные, форматируется с двумя пробелами, копируется
  полностью и не маскируется под editable textarea.
- Toggle JSON показывается только при превышении порога строк; он работает
  мышью, Enter и Space и имеет корректный `aria-expanded`.
- Общая страница не получает горизонтальный scroll на 320 px; возможный
  горизонтальный scroll ограничен code block.
- Drawer имеет доступное имя, закрывается Escape, удерживает focus и возвращает
  его к trigger.
- Деталь можно открыть без мыши, а close/copy/toggle имеют видимый focus.
- Layout проверен на 320, 390, 768 и 1440 px, при 200% zoom, в светлой и тёмной
  теме, на коротком и длинном payload.

## Первоисточники

- [PrimeVue: Drawer](https://primevue.dev/drawer/)
- [PrimeVue: Tag](https://primevue.dev/tag/)
- [PatternFly: Primary-detail](https://v4-archive.patternfly.org/v4/demos/primary-detail/design-guidelines)
- [PatternFly: Description list](https://www.patternfly.org/components/description-list/)
- [Carbon: Structured list](https://carbondesignsystem.com/components/structured-list/usage/)
- [Carbon: Code snippet](https://carbondesignsystem.com/components/code-snippet/usage/)
- [Carbon: Status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- [GOV.UK: Tag](https://design-system.service.gov.uk/components/tag/)
- [WAI-ARIA APG: Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WCAG 2.2: Reflow](https://www.w3.org/TR/WCAG22/#reflow)
- [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)
- [Highlight.js: README](https://highlightjs.readthedocs.io/en/latest/readme.html)
- [Highlight.js: Core API](https://highlightjs.readthedocs.io/en/latest/api.html)
