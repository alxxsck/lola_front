# UX редактора действий сценария: каталог, настройка и граф

Дата исследования: 20 июля 2026 года.

## Задача и границы

Этот документ уточняет только четвёртый шаг редактора Lola — «Действия». Общее исследование структуры всего редактора уже находится в [scenario-editor-workflow-ux.md](./scenario-editor-workflow-ux.md); здесь рассматриваются четыре более узких вопроса:

1. как показывать уже добавленные действия и их полные названия;
2. как добавлять действие из большого каталога;
3. как дать достаточно места форме выбранного действия;
4. как сохранить доступ к графу на desktop, tablet и mobile.

Использованы только первичные источники: официальные справки Zapier, Node-RED и n8n, официальные документы Carbon, PatternFly и Android/Material, а также W3C. Предложения для Lola ниже — выводы из этих источников, а не попытка скопировать один продукт целиком.

## Короткое решение

**Не держать каталог действий в постоянной колонке шириной 188 px и не пытаться редактировать сложную форму в фиксированном инспекторе 360 px.** Три задачи должны быть разнесены:

- слева находится список **уже добавленных** действий с полными названиями и состояниями;
- команда «Добавить действие» открывает отдельный поисковый picker с категориями и явным местом вставки;
- настройка выбранного действия становится основной рабочей областью;
- граф остаётся сворачиваемым обзором, а для пространственного редактирования раскрывается в отдельный полноэкранный режим.

Такое разделение является адаптацией трёх подтверждённых паттернов: Zapier показывает весь flow в центре и открывает параметры только после выбора шага; Node-RED отделяет canvas, palette и изменяемые по размеру панели; Material/PatternFly переводят list-detail в один полноширинный detail на узком экране. ([Zapier editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows), [Node-RED editor](https://nodered.org/docs/user-guide/editor/), [Node-RED sidebars](https://nodered.org/docs/user-guide/editor/sidebar/), [Android canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts), [PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/))

## Что сейчас создаёт ограничение

Текущая desktop-сетка задаёт `188px` для общей левой колонки и `360px` для инспектора выбранного действия. ([ScenarioEditorPage.vue](../../src/pages/ScenarioEditorPage.vue#L2527-L2532)) В каталоге названия и подписи принудительно помещаются в одну строку с `text-overflow: ellipsis`. ([ScenarioEditorPage.vue](../../src/pages/ScenarioEditorPage.vue#L2679-L2691)) При ширине контейнера до `1024px` постоянный каталог и Vue Flow скрываются, но инспектор становится отдельной полноэкранной областью только до `767px`. ([ScenarioEditorPage.vue](../../src/pages/ScenarioEditorPage.vue#L3338-L3384), [ScenarioEditorPage.vue](../../src/pages/ScenarioEditorPage.vue#L3454-L3472))

Отсюда следует продуктовая проблема: между `768px` и `1024px` Lola уже убирает граф, но ещё оставляет форму в общем потоке страницы; на desktop два фиксированных sidebar конкурируют с графом и длинной формой. Рекомендация — переключать не отдельные CSS-элементы, а целую модель взаимодействия `list-detail-supporting pane`, сохраняя выбранное действие при смене ширины. Такой переход и сохранение выбранного элемента описаны в официальном list-detail паттерне Android/Material. ([Android canonical layouts: list-detail](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#list-detail))

## Что делают зрелые workflow-редакторы

| Источник | Подтверждённый паттерн | Вывод для Lola |
| --- | --- | --- |
| [Zapier: Visual Editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows) | В центре находится схема всех шагов; выбранный шаг открывает правую панель Setup / Configure / Test; добавление и быстрый поиск находятся в отдельной нижней области; у графа есть zoom, fit-to-view и collapse/expand paths. | Не смешивать каталог и настройки в одном sidebar; у графа оставить компактный обзор и явные команды управления viewport. |
| [Zapier: rationale](https://help.zapier.com/hc/en-us/articles/18164966455053-Visual-editor-now-generally-available) | Zapier прямо связывает понимание сложного workflow с видимостью всех шагов и одновременным редактированием детали в sidebar. | Не удалять граф из desktop-сценария, но не заставлять длинную форму постоянно жить в узкой колонке. |
| [Node-RED: editor](https://nodered.org/docs/user-guide/editor/) и [sidebars](https://nodered.org/docs/user-guide/editor/sidebar/) | Canvas является основной рабочей областью; панели можно переносить, разделять, скрывать и изменять по ширине. | Если список, форма и граф показаны одновременно, разделители должны быть изменяемыми, а панели — закрываемыми. |
| [Node-RED: palette](https://nodered.org/docs/user-guide/editor/palette/) | Большой каталог разбит на сворачиваемые категории и имеет фильтр. | Picker Lola должен иметь поиск и категории, а не одну длинную прокручиваемую ленту. |
| [Node-RED: Quick Add](https://nodered.org/docs/user-guide/editor/workspace/nodes) | Узел можно добавить через фильтруемый Quick Add, не перетаскивая его из palette; вызов на wire вставляет новый узел в связь. | «Добавить действие» должно открываться рядом с выбранным местом вставки и не зависеть от drag-and-drop. |
| [Node-RED: workspace](https://nodered.org/docs/user-guide/editor/workspace/) | Workspace имеет zoom-контролы и navigator с уменьшенным обзором всей схемы. | Свёрнутый граф Lola может служить обзором, а не вторым редактором в миниатюре. |
| [n8n: keyboard controls](https://docs.n8n.io/keyboard-shortcuts/) | Node Panel открывается с клавиатуры, выбранный узел вставляется по `Enter`, панель закрывается по `Escape`; категории управляются стрелками; `1` выполняет zoom-to-fit; command bar даёт быстрый доступ к добавлению узлов. | Picker, вставка и graph controls Lola должны быть полностью доступны без мыши. |
| [PatternFly: Drawer](https://www.patternfly.org/components/drawer/design-guidelines/) | Drawer бывает inline или overlay; splitter добавляется только когда пользователю действительно нужно перераспределять место между областями. | На широком desktop использовать inline/resizable режим, на меньшей ширине — overlay или отдельный экран, а не сжатие обеих областей. |
| [PatternFly: Primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/) | Выбранный объект должен иметь заметный selected state; на mobile остаётся только primary или detail, detail занимает всю ширину и имеет явный возврат. | На mobile использовать переход «Список действий → Настройка действия», а не складывать список, граф и форму вертикально. |
| [Android/Material: supporting pane](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#supporting-pane) | На expanded-экране основная область получает около 70%, supporting pane — около 30%; на compact supporting content переносится ниже или в sheet и открывается отдельной командой. | В режиме настройки форма является primary content, а граф — supporting pane с возможностью раскрытия. |
| [Carbon: Accordion](https://carbondesignsystem.com/components/accordion/usage/) | Accordion подходит для связанного, не обязательного к одновременному чтению содержимого при дефиците места; Carbon предупреждает, что скрытый контент могут не заметить, и запрещает внутренний горизонтальный scroll. | Обязательные поля и ошибки оставлять видимыми; длинные второстепенные разделы раскрывать по запросу без вложенных scroll-box. |

## Рекомендуемая информационная архитектура

### 1. Список добавленных действий, а не каталог

Левая область показывает только узлы текущего сценария в фактическом порядке. В каждой строке нужны полное русское название, короткое резюме настройки, `nodeKey`, состояние ошибки и заметный selected state; название должно переноситься минимум на две строки, а не обрезаться после одного слова. Это адаптация primary-detail с явным selected state и требования W3C сохранять текст и функциональность при reflow/увеличении, а не скрывать их фиксированной высотой. ([PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [W3C Resize Text technique](https://www.w3.org/WAI/WCAG22/Techniques/general/G179.html))

Постоянное основное действие списка — **«Добавить действие»**. Между соседними строками доступна команда **«Вставить здесь»**; это переносит подтверждённую модель Node-RED Quick Add на линейный список и будущую вставку между связанными узлами. ([Node-RED Quick Add](https://nodered.org/docs/user-guide/editor/workspace/nodes))

### 2. Поисковый picker действий по запросу

Picker открывается только после «Добавить действие» или «Вставить здесь». В нём видны строка поиска, полные названия, короткие понятные описания, категории «Логика», «Ожидания», «Действия» и выбранное место вставки. Поиск получает фокус при открытии; `Enter` добавляет выделенный вариант, `Escape` закрывает picker, стрелки перемещают выбор. Эти взаимодействия напрямую следуют из официальных Node Panel/Command Bar n8n и фильтруемого Quick Add Node-RED. ([n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/), [Node-RED Quick Add](https://nodered.org/docs/user-guide/editor/workspace/nodes), [Node-RED palette](https://nodered.org/docs/user-guide/editor/palette/))

Picker не должен требовать перетаскивания: WCAG 2.2 AA требует для drag-операции эквивалент с одиночным кликом/тапом; среди официальных примеров есть меню для перемещения элемента и кнопки перемещения списка. ([W3C Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))

### 3. Настройка выбранного действия как primary content

После выбора узла заголовок основной области повторяет его полное русское название и показывает тип, `nodeKey`, состояние сохранения и ошибки. Основная форма получает большую часть доступной ширины; если одновременно открыт граф или список, их размеры меняются splitter-ом с минимальной и максимальной границей, а не фиксированным `360px`. PatternFly прямо поддерживает `minSize`, `maxSize`, клавиатурный шаг изменения размера и доступное имя splitter-а. ([PatternFly Drawer component](https://www.patternfly.org/components/drawer/), [PatternFly Drawer guidance](https://www.patternfly.org/components/drawer/design-guidelines/))

На широком экране рекомендуемая композиция выглядит так:

```text
┌───────────────────┬────────────────────────────────────────────────┐
│ Действия сценария │ Озвучить текст · step_1                       │
│                   │                                                │
│ ✓ Запуск диалога  │ Обязательные параметры                         │
│ ● Озвучить текст  │ Текст, ключ, переходы                          │
│ ! Ждать цель      │                                                │
│                   │ Переводы  10 из 11 · 1 требует внимания        │
│ + Добавить        │ Тайм-ауты  По умолчанию                        │
│                   ├────────────────────────────────────────────────┤
│                   │ Схема · обзор        По размеру  На весь экран │
└───────────────────┴────────────────────────────────────────────────┘
```

Здесь форма — primary area, а нижний граф — supporting pane. На expanded-экранах Material рекомендует отдавать primary area большую часть пространства, а PatternFly допускает горизонтальный или вертикальный splitter в drawer. ([Android/Material supporting pane](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#supporting-pane), [PatternFly Drawer guidance](https://www.patternfly.org/components/drawer/design-guidelines/))

### 4. Progressive disclosure внутри формы

Поля, без которых действие не может быть сохранено или понято, а также ошибки и предупреждения остаются раскрытыми. Сворачивать можно длинные второстепенные группы — например, список переводов, тайм-ауты и дополнительные параметры — только если заголовок всегда показывает содержательное резюме состояния. Carbon рекомендует accordion для связанного необязательного содержимого, но не для информации, которую пользователь должен прочитать целиком, и отдельно предупреждает о незаметности скрытого контента. ([Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/), [Carbon Disclosures](https://carbondesignsystem.com/patterns/disclosures-pattern/))

Для переводов резюме должно отвечать на вопрос о готовности без раскрытия: **«Переведено 10 из 11 · 1 требует внимания»**, **«Не запускались»**, **«Перевод выполняется»**. Сам список языков раскрывается в нормальный вертикальный поток без отдельного горизонтального scroll и без фиксированной высоты внутренней панели; Carbon требует прокручивать весь accordion и не допускать horizontal scroll внутри него. ([Carbon Accordion: scrolling content](https://carbondesignsystem.com/components/accordion/usage/#scrolling-content))

## Граф: обзор и отдельный пространственный режим

Свёрнутый граф внизу формы предназначен для ориентации: он подсвечивает выбранный узел, показывает ближайшие входящие/исходящие связи и предлагает **«По размеру»** и **«На весь экран»**. Zoom-to-fit, navigator/minimap и collapse/expand сложных веток уже используются официальными редакторами Zapier, Node-RED и n8n для сохранения ориентации в больших схемах. ([Zapier editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows), [Node-RED workspace](https://nodered.org/docs/user-guide/editor/workspace/), [n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/))

Полноэкранный режим становится настоящим graph editor: полный viewport, поиск узла, zoom, fit-to-view, minimap, добавление и вставка между связями. Форма выбранного узла в этом режиме открывается как закрываемый overlay/inline drawer в зависимости от доступной ширины; такой primary-detail поверх topology соответствует официальным PatternFly drawer/topology и Zapier visual editor. ([PatternFly Drawer](https://www.patternfly.org/components/drawer/design-guidelines/), [PatternFly Topology control bar](https://www.patternfly.org/extensions/topology/control-bar), [Zapier editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows))

Если полноэкранный граф реализован как modal, он должен удерживать `Tab` внутри, закрываться по `Escape`, получать начальный фокус внутри и возвращать фокус на кнопку «На весь экран» после закрытия. Если он реализован как отдельный route/view, modal focus trap не нужен, но нужен явный «Вернуться к настройке». ([W3C APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/))

## Адаптивное поведение

| Доступная ширина | Режим Lola | Основание |
| --- | --- | --- |
| Достаточно места для list + primary form + supporting graph | Список добавленных действий слева; широкая форма справа; граф снизу в изменяемой supporting pane. | [Android/Material supporting pane](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#supporting-pane), [PatternFly Drawer](https://www.patternfly.org/components/drawer/design-guidelines/) |
| Две области помещаются, три уже сжимают содержимое | Список + форма; граф свёрнут в строку «Схема · открыть обзор» или открывается overlay/fullscreen. | [PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| Compact/mobile | Один экран за раз: «Список действий» → «Настройка действия» → опциональный «Обзор схемы»; Back возвращает к тому же выбранному элементу списка. | [Android/Material list-detail](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#list-detail), [PatternFly primary-detail mobile behavior](https://www.patternfly.org/patterns/primary-detail/design-guidelines/) |

Breakpoint следует выбирать по тому, помещается ли содержимое без обрезания и двумерного scroll формы, а не по названию устройства. W3C разрешает двухмерную область для схемы, но это исключение относится только к самой визуализации: заголовки, picker и форма должны reflow до эквивалента `320 CSS px` без потери функций. ([W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))

На mobile карточка действия целиком является target, а основные кнопки и строки picker-а рекомендуется проектировать не меньше `44 × 44 CSS px`: обязательный минимум WCAG 2.2 AA — `24 × 24`, а `44 × 44` — усиленный AAA-ориентир для удобства touch, который здесь разумно принять как внутренний стандарт. ([W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html))

## Доступность splitter, picker и формы

- Resizable divider должен иметь доступное имя, управляться клавиатурой с предсказуемым шагом и соблюдать min/max формы; PatternFly Drawer предоставляет именно эти параметры для resizable panel. ([PatternFly Drawer component](https://www.patternfly.org/components/drawer/))
- Открытие overlay drawer должно переводить фокус внутрь, а закрытие — возвращать его к вызвавшему элементу; PatternFly поддерживает focus trap и автоматический возврат фокуса. ([PatternFly Drawer component](https://www.patternfly.org/components/drawer/))
- Picker должен иметь видимое имя, программную метку dialog/listbox, клавиатурное перемещение, `Enter` для выбора и `Escape` для закрытия; модель клавиш подтверждается n8n, а modal semantics — W3C APG. ([n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/), [W3C APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/))
- Перетаскивание узлов или изменение их порядка никогда не является единственным способом: рядом доступны «Переместить выше/ниже», «Вставить перед/после» или эквивалентное меню. ([W3C Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))
- При увеличении текста до `200%` названия действий, подписи полей и кнопки не обрезаются и не перекрываются; при `400%`/эквиваленте `320 CSS px` форма остаётся одноколоночной, а только граф может иметь собственный двухмерный viewport. ([W3C Resize Text](https://www.w3.org/WAI/WCAG22/Techniques/general/G179.html), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))

## Проверяемый пользовательский путь

1. Пользователь открывает «Действия» и видит полный список уже созданных узлов; выбранный узел заметен, его полное название и краткое резюме читаются без hover. Это следует из selected-state primary-detail и требований reflow. ([PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/), [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))
2. «Добавить действие» открывает поисковый picker; пользователь может найти действие, увидеть полное название и добавить его кликом, тапом или клавиатурой без drag-and-drop. ([Node-RED Quick Add](https://nodered.org/docs/user-guide/editor/workspace/nodes), [n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/), [W3C Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html))
3. После добавления открывается широкая настройка нового действия; граф остаётся обзором, но не забирает ширину обязательных полей. Это адаптация supporting pane и resizable primary-detail. ([Android/Material supporting pane](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#supporting-pane), [PatternFly Drawer](https://www.patternfly.org/components/drawer/design-guidelines/))
4. Пользователь раскрывает «Переводы», видит состояние каждого языка и закрывает секцию, сохраняя сводку готовности; ошибки не исчезают вместе с содержимым accordion. ([Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/), [Carbon Disclosures](https://carbondesignsystem.com/patterns/disclosures-pattern/))
5. «На весь экран» открывает пространственное редактирование графа; закрытие возвращает пользователя к тому же действию и тому же месту формы. ([PatternFly Drawer](https://www.patternfly.org/components/drawer/design-guidelines/), [W3C APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/))
6. На mobile тот же сценарий проходит через отдельные полноширинные экраны list → detail → graph, а возврат восстанавливает выбранный узел и позицию списка. ([Android/Material list-detail](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#list-detail), [PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/))

## Критерии готовности дизайна и реализации

- В постоянной левой области нет полного каталога; там только созданные действия и одна явная команда добавления. Основание — отдельные Quick Add/Node Panel в Node-RED и n8n. ([Node-RED Quick Add](https://nodered.org/docs/user-guide/editor/workspace/nodes), [n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/))
- Полное русское название действия видно в списке, picker-е, заголовке формы и узле графа; увеличение текста не превращает его в одну обрезанную строку. ([W3C Resize Text](https://www.w3.org/WAI/WCAG22/Techniques/general/G179.html))
- Inspector не имеет единственной фиксированной ширины `360px`: форма является primary content или живёт в resizable panel с min/max и клавиатурным resize. ([PatternFly Drawer component](https://www.patternfly.org/components/drawer/))
- Graph viewport никогда не перекрывает список или форму; его двумерный scroll ограничен собственным контейнером, а остальная страница reflow-ится. ([W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))
- Есть явные «По размеру», «Свернуть» и «На весь экран»; zoom-to-fit доступен также с клавиатуры. ([Zapier editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows), [n8n keyboard controls](https://docs.n8n.io/keyboard-shortcuts/))
- На узкой ширине одновременно не показываются список, граф и форма; переход в detail имеет понятный Back и сохраняет selection. ([Android/Material list-detail](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts#list-detail), [PatternFly primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/))
- Любое действие, доступное drag-and-drop, имеет кликабельную/тапабельную альтернативу; основные mobile targets проектируются под `44 × 44 CSS px`, а минимум `24 × 24 CSS px` проверяется автоматически. ([W3C Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html))
- Обязательные поля, ошибки и статус сохранения не спрятаны в disclosure; свёрнутые длинные разделы имеют информативное резюме и не создают вложенный горизонтальный scroll. ([Carbon Accordion](https://carbondesignsystem.com/components/accordion/usage/), [Carbon Disclosures](https://carbondesignsystem.com/patterns/disclosures-pattern/))

## Источники, намеренно не использованные как доказательство

Маркетинговые галереи, Dribbble, Behance, Pinterest, сторонние UX-обзоры и пересказы продуктовых интерфейсов не использовались. Они могут дать визуальное настроение, но не являются первичным основанием для поведения редактора. Конкретные размеры, цвета и брейкпоинты Lola должны быть проверены прототипом и визуальными/E2E-тестами после выбора этой информационной архитектуры; сами источники подтверждают поведение областей, но не готовую сетку Lola.
