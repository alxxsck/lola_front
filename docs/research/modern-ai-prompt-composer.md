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

## Светлая outer surface, aurora и tasteful motion

### Что подтверждают первичные дизайн-источники

Современная AI-поверхность не обязана быть тёмной, чтобы восприниматься как
«умная». В официальном скриншоте ChatGPT composer — светлый нейтральный
rounded-container с тонкой границей/тенью; идентичность создают сама форма,
иерархия controls и их состояния, а не сплошной тёмный фон
([OpenAI ChatGPT Search](https://help.openai.com/en/articles/9237897-connectors-in-chatgpt),
[прямой официальный скриншот](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-9ce62ecef76c516e5c56a21a/78a2e1227a5a1bf23d98d53dcf32d828/Screenshot_2025-04-28_at_14_44_26.png)).
На другом официальном ChatGPT-изображении во время генерации цвет и активность
локализованы в небольшом blue/violet orb над composer, а основная surface
остаётся нейтральной; это наблюдение по продуктовой иллюстрации, не спецификация
OpenAI
([ChatGPT overview](https://chatgpt.com/overview/),
[прямое изображение busy UI](https://images.ctfassets.net/8su2tbn87fck/1HKIsAZ11GjpEEyopYfLIW/094b52522ff5edf1b2b7d1b0200fd1be/Chat.png?fm=webp&q=90)).
Notion формулирует тот же принцип как встраивание AI в существующие building
blocks и показ нужных инструментов в текущем контексте, а AI Home 2025 остаётся
частью общего workspace, не отдельной «сценой»
([Notion: design thinking behind Notion AI](https://www.notion.com/blog/the-design-thinking-behind-notion-ai),
[Notion 2.51 / AI Home](https://www.notion.com/en-US/releases)).

Самое прямое первичное обоснование gradient/aurora-языка даёт команда Google
Gemini. Она описывает gradients как context builders и передачу энергии:
более концентрированный leading edge направляет внимание, а diffused tail
смягчает его. Круги и округлые containers удерживают динамический цвет, а
внутренняя активность показывает thinking/analysis
([Google Design: Illustrating the Gemini App](https://design.google/library/gemini-ai-visual-design)).
При этом Google отдельно говорит, что движение не декоративно и у каждой
анимации есть определённые начало и конец. Следовательно, для Lola aurora —
правильный AI-сигнал, но бесконечная активность всей hero-surface не является
паттерном, который этот источник поддерживает.

Это подтверждает и эволюция самого Gemini: редизайн ноября 2025 Google называет
clean/modern и направленным на более простой старт conversation, а в мае 2026
описывает следующий expressive UI как интерфейс, который «оживает» после prompt
за счёт fluid animations, color, typography и haptics. Практический вывод для
Lola — выраженность лучше усиливать **после действия**, а не держать всю surface
одинаково активной всегда
([Gemini 3 app redesign](https://blog.google/products-and-platforms/products/gemini/gemini-3-gemini-app/),
[next evolution of the Gemini app](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/)).

Material и Apple сходятся в том, что motion должен быть семантическим и
согласованным. Material выбирает скорость по размеру компонента/дистанции,
разделяет spatial motion и effects вроде color/opacity и даёт системные
duration-токены от `50` до `1000 ms`; большие перемещения получают большую
длительность
([Material Components: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md),
[Material 3 Motion](https://m3.material.io/styles/motion/overview/how-it-works)).
Apple рекомендует purpose-driven motion, краткую и точную feedback-анимацию,
избегание лишнего motion в часто повторяющихся взаимодействиях и возможность
не ждать её завершения
([Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
Классическая Material choreography формулирует полезную проверку для hero:
motion направляет внимание к одному focal point; несколько одновременно
конкурирующих движений отвлекают
([Material Motion: Choreography](https://m1.material.io/motion/choreography.html)).

### Визуальный контракт светлой Lola-surface

Рекомендуемая desktop-композиция:

```text
┌ light outer wrapper · faint lime/violet aurora ─────────────────┐
│  ✦ AI WORKSPACE                                                 │
│  Что нужно узнать о проекте?     ┌ raised composer ───────────┐ │
│  Короткое доверительное          │ Запрос к Lola              │ │
│  пояснение                       │ textarea                   │ │
│                                  │ source · count · shortcut ↑│ │
│                                  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- Outer wrapper: почти белая/neutral surface с очень слабым tint, тонкая
  граница, radius примерно `28–32 px`, мягкая широкая тень. Точные значения —
  продуктовая рекомендация Lola, не стандарт источников.
- Aurora: два-три больших radial-gradient слоя **за контентом** — lime у
  AI-label/иконки, violet/blue у composer/submit. Начальная opacity примерно
  `0.08–0.16`; ни один цветной слой не должен проходить непосредственно под
  обычным текстом.
- Composer: отдельная непрозрачная raised surface (`0.94–0.98` visual opacity),
  чтобы placeholder, border и focus сохраняли стабильный контраст при любом
  кадре aurora. Контраст проверяется в самом неблагоприятном кадре
  ([WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html),
  [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
- AI-градиент — не заливка каждого control. Он связывает outer wrapper и
  composer, а единственный насыщенный акцент остаётся у ready-submit.
- Не использовать rotating conic-gradient вокруг всей карточки, shimmer под
  текстом, крупные moving blobs или несколько несинхронных pulse. Они разрушают
  иерархию, делают периферическое движение заметнее и плохо соответствуют
  Apple-рекомендации минимизировать repetitive/peripheral motion
  ([Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)).

### Motion по состояниям

| Состояние | Рекомендуемое движение Lola | Интенсивность |
| --- | --- | --- |
| Первое появление | Один aurora-intro: fade + drift слоя, затем полная остановка | `700–1000 ms`, translate до `2%`, opacity delta до `0.08` |
| Idle, рекомендуемый вариант | Статичный мягкий gradient после intro | Нет постоянного движения |
| Idle, continuous-вариант | Очень медленный cross-fade/дрейф двух заранее нарисованных слоёв; обязателен pause control | `28–40 s` на цикл, translate `1–2%`, без breathing-scale, opacity delta `0.02–0.03` |
| Focus-within | Быстрый border/focus response; aurora лишь чуть яснее | `150–220 ms`, без изменения geometry |
| Ready | Submit меняет fill/contrast; допустим один короткий arrow response | `150–220 ms` |
| Submit → busy | Один направленный light sweep по краю или усиление двух aura-слоёв | `600–900 ms` |
| Долгий busy | После короткого запуска outer aura замирает в более ясном состоянии; progress показывает локальный spinner + текст | максимум `4–5 s` motion, затем static |
| Success/error | Короткий fade статуса; цвет + иконка + текст | `200–400 ms` |
| Reduced motion | Сразу конечный статичный кадр, без drift/scale/sweep | `animation: none`; допустима мгновенная смена или короткий opacity-only fade |

Числа в таблице — проектные параметры Lola. Для обычных state transitions они
укладываются в Material duration-scale, а длинный `28–40 s` цикл — отдельная
ambient-гипотеза, не Material token. Длинный цикл выбран именно для малой
скорости и малой амплитуды. В platform-specific разделе visionOS Apple отдельно
предупреждает против sustained oscillation, а общая accessibility-рекомендация
просит снижать интенсивность automatic/repetitive motion; это не числовой web-
стандарт, но полезная верхняя граница осторожности для крупной outer-surface
([Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)).

### Почему continuous idle нельзя включить безусловно

WCAG 2.2 требует pause/stop/hide для автоматически начавшегося движения, которое
идёт дольше пяти секунд параллельно другому контенту. Простого очень медленного
цикла недостаточно, если движение всё равно воспринимается
([SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)).
Поэтому есть два корректных продуктовых решения:

1. **Предпочтительно:** конечный intro до одной секунды, затем статичный idle;
   во время submit/busy — конечное усиление до пяти секунд.
2. **Если continuous является обязательной частью бренда:** рядом с «Как это
   работает» добавить доступную настройку **«Анимация: вкл/выкл»**, запоминать
   выбор и автоматически выключать motion при `prefers-reduced-motion: reduce`.

WAI рекомендует строить static styles как базу и включать motion только внутри
`@media (prefers-reduced-motion: no-preference)`; при `reduce` анимация
подавляется
([WAI C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39),
[CSS Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)).
Apple также требует реагировать на системный Reduce Motion, уменьшая automatic
и repetitive animation, заменяя spatial transitions на fades и избегая
animated blur/depth
([Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/),
[Apple reduced-motion evaluation](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)).
WCAG отдельно замечает, что opacity/color effects без изменения воспринимаемой
позиции, размера или формы не относятся к `motion animation` в узком смысле
SC 2.3.3. Это делает low-amplitude cross-fade безопаснее spatial drift, но не
отменяет SC 2.2.2, если эффект воспринимается как автоматически движущийся или
мигающий контент дольше пяти секунд
([SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html),
[SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)).

### Performance-контракт реализации

- Создать 2 декоративных абсолютных aura-layer/pseudo-elements внутри outer
  wrapper с `pointer-events: none`, `overflow: hidden` и `isolation: isolate`.
  Текст и controls остаются отдельным непрозрачным foreground-слоем.
- Рисовать мягкость самими radial-gradient stops. Не анимировать
  `filter: blur(...)`, `box-shadow`, `background-position`, gradient stops,
  border width, размеры или layout-properties.
- Анимировать только `transform` и `opacity`: web.dev рекомендует держать motion
  на compositing stage и проверять paint/layout в DevTools
  ([web.dev: high-performance CSS animations](https://web.dev/articles/animations-guide)).
- Настоящий animated blur дорог: Chrome показывает, что convolution выполняет
  тяжёлую GPU-операцию каждый frame; даже cross-fade blurred layers требует
  осторожности и проверки на слабом mobile GPU
  ([Chrome Developers: Animating a blur](https://developer.chrome.com/blog/animated-blur/)).
- Не ставить `will-change` на wrapper постоянно. Добавлять его только активному
  aura-layer на время конечной анимации и снимать после неё; для infinite-варианта
  подтвердить пользу профилированием. Избыточное число compositor layers также
  расходует память.
- Останавливать decorative motion, когда wrapper вне viewport или документ
  hidden. Это performance-оптимизация, но не замена пользовательскому pause или
  `prefers-reduced-motion`.
- На mobile уменьшить количество aura layers до двух, opacity примерно на
  треть, убрать scale и оставить только небольшой opacity/translate drift.
- Проверить Chrome DevTools Performance/Paint flashing на обычном mobile и при
  `4× CPU slowdown`: нет layout/paint на каждом кадре, нет заметного ухудшения
  typing latency, focus/submit остаются отзывчивыми. При дисплее `60 Hz` полный
  frame-budget около `16.66 ms`, поэтому декоративный слой не должен забирать
  его значимую часть
  ([web.dev: rendering performance](https://web.dev/articles/rendering-performance)).

### CSS-направление, а не готовая спецификация

```css
.ai-surface__aura {
  position: absolute;
  inset: -20%;
  pointer-events: none;
  opacity: .12;
  transform: translate3d(0, 0, 0);
  background:
    radial-gradient(circle at 18% 25%, var(--ai-aura-lime), transparent 34%),
    radial-gradient(circle at 82% 72%, var(--ai-aura-violet), transparent 38%);
}

@media (prefers-reduced-motion: no-preference) {
  .ai-surface.is-entering .ai-surface__aura {
    animation: ai-aura-intro 900ms cubic-bezier(.05, .7, .1, 1) both;
  }
}

@keyframes ai-aura-intro {
  from { opacity: 0; transform: translate3d(-2%, 1%, 0) scale(.99); }
  to   { opacity: .12; transform: translate3d(0, 0, 0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-surface__aura {
    animation: none !important;
    transform: none;
  }
}
```

Easing в примере соответствует Material emphasized decelerate для входящего
M3-motion. Для focus/ready использовать более короткий standard/effects
transition; для idle не переиспользовать `900 ms` loop — это будет заметное
пульсирование, а не ambient motion
([Material Components: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)).

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
