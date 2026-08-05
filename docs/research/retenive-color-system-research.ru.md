# Retenive: исследование семантической цветовой системы

Дата: 5 августа 2026 года.  
Статус: принятая палитра Retenive; семантические токены и PrimeVue preset внедрены в production-код.

## Решение

Для Retenive следует построить не набор «синих вместо фиолетовых», а две
самостоятельно проверяемые семантические темы с cobalt-blue как цветом
основного действия. Токены должны описывать роль (`action-primary`,
`text-secondary`, `surface-raised`), а не цвет (`blue-600`). Исходная шкала
cobalt, нейтрали и шкалы статусов живут только внутри темы; компоненты получают
только семантические токены.

WCAG не предписывает конкретный оттенок cobalt и не даёт «правильную» палитру.
Поэтому финальные значения нужно выбирать как пары и проверять в реальном
отрисованном контексте обеих тем, а не утверждать по отдельным swatch.

Целевой нормативный уровень — WCAG 2.2 AA. Для focus ring принять более
строгую внутреннюю цель из AAA, поскольку она устраняет типичную проблему
слабого фокуса на заполненных кнопках.

## Нормативные пороги и правила

- Обычный текст, включая текст на filled-кнопке, badge и status banner: не
  меньше **4.5:1** с непосредственно лежащим под ним фоном. Крупный текст
  (от ~24 px regular или ~18.5 px bold) может иметь 3:1, но не должен быть
  обходом для служебной UI-копии. [WCAG 2.2, SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum).
- Рекомендуемая цель для `text-primary` и длинного текста — **7:1**: это
  уровень AAA для обычного текста, не обязательный минимум AA.
  [WCAG 2.2, SC 1.4.6](https://www.w3.org/TR/WCAG22/#contrast-enhanced).
- Граница input, checkbox/radio state, понятная иконка, графическая линия
  и другой UI-элемент, требуемый для понимания, — не меньше **3:1** с
  прилегающим цветом. Это относится и к значимым объектам графика.
  [WCAG 2.2, SC 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast).
- Не передавать смысл одним цветом: статусу нужны текст, иконка, форма,
  подпись либо паттерн; selected/invalid/success не должны определяться только
  hue. [WCAG 2.2, SC 1.4.1](https://www.w3.org/TR/WCAG22/#use-of-color).
- `focus-visible` — не тонкая тень: проектная цель — сплошной периметр не
  уже 2 CSS px и 3:1 между focused/unfocused состояниями. Это критерий AAA
  SC 2.4.13; минимальный AA всё равно требует различимый фокус.
  [WCAG 2.2, SC 2.4.13](https://www.w3.org/TR/WCAG22/#focus-appearance).
- Контраст считают без округления по sRGB-формуле W3C; pass только при
  фактическом значении не ниже порога. Для градиента и полупрозрачного слоя
  сравнивают итоговый отрисованный цвет в наихудшей точке рядом с текстом или
  иконкой. [W3C Technique G18](https://www.w3.org/WAI/WCAG21/Techniques/general/G18),
  [W3C Technique G207](https://www.w3.org/WAI/WCAG21/Techniques/general/G207).

APCA не использовать как критерий приёмки этой работы: WCAG 3 остаётся
неполным рабочим черновиком, требования и модель соответствия могут
существенно измениться. Для проверяемого релиза базой остаётся WCAG 2.2.
[Статус WCAG 3 у W3C](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/).

## Семантические токены и обязательные пары

Каждая строка — отдельная тестируемая пара, а не обещание, что один hex
подойдёт для всех ролей. `Light` и `Dark` — разные значения одного токена,
а не CSS-инверсия.

| Группа токенов | Что определить на обе темы | Что проверять |
| --- | --- | --- |
| Холст и поверхности | `surface-canvas`, `surface-card`, `surface-raised`, `surface-subtle`, `surface-hover`, `surface-selected`, `surface-disabled` | `text-primary/secondary/tertiary` на каждой поверхности, разделение соседних поверхностей и border 3:1 там, где border нужен для распознавания control |
| Текст | `text-primary`, `text-secondary`, `text-tertiary`, `text-disabled`, `text-link`, `text-on-action-primary`, `text-on-status-*` | 4.5:1 для информационного текста; отключённые контролы исключены из SC 1.4.3, но должны оставаться визуально отличимыми без подражания ошибке |
| Cobalt-действия | `action-primary`, `action-primary-hover`, `action-primary-active`, `action-primary-disabled`, `action-primary-subtle`, `on-action-primary` | label/icon на каждом filled-state; `subtle` не считать action только по синему — добавить label, underline, border или состояние |
| Поля и выбор | `control-background`, `control-border`, `control-border-hover`, `control-border-invalid`, `control-selected`, `control-indicator`, `focus-ring` | border/control-indicator 3:1 к соседнему фону, mark checkbox/radio 3:1 к внутренней заливке, focus по целевому правилу 2px/3:1 |
| Границы и overlay | `border-subtle/default/strong`, `backdrop`, `shadow-*`, `scrim-*` | dialog/drawer отделён от слоя под ним; текст никогда не кладётся на непроверенный прозрачный backdrop или декоративную тень |
| Статусы | `status-{success,warning,danger,info}-{fill,subtle,border,text,on-fill,icon}` | текст/иконка к локальному fill; статус распознаётся также лейблом и иконкой. Cobalt не использовать для success, чтобы основной action не стал смыслом «успех» |
| Данные и графики | `chart-grid`, `chart-axis`, `chart-label`, `chart-tooltip-*`, `chart-series-1…n`, `chart-series-pattern-*` | label/axis/tooltip как текст; grid, линии и точки — 3:1 к canvas, когда нужны для прочтения; серии различать также лейблом, marker/line-style/pattern, а не только цветом |
| Специальные поверхности | `sidebar-*`, `code-*`, `skeleton-*`, `graph-canvas/node/edge/selection`, `ai-*` | отдельная матрица, потому что стабильный тёмный sidebar, code block, Vue Flow и график не наследуют обычные card-пары автоматически |

`text-tertiary` допустим только там, где текст не несёт единственной важной
информации; для placeholder, helper, timestamps и table metadata всё равно
лучше проектировать 4.5:1, а не полагаться на бледный цвет. Текст на gradient
или изображении кладётся на непрозрачную/предсказуемую подложку либо
проверяется в каждой возможной точке: W3C прямо указывает, что один цвет текста
не сможет гарантировать контраст на фоне, переходящем от светлого к тёмному.
[W3C Technique G18](https://www.w3.org/WAI/WCAG21/Techniques/general/G18).

## Предложенная палитра Retenive

Это готовая исходная палитра для реализации. Указанные коэффициенты рассчитаны
по sRGB WCAG для конкретных foreground/background пар; все текстовые пары ниже
проходят AA, а control-border и focus — порог для non-text contrast.

### Примитивы

| Шкала cobalt | Значение |
| --- | --- |
| `blue-50/100/200` | `#EFF6FF` / `#DBEAFE` / `#BFDBFE` |
| `blue-300/400/500` | `#93C5FD` / `#60A5FA` / `#3B82F6` |
| `blue-600/700/800` | `#2563EB` / `#1D4ED8` / `#1E40AF` |
| `blue-900/950` | `#1E3A8A` / `#172554` |

Лайм `#D7FF64` остаётся вторичным brand/AI-акцентом, а не цветом обычной
текстовой copy или primary button. Нейтрали переходят от оливковых к холодным
slate: `#F8FAFC`, `#F1F5F9`, `#E2E8F0`, `#CBD5E1`, `#94A3B8`, `#64748B`,
`#475569`, `#334155`, `#1E293B`, `#0F172A`.

### Контракт светлой темы

| Роль | Tokens: foreground на background | Контраст |
| --- | --- | --- |
| Основной, вторичный, третичный текст | `#0F172A`, `#475569`, `#64748B` на `#FFFFFF` | 17.85:1 / 7.58:1 / 4.76:1 |
| Primary button: normal / hover / active | `#FFFFFF` на `#2563EB` / `#1D4ED8` / `#1E40AF` | 5.17:1 / 6.70:1 / 8.72:1 |
| Selected/tag/link | `#1D4ED8` на `#EFF6FF` | 6.16:1 |
| Input border | `#64748B` на `#FFFFFF` | 4.76:1 |
| Success fill / soft | `#FFFFFF` на `#15803D`; `#166534` на `#F0FDF4` | 5.02:1 / 6.81:1 |
| Warning fill / soft | `#FFFFFF` на `#B45309`; `#78350F` на `#FFFBEB` | 5.02:1 / 8.75:1 |
| Danger fill / soft | `#FFFFFF` на `#DC2626`; `#991B1B` на `#FEF2F2` | 4.83:1 / 7.60:1 |
| Info fill / soft | `#FFFFFF` на `#0E7490`; `#155E75` на `#ECFEFF` | 5.36:1 / 6.99:1 |

`surface-canvas` = `#F8FAFC`, `surface-card`/`surface-raised` = `#FFFFFF`,
`surface-subtle` = `#F1F5F9`, `surface-hover` = `#E2E8F0`,
`surface-selected` = `#EFF6FF`. `border-subtle` применяется только как
декоративный разделитель; любой border, по которому пользователь должен
распознать control, использует `control-border` выше.

### Контракт тёмной темы

| Роль | Tokens: foreground на background | Контраст |
| --- | --- | --- |
| Основной, вторичный, третичный текст | `#F8FAFC`, `#CBD5E1`, `#94A3B8` на `#111827` | 16.96:1 / 11.95:1 / 6.92:1 |
| Primary button: normal / hover / active | `#0F172A` на `#60A5FA` / `#93C5FD` / `#3B82F6` | 7.02:1 / 9.90:1 / 4.85:1 |
| Selected/tag/link | `#BFDBFE` на `#172554` | 10.34:1 |
| Input border | `#94A3B8` на `#111827` | 6.92:1 |
| Success fill / soft | `#052E16` на `#4ADE80`; `#BBF7D0` на `#052E16` | 8.55:1 / 12.30:1 |
| Warning fill / soft | `#451A03` на `#FBBF24`; `#FDE68A` на `#451A03` | 8.97:1 / 12.03:1 |
| Danger fill / soft | `#450A0A` на `#F87171`; `#FECACA` на `#450A0A` | 5.84:1 / 11.16:1 |
| Info fill / soft | `#083344` на `#67E8F9`; `#A5F3FC` на `#083344` | 9.24:1 / 10.74:1 |

`surface-canvas` = `#0B1220`, `surface-card` = `#111827`,
`surface-raised` = `#172033`, `surface-subtle` = `#1E293B`,
`surface-hover` = `#26354A`, `surface-selected` = `#172554`.

### Focus, sidebar, AI и графики

- Focus — два непрозрачных кольца: light `#FFFFFF` внутри и `#1D4ED8` снаружи;
  dark `#0F172A` внутри и `#93C5FD` снаружи. Их контраст с filled primary и
  ближайшей surface соответственно 5.17:1/6.70:1 и 7.02:1/9.84:1.
- Sidebar остаётся тёмной в обеих темах: `#0B1220` background, `#CBD5E1`
  normal text, `#EFF6FF` active fill, `#0F172A` active text. Счётчик использует
  `on-action-primary`, а не несуществующий `text-on-primary`.
- AI-секции используют cobalt + lime только в декоративном halo/gradient;
  любая copy находится на непрозрачной `ai-surface` (`#111827` в dark,
  `#FFFFFF` в light), а не на самом gradient.
- Графики: `blue #2563EB/#60A5FA`, teal `#0F766E/#5EEAD4`, amber
  `#B45309/#FBBF24`, red `#DC2626/#F87171`, magenta `#A21CAF/#F0ABFC`,
  green `#15803D/#4ADE80`. Для серий дополнительно обязательны marker,
  line-style/pattern и legend; цвет сам по себе не передаёт смысл.

## Правила для light и dark

1. В светлой теме cobalt должен быть достаточно тёмным для белого текста на
   `action-primary`; если это невозможно, использовать тёмный `on-action-primary`,
   но проверять пару как текст. В тёмной теме не переносить этот же cobalt
   без проверки: обычно нужен более светлый action-fill или отдельная тёмная
   заливка, чтобы сохранить различимость с dark surface и контраст label.
2. Для каждой темы создавать минимум три нейтральные поверхности: canvas,
   card, raised/overlay. Их различимость нельзя обеспечивать только shadow:
   при необходимости применить border с 3:1 к прилегающей поверхности.
3. `focus-ring` проверять отдельно на canvas, card, filled cobalt action,
   danger/warning fill и selected navigation. Один синий ring почти наверняка
   не даст требуемую разницу на всех этих фонах; допускается двухслойный ring
   через семантические `focus-outer`/`focus-inner`.
4. Lime остаётся ограниченным вторичным AI/brand accent: не использовать его
   как мелкий текст на светлой поверхности и не назначать ему success-смысл.
   Проверять его как полноценную foreground/background пару.
5. Hover/selected/invalid не должны существовать только как изменение цвета:
   active navigation получает fill + вес текста/иконку/aria-current, invalid
   field — текст ошибки + иконку/связь с control, chart series — legend и
   marker/pattern.

## Матрица приёмки палитры

Перед утверждением каждого color token выполнить её для `light` и `dark`:

| Проверка | Минимум | Примеры |
| --- | --- | --- |
| Основная copy | 4.5:1, цель 7:1 | `text-primary`/canvas, card, raised, sidebar |
| Вторичная copy и link | 4.5:1 | `text-secondary`/card; link/ближайшая surface, в normal/visited/focus |
| Filled actions | 4.5:1 для label и значимой icon | `on-action-primary`/primary, hover, active; `on-danger`/danger |
| Обводка/иконки/control state | 3:1 | input border, checkbox check, selected tab, non-decorative icon |
| Focus | внутренняя цель: 2 px perimeter + 3:1 state change | button, icon button, text input, checkbox, table row, sidebar item |
| Статусы | 4.5:1 text, 3:1 icon/border + нецветовой сигнал | success/info/warning/danger banner, tag, toast, validation |
| Chart/data | 4.5:1 labels, 3:1 нужная geometry + независимый канал | line/bar/pie, selected point, tooltip, legend |
| Gradient/alpha | порог в худшей фактической точке | hero/AI glow, overlay, chart gradient, icon/text над ними |

Проверять также normal, hover, active, selected, focus-visible, disabled,
loading, invalid и forced error state; визуальные скриншоты нужны как минимум
для sidebar, forms, таблиц, тэгов, dialog/drawer, AI-блока и основных графиков.
WCAG 2.2 также требует, чтобы текст масштабировался до 200% без потери
контента/функциональности; это важно для плотных экранов CMS.
[WCAG 2.2, SC 1.4.4](https://www.w3.org/TR/WCAG22/#resize-text).

## Источники

- [Web Content Accessibility Guidelines (WCAG) 2.2 — W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [Understanding SC 1.4.3: Contrast (Minimum) — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Understanding SC 1.4.11: Non-text Contrast — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Understanding SC 2.4.13: Focus Appearance — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [Technique G18 — W3C WAI](https://www.w3.org/WAI/WCAG21/Techniques/general/G18)
- [Technique G207 — W3C WAI](https://www.w3.org/WAI/WCAG21/Techniques/general/G207)
