# Современный AI prompt composer для Lola

Дата исследования: 1 августа 2026 года.

## Задача и границы

Нужно полностью пересобрать блок «Что нужно узнать о проекте?» на обзорной
странице Lola: сделать его современным, визуально спокойным и понятным при
первом использовании, не меняя существующий процесс оценки стоимости,
подтверждения и выполнения запроса.

Исследование опирается только на первичные источники: официальные справки и
продуктовые материалы OpenAI ChatGPT, Anthropic Claude, Google Gemini и Notion
AI, а также W3C/WAI и WCAG 2.2. Официальные продукты документируют поведение и
расположение функций, но не публикуют универсальную сетку или точные размеры
своих composer. Поэтому ниже отдельно отмечены подтверждённые паттерны и
продуктовые выводы для Lola.

## Короткое решение

**Полностью заменить правое поле на цельный composer; левый контекстный блок
можно сохранить на широком desktop, но он не должен конкурировать с вводом.**
Сам composer строится как один управляемый объект:

1. компактный header с Lola и кратким обещанием результата;
2. явный label «Запрос» и многострочное поле;
3. единая нижняя action-rail: контекст/ограничения слева, счётчик и shortcut в
   середине, основная отправка справа;
4. submit — самый заметный интерактивный элемент, но не огромная pill-кнопка;
5. состояния focus, empty, busy, disabled, success/error меняют сигнал, а не
   геометрию всего блока.

```text
┌──────────────────────────────────────────────────────────────────┐
│ Запрос к Lola                            Только чтение · В журнал │
│                                                                  │
│ Запрос                                                           │
│ Что вы хотите узнать о пользователях или событиях проекта?       │
│                                                                  │
│ [Разрешённые источники]        0 / 10 000   ⌘↵   [ Спросить  ↑ ] │
└──────────────────────────────────────────────────────────────────┘
```

Это не копия одного продукта. Это общий устойчивый каркас, который можно
проверить сразу у нескольких лидеров. Официальный скриншот ChatGPT показывает
placeholder, attachment/tools и отдельные действия в одной округлой поверхности
([страница](https://help.openai.com/en/articles/9237897-connectors-in-chatgpt),
[прямой скриншот](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-9ce62ecef76c516e5c56a21a/78a2e1227a5a1bf23d98d53dcf32d828/Screenshot_2025-04-28_at_14_44_26.png)).
Claude размещает `Search and tools` в нижней левой части chat input, Gemini
собирает prompt, Add files и Submit в одном нижнем text box, а Notion AI
позволяет задавать prompt вместе с явно выбранным контекстом и источниками
([OpenAI: Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt),
[OpenAI: Operator / agent mode in composer](https://openai.com/index/introducing-operator/),
[Anthropic: web search in chat input](https://support.anthropic.com/en/articles/10684626-enabling-and-using-web-search),
[Google: Use Gemini Apps](https://support.google.com/gemini/answer/13275745?hl=en),
[Notion AI FAQ](https://www.notion.com/help/notion-ai-faqs)).

## Что видно в современных продуктах

| Продукт | Подтверждённый паттерн | Вывод для Lola |
| --- | --- | --- |
| ChatGPT | Официальная справка показывает единый округлый composer с placeholder и нижней строкой attachment/tools/actions; Projects помещает plus-menu для фото, файлов и режимов туда же; agent mode выбирается из dropdown в composer ([Connectors + screenshot](https://help.openai.com/en/articles/9237897-connectors-in-chatgpt), [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt), [Operator update](https://openai.com/index/introducing-operator/)). | Источники и режим исполнения относятся к текущему запросу и должны быть внутри/рядом с composer, а не в отдельном тяжёлом информационном столбце. |
| Claude | `Search and tools`, выбор style, web search и connectors находятся в нижней левой зоне chat input ([Styles](https://support.anthropic.com/en/articles/10181068-configuring-and-using-styles), [Web search](https://support.anthropic.com/en/articles/10684626-enabling-and-using-web-search), [Connectors](https://support.anthropic.com/en/articles/11817150-connect-your-tools-to-unlock-a-smarter-more-capable-ai-companion)). | Левый край footer — естественное место для вторичного контекста; основной submit остаётся изолирован справа. |
| Gemini | На web пользователь вводит prompt в text box снизу, может добавить файл и отправляет отдельным Submit; на mobile suggestion chips появляются над chat box ([Gemini Apps](https://support.google.com/gemini/answer/13275745?hl=en), [screen actions](https://support.google.com/gemini/answer/15850607)). | Примеры допустимы как короткие chips над/под полем, но не должны конкурировать с вводом. Для Lola безопаснее подставлять пример в draft, а не запускать дорогой запрос автоматически. |
| Claude mobile | Внутри input доступны отдельные понятные controls: send вверх, stop во время ответа, plus для camera/photos/files и voice рядом с microphone ([Claude voice mode](https://support.anthropic.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)). | Состояние действия лучше передавать заменой иконки/подписи в стабильном 44 px control, а не перестраивать всю форму. Stop добавлять только если backend действительно умеет отмену. |
| Notion AI | Notion Agent держит page context, `@`-references, `All sources`, attachment и model/Auto рядом с prompt; AI Block имеет prompt, `Specified context`, `Search`, затем отдельные `Done` и `Generate`; глобальный shortcut настраивается ([Notion Agent](https://www.notion.com/help/notion-agent), [Notion AI FAQ](https://www.notion.com/help/notion-ai-faqs)). | «Разрешённые источники» можно оформить как раскрываемый context-chip. Shortcut должен быть видимым, документированным и платформенно корректным. |

Общий продуктовый сдвиг 2025–2026 — composer становится **контекстным командным
центром**, но остаётся компактным. Новые возможности прячутся в меню/chips и
раскрываются по запросу; основной сценарий всё ещё читается как «ввести →
отправить». Это вывод из сопоставления официально описанных интерфейсов, а не
формальное правило одной дизайн-системы.

## Рекомендуемая композиция Lola

### 1. Уровень страницы

- На широком desktop можно сохранить существующий левый контекст о Lola, но
  снизить его контраст и отдать правой форме большую долю ширины. Ниже
  breakpoint две части складываются в одну колонку.
- Правый composer должен выглядеть как самостоятельная светлее очерченная
  поверхность, а не как огромное пустое продолжение фонового баннера. Рабочая
  ширина `560–760 px`; точное значение — рекомендация Lola, которую нужно
  проверить на реальном экране.
- Один нейтральный raised surface, тонкая граница, локальный brand-accent.
  Gradient/glow может подсветить край или submit, но не лежать под текстом и не
  быть единственным способом распознать состояние.

### 2. Header

- Если левый контекстный блок сохраняется, внутри composer достаточно маленького
  label **«Запрос к Lola»**; вторую крупную Lola-mark и ещё один заголовок не
  добавлять. В самостоятельной одноколоночной версии допустимы небольшая
  `32–40 px` mark и заголовок **«Спросить Lola»**.
- Справа или второй строкой: два коротких доверительных сигнала
  **«Только чтение»** и **«Сохранится в журнале»**. Подробное объяснение — в
  tooltip/popover по кнопке «Как это работает», а не постоянным абзацем.
- Не повторять одновременно `AI workspace`, большую sparkle-плитку, длинный
  заголовок и поясняющий абзац. У контрола одна задача, поэтому достаточно одного
  имени и одной короткой строки.

### 3. Поле ввода

- Нужен настоящий видимый `<label>` **«Запрос»**. Placeholder не заменяет label:
  WAI рекомендует связывать инструкции с полем через `label` и
  `aria-describedby`, а placeholder использовать только как пример
  ([WAI Form Instructions](https://www.w3.org/WAI/tutorials/forms/instructions/),
  [WCAG Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name)).
- Placeholder сделать короче и ближе к задаче:
  **«Например: кто завершил депозит вчера и из каких GEO?»**. Длинный текст в
  текущем поле выглядит как заранее введённое значение и ухудшает scanning.
- Desktop: начальная высота около `112–128 px`, рост до разумного максимума с
  внутренним scroll после него. Mobile: не меньше `120 px`, font-size `16 px`.
  Это продуктовые размеры, не требования WCAG.
- Placeholder и helper — обычный читаемый текст, не почти прозрачный декор:
  WCAG 2.2 включает placeholder в требование контраста `4.5:1` для обычного
  текста ([SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).

### 4. Нижняя action-rail

- Слева: compact chip/menu **«Источники: разрешённые»** или
  **«Только чтение»**. Если список нельзя менять, это non-interactive status с
  tooltip; если можно просмотреть — button с явным accessible name и popover.
- По центру/справа: `⌘ Enter` на macOS, `Ctrl Enter` на Windows/Linux; на узком
  экране подсказку скрыть. Существующий shortcut Lola безопаснее, чем
  `Enter = submit`, потому что запрос многострочный и может потребовать
  подтверждения стоимости. Это продуктовое решение Lola, не требование
  исследованных систем.
- Счётчик `0 / 10 000` оставить тихим secondary metadata. До 80% лимита он не
  должен быть главным объектом; после порога усилить цвет/вес, а превышение
  описать текстом. Если ошибка определяется автоматически, WCAG требует
  идентифицировать поле и описать ошибку текстом
  ([SC 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)).
- Submit справа: desktop compact button **«Спросить» + arrow-up**, mobile —
  круглая arrow-up button с `aria-label="Спросить Lola"`. Button должен
  активироваться `Enter` и `Space` и иметь accessible name
  ([WAI-ARIA Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)).

## Submit affordance и состояния

### Empty

- Поле активно, submit визуально disabled.
- Disabled нельзя выражать одной пониженной opacity: форма и label остаются
  читаемыми, кнопка сохраняет узнаваемый силуэт.
- Для обычной кнопки, доступность которой легко понять из контекста, native
  `disabled` уместен; WAI отмечает, что disabled controls обычно исключаются из
  tab order. `aria-disabled` нужен, если сохранение discoverability в фокусе
  действительно важно
  ([WAI keyboard interface practice](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)).

### Focus

- Подсвечивать весь внутренний composer через `:focus-within`, но оставлять
  отчётливый focus indicator на самом textarea/button через `:focus-visible`.
- Не использовать только мягкий glow: визуальная информация границы и focus
  должна иметь `3:1` к соседним цветам; keyboard focus обязан быть видимым
  ([SC 1.4.11](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html),
  [SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible),
  [WAI `:focus-visible` technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C45)).
- Focus не меняет padding, border width или высоту: только цвет/outline/shadow,
  чтобы composer не «прыгал».

### Ready / hover / active

- Filled brand submit — единственный сильный цветовой объект.
- Hover слегка повышает контраст или смещает arrow на 1 px; active снижает
  elevation. Не пульсировать постоянно.
- Текст button и иконка сохраняют контраст, а target на desktop и mobile лучше
  делать `44 × 44 CSS px`: `24 × 24` — минимум WCAG 2.2 AA, `44 × 44` —
  усиленная цель WCAG AAA и более надёжный touch target
  ([SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
  [SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)).

### Busy

- Зафиксировать введённый текст; вместо arrow показать spinner и подпись
  **«Lola анализирует»** на desktop. Не очищать поле до подтверждённого успеха.
- Если отмены нет, не показывать stop — Claude использует stop как отдельный
  control именно во время прерываемой генерации
  ([Claude voice controls](https://support.anthropic.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)).
- `aria-busy="true"` на форме и один `role="status"`/`aria-live="polite"` для
  «Оцениваем», «Нужно подтверждение», success/error. WAI описывает
  `role="status"` как способ сообщать динамический статус без перемещения фокуса
  ([WAI ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22)).

### Confirmation, success, clarification, error

- Оставить status panel под composer, но визуально связать с ним общей шириной
  и радиусом. Появление статуса не должно менять ширину header/input/footer.
- Confirmation содержит стоимость и две явные команды; success — ссылку на
  анализ и «Новый запрос»; clarification/error возвращают возможность правки.
- Ошибка не заменяет placeholder и не сообщается только цветом: текстовая
  причина находится рядом с полем/статусом
  ([WCAG Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)).

## Mobile-контракт

```text
┌────────────────────────────┐
│ ✦ Спросить Lola      ⓘ     │
│ Только чтение · В журнал   │
│                            │
│ Запрос                     │
│ Что хотите узнать?         │
│                            │
│ Источники    0/10k    [↑]  │
└────────────────────────────┘
```

- Одна колонка уже с tablet breakpoint; никаких двух узких панелей рядом.
- Footer остаётся одной строкой, пока помещается; secondary shortcut исчезает
  первым, затем сокращается счётчик до `0/10k`. Submit всегда крайний справа и
  не меньше `44 × 44 px`.
- При `320 CSS px` карточка и каждый её внутренний элемент помещаются без
  горизонтального scroll; WAI приводит 320 px как базовую ширину проверки
  reflow ([WAI G225](https://www.w3.org/WAI/WCAG22/Techniques/general/G225)).
- При открытой экранной клавиатуре focused textarea и submit не должны целиком
  перекрываться author-created sticky/footer layers
  ([SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)).
- На mobile примерные prompts могут идти горизонтальными chips под header, но
  tap только заполняет поле. Gemini допускает suggestion chips над chat box и
  отдельно документирует auto-submit; для Lola с оценкой стоимости безопаснее
  не запускать их автоматически
  ([Gemini screen actions](https://support.google.com/gemini/answer/15850607)).

## Что изменить относительно текущего `AICommandComposer.vue`

Текущая реализация уже сохраняет полезную семантику: `section`, `form`,
`aria-busy`, live status, character count, native submit и `Cmd/Ctrl + Enter`.
Их нужно сохранить. Полностью меняется визуальная композиция:

| Сейчас | После редизайна |
| --- | --- |
| Поле визуально растворено в большом тёмном баннере | Спокойная raised surface с ясной границей внутри блока |
| В форме нет собственной короткой иерархии | `Запрос к Lola` + input + компактная action-rail |
| Огромная textarea-зона с длинным placeholder | Видимый label, короткий пример, контролируемый auto-grow |
| Счётчик и shortcut одинаково заметны с действием | Secondary metadata; submit — единственный primary accent |
| Широкая pill «Спросить Lola» | Compact 44–48 px action, label на desktop и icon на mobile |
| Aura/orbit/breathe как постоянный AI-образ | Статичный brand accent; motion только на смене состояния |

## Критерии готовности

- При первом взгляде понятно: где вводить, что произойдёт, какие ограничения
  действуют и где отправка.
- Header, textarea и footer воспринимаются как один control; submit является
  единственной primary action.
- Есть видимый label; placeholder — только пример и имеет контраст не ниже
  `4.5:1`.
- Empty, focused, ready, busy, disabled, confirmation, success и error можно
  различить без layout shift и без опоры только на цвет.
- `Cmd/Ctrl + Enter` отправляет; обычный Enter создаёт новую строку; shortcut
  скрывается на mobile.
- Все buttons работают с клавиатуры, имеют accessible name, видимый focus и
  target не меньше `44 × 44 px`.
- На ширине `320 px` нет горизонтального scroll; экранная клавиатура не прячет
  focused control за sticky-слоем.
- `role="status"` сообщает progress/result без принудительного перемещения
  фокуса; ошибка описывается текстом.
- Проверены light/dark theme, reduced motion и zoom/reflow.

## Ограничения исследования

Официальные справки подтверждают структуру современных composer, размещение
tools/context рядом с prompt, отдельную отправку, mobile controls и keyboard/
accessibility-контракты. Они не задают общие точные радиусы, отступы или цвета.
Конкретные значения Lola выше — проектная гипотеза; её следует проверить
визуально на desktop (`1440 px`), tablet (`768–1024 px`) и mobile
(`320/390 px`) в обеих темах.
