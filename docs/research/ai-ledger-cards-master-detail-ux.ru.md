# Насыщенные карточки и master-detail для AI-журналов Retenive

Дата исследования: 1 августа 2026 года.

## Задача

Определить современный и проверяемый паттерн для `AI-анализов` и
`Журнала AI-операций`, где у каждой записи много пользовательских и технических
полей. Фокус: master-detail без scroll jump, desktop/mobile side panel,
progressive disclosure UUID/metadata, copy affordance, плотные фильтры и единая
типографика.

Использованы только официальные источники: IBM Carbon, Microsoft Fluent 2,
Material, Shopify Polaris, W3C/WAI, MDN и Vue Router. Конкретные брейкпоинты и
состав полей ниже — рекомендации для Retenive.

## Решение для Retenive

### 1. Не сжимать две полноценные карточки рядом

На desktop выбрать один из двух устойчивых вариантов:

1. **Рекомендуемый:** постоянный master-detail при `>= 1200 px`.
   Слева всегда компактный список шириной примерно 360–440 px, справа — preview
   или detail. До выбора записи справа показывается полезный empty state.
   Открытие detail не меняет ширину и высоту карточек списка.
2. Если продукту нужен полноширинный список до выбора записи, detail открывается
   как **overlay drawer**, не меняя геометрию списка. Не переключать один и тот
   же full-card list между шириной всей страницы и узкой половиной экрана.

Material описывает list-detail как соседние панели, а Fluent рекомендует inline
drawer, когда пользователю одновременно нужны основной контент и детали
([Material canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview),
[Fluent Drawer](https://fluent2.microsoft.design/components/web/react/core/drawer/usage)).

Для Retenive лучше постоянный двухпанельный desktop layout: журнал — рабочий экран,
где пользователь последовательно просматривает несколько операций. Выбранная
строка остаётся выделенной, а list и detail имеют независимый вертикальный
scroll.

### 2. На mobile list и detail — отдельные состояния

- При `< 768 px` detail занимает всю ширину и имеет явную кнопку «Назад к
  операциям/анализам».
- Закрытие возвращает прежний `scrollTop` списка и focus на открывшую запись.
- Route с `analysisId`/`operationId` сохраняется: detail можно открыть по прямой
  ссылке и пройти browser Back без потери позиции.
- Не оставлять под полноэкранным detail скрытый интерактивный список как часть
  немодальной композиции. Если используется настоящий modal drawer, фон должен
  стать inert, focus остаётся внутри, `Escape` закрывает панель, после закрытия
  focus возвращается на trigger
  ([WAI modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)).

Microsoft Fluent разделяет inline drawer для параллельной работы с контекстом и
overlay drawer для сфокусированного содержимого. Drawer состоит из title/header,
scrollable body и необязательного footer; sticky header/footer на маленьком
viewport и при 400% zoom следует убирать в пользу основного содержимого
([Fluent Drawer](https://fluent2.microsoft.design/components/web/react/core/drawer/usage)).

## Как избежать scroll jump

- Desktop: не демонтировать и не перестраивать список при смене `selectedId`.
  Меняется selected state и содержимое правой панели, а не grid списка.
- Не вставлять detail внутрь карточки над/под выбранной записью: это сдвигает все
  последующие элементы и теряет точку чтения.
- Не вызывать `scrollIntoView()` при каждом выборе. Фокусировать detail heading
  через `tabindex="-1"`, только если фокус действительно должен перейти в detail.
- Browser scroll anchoring по умолчанию компенсирует внезапные изменения над
  viewport; не отключать `overflow-anchor` глобально
  ([MDN: scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_anchoring)).
- Для собственного scrollable body панели использовать
  `scrollbar-gutter: stable`, чтобы появление scrollbar не меняло ширину текста
  и сетки
  ([MDN: scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter)).
- Для Back/Forward возвращать `savedPosition` через официальный
  `scrollBehavior` Vue Router. При переходе list → inline detail можно вернуть
  falsy value, чтобы window вообще не прокручивался
  ([Vue Router: Scroll Behavior](https://router.vuejs.org/guide/advanced/scroll-behavior)).
- Хранить отдельно `selectedId`, scroll списка и раскрытые секции. Загрузка
  следующего detail не должна сбрасывать остальные состояния страницы.

## Карточка списка: только данные для сканирования

Рекомендуемая anatomy:

```text
AI #184 · Анализ                         [Готов]
Что делал пользователь вчера и где возникли проблемы
Пользователь · 24 июл., 10:21 · $0.0216
Исторический источник · Есть ограничения              [Открыть]
```

Постоянно видны:

- статус и sequence;
- понятный title/question;
- область/категория;
- дата и время;
- стоимость, если доступна;
- важное ограничение или ошибка;
- явная ссылка/кнопка открытия.

Не показывать по умолчанию в каждой карточке:

- полные UUID администратора, пользователя, operation/run/source;
- provider response ID;
- catalog/query-policy digests;
- model/tool metadata;
- длинный список event codes.

Эти данные переходят в disclosure «Технические детали · N» либо в detail pane.
Carbon рекомендует accordion для progressive disclosure, когда пространство
ограничено и информация не обязательна для чтения целиком; критичные сведения
скрывать нельзя
([Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/)).

### Интерактивная структура карточки

Не оборачивать богатую карточку целиком в один `RouterLink`, если внутри должны
появиться Copy, disclosure или overflow actions. WAI показывает структуру
`article` + heading link + отдельная disclosure button: так accessible name
остаётся коротким, а вложенные actions остаются валидными и понятными
([WAI Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/),
[WAI expandable card](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/)).

Контракт disclosure:

- нативный `button`, `aria-expanded`, при необходимости `aria-controls`;
- `Enter` и `Space` раскрывают/закрывают;
- название конкретное: «Показать технические детали анализа #184»;
- раскрытие не открывает одновременно detail route;
- selected и keyboard focus визуально различаются.

## UUID и Copy

- В compact list показывать сокращение `f555b3bc…e694`, сохраняя тип поля рядом.
- В detail показывать полный ID моноширинным текстом с `overflow-wrap: anywhere`.
- Рядом — отдельная Copy button с accessible name: «Скопировать Analysis ID».
- Tooltip до действия: «Копировать ID»; после успеха: «Скопировано».
- После копирования focus остаётся на кнопке. Ошибка копирования сообщается
  текстом и не маскируется успешным состоянием.
- Copy action всегда находится в DOM. На touch она постоянно видима; desktop
  может визуально усиливать её на hover/focus, но не создавать только в этот
  момент.

Carbon использует отдельную icon button, confirmation tooltip и сохранение focus
для copy-action
([Carbon Code snippet](https://carbondesignsystem.com/components/code-snippet/usage/)).
`navigator.clipboard.writeText()` асинхронен, работает в secure context и может
завершиться отказом — Promise нужно обрабатывать
([MDN Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)).

## Detail pane

Разделить длинный detail на устойчивые блоки:

1. **Итог:** title, status, question/result, время, стоимость.
2. **Атрибуция:** инициатор, ответственный, пользователь данных.
3. **Запуски и использование данных:** повторяемые run/receipt sections.
4. **Технические данные:** IDs, revisions, digests, provider/model.
5. **Ограничения и ошибки:** рядом с объектом, которого они касаются.

Итог и ограничения открыты всегда. Технические данные свёрнуты по умолчанию;
run/receipt можно раскрывать независимо. Если пользователю обычно нужно прочесть
весь блок подряд, использовать обычные headings вместо accordion: Carbon
предупреждает, что лишнее раскрытие добавляет действие и может скрыть важное
([Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/)).

Drawer header содержит краткий title, status и close/back. Body прокручивается
самостоятельно. Footer нужен только если есть постоянные значимые действия; для
read-only detail пустой sticky footer не нужен.

## Плотные фильтры

Текущие 10–18 одновременно видимых полей создают отдельную большую форму до
начала списка. Сохранить batch flow с кнопкой `Применить`: Carbon рекомендует
его, когда пользователь задаёт несколько категорий или результат загружается не
мгновенно
([Carbon Filtering](https://carbondesignsystem.com/patterns/filtering/)).

### Desktop

Всегда видимая toolbar-строка:

- поиск по question/title/ID;
- status;
- category/scope;
- период;
- кнопка «Дополнительные фильтры · N»;
- `Применить`.

В disclosure/drawer «Дополнительные фильтры» перенести технические IDs,
source/provider, subject role и attribution. Под toolbar показывать applied
filter chips с индивидуальным удалением и `Сбросить все`.

Если фильтры скрыты, closed state обязан показывать число применённых условий и
давать сбросить их без повторного открытия. Это прямое правило Carbon; сброс
нужен также внутри каждой категории
([Carbon Filtering](https://carbondesignsystem.com/patterns/filtering/)).
Carbon размещает search, complex filters и display settings в toolbar списка и
ограничивает число видимых глобальных actions, отправляя остальные в overflow
([Carbon Data table](https://carbondesignsystem.com/components/data-table/usage/)).

Для частых наборов фильтров позже можно добавить сохранённые views. Polaris
объединяет search, sort, filters и saved views в одном index-filter pattern
([Shopify Polaris Index filters](https://polaris-site-prod-kit.shopify.prod.shopifyapps.com/components/selection-and-input/index-filters)).

### Mobile

- Закрытое состояние: `Фильтры · N` и отдельный доступный `Сбросить`.
- Открывать полноширинную filter surface, а не переносить desktop grid в длинную
  карточку над результатами.
- Поля идут одной колонкой и сгруппированы: основные, атрибуция, технические.
- Внизу `Показать результаты` и secondary `Сбросить` с touch-target 44–48 px.
- После применения focus возвращается на filter trigger, а пользователь остаётся
  у начала результатов.

## Единая типографика

В repeated product UI использовать одну productive scale:

| Роль               | Retenive token      | Размер / line-height        |
| ------------------ | --------------- | --------------------------- |
| Page title         | `heading-page`  | 32–40 / 40–48 px            |
| Detail title       | `heading-panel` | 20–24 / 26–32 px            |
| Card title         | `heading-card`  | 16 / 22 px, semibold        |
| Value/body/control | `body-product`  | 14 / 20 px                  |
| Label/helper       | `label-product` | 12 / 16 px                  |
| UUID/code          | `code-product`  | 12–13 / 16–18 px, monospace |

Carbon использует fixed productive styles для плотных рабочих экранов и 14 px
как базовый productive body; expressive scale уместна как отдельный page-header
момент, но не внутри повторяемых карточек
([Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/),
[Carbon typography strategy](https://carbondesignsystem.com/elements/typography/style-strategies/)).
Fluent также строит web product ramp вокруг `Body 1` 14/20, `Caption 1` 12/16 и
`Subtitle 2` 16/22
([Fluent Typography](https://fluent2.microsoft.design/typography)).

Правила:

- один и тот же тип данных имеет одну роль во всех карточках и detail;
- uppercase только для коротких labels, не для длинных русских фраз;
- UUID не уменьшается ради размещения — меняется disclosure/layout;
- не смешивать 10–12 px для обычных values с 17–23 px соседними headings;
- одинаковый vertical rhythm у всех карточек; не задавать fixed height,
  который обрежет длинный русский title или status.

## Карточки или таблица

Если основной сценарий — сравнивать одинаковые поля у десятков операций,
desktop data table будет быстрее: Carbon рекомендует table для поиска конкретной
записи и поддерживает expandable rows для secondary data. Dense table следует
дать максимальную доступную ширину, а не помещать в узкую панель
([Carbon Data table](https://carbondesignsystem.com/components/data-table/usage/)).

Практичный гибрид Retenive:

- desktop master — компактная structured list/table-like row;
- detail — rich sections;
- mobile master — карточки с тем же порядком полей.

Так сохраняется скорость сравнения на desktop без попытки втиснуть таблицу в
телефон.

## Acceptance criteria

- Открытие/закрытие desktop detail не меняет положение и ширину карточек master.
- Back с mobile detail возвращает прежний scroll и focus к выбранной записи.
- Summary-карточка содержит не больше 4–6 scan-level facts; UUID не доминируют.
- Все полные IDs доступны, копируются одной кнопкой и дают success/error feedback.
- Copy/disclosure actions доступны с клавиатуры и не вложены в общий card link.
- Closed filters показывают active count и `Сбросить`; applied filters видимы
  без открытия панели.
- На 320 CSS px нет page-level horizontal scroll; panel/header/actions не
  перекрывают содержимое
  ([W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
- Close, Back, Copy, disclosure и mobile filter actions имеют target не меньше
  44 × 44 CSS px как внутренний стандарт Retenive
  ([W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
  [W3C Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)).

## Источники

- [Material: canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview)
- [Microsoft Fluent 2: Drawer](https://fluent2.microsoft.design/components/web/react/core/drawer/usage)
- [IBM Carbon: Accordion](https://carbondesignsystem.com/components/accordion/usage/)
- [IBM Carbon: Filtering](https://carbondesignsystem.com/patterns/filtering/)
- [IBM Carbon: Data table](https://carbondesignsystem.com/components/data-table/usage/)
- [IBM Carbon: Code snippet and copy](https://carbondesignsystem.com/components/code-snippet/usage/)
- [IBM Carbon: Typography type sets](https://carbondesignsystem.com/elements/typography/type-sets/)
- [Microsoft Fluent 2: Typography](https://fluent2.microsoft.design/typography)
- [Shopify Polaris: Index filters](https://polaris-site-prod-kit.shopify.prod.shopifyapps.com/components/selection-and-input/index-filters)
- [WAI: Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WAI: Modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Vue Router: Scroll Behavior](https://router.vuejs.org/guide/advanced/scroll-behavior)
- [MDN: Scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_anchoring)
- [MDN: Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)
