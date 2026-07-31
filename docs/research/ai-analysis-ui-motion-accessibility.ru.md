# AI-интерфейс Lola: иерархия, темы, glow-анимация и mobile

Дата исследования: 1 августа 2026 года.

## Задача и границы

Сформировать проверяемые рекомендации для экранов `AI-анализы`,
`Журнал AI-операций` и блока создания запроса «Что нужно узнать о проекте?».
Фокус исследования:

- единая визуальная иерархия вместо смеси слишком крупного и слишком мелкого;
- читаемость светлой и тёмной тем;
- заметный, но не декоративный AI/glow-паттерн;
- производительная CSS-анимация во Vue;
- `prefers-reduced-motion`, WCAG-контраст и touch targets;
- поведение карточек, фильтров и master-detail на мобильных ширинах.

Использованы только первичные источники: W3C/WAI, официальная документация
Vue и MDN, Chrome/web.dev и IBM Carbon. Точные размеры, длительности и
композиция Lola ниже — выводы для этого продукта, а не требования этих
источников.

## Короткий вывод

1. **Сделать AI-блок главным управляемым объектом, а не большим тёмным баннером.**
   Заголовок, объяснение, textarea и действие образуют один компактный
   composer. AI-присутствие обозначают постоянная метка «ИИ» и локальная
   подсветка края; свечение не должно проходить под текстом.
2. **Анимировать только отдельный aura-слой через `opacity` и `transform`.**
   Gradient и blur могут быть статическими свойствами псевдоэлемента, но их
   величины не меняются в keyframes. Intro-анимация конечная; бесконечного
   «дыхания» всей карточки нет.
3. **Светлая и тёмная темы получают разные AI-токены.** Lime остаётся акцентом,
   но не используется как мелкий текст на белом. Текст и controls всегда лежат
   на стабильной непрозрачной поверхности с проверенным контрастом.
4. **Вернуть UI к устойчивой шкале.** Page title остаётся крупным, но controls,
   значения карточек и служебный текст не опускаются до визуально исчезающих
   10–12 px. Для мобильного composer textarea и основные controls — 16 px,
   touch-области — 44–48 px.
5. **Master-detail не должен сжимать две полноценные карточки рядом.** На
   широком экране слева нужен компактный список, справа detail. На меньших
   ширинах detail становится отдельным полноширинным состоянием; на телефоне
   фильтры сворачиваются и весь контент идёт одной колонкой.

## Что подтверждено в текущем коде

- В `AICommandComposer.vue` одновременно используются `0.63rem`, `0.64rem`,
  `0.76rem`, `0.85rem` и заголовок `1.35rem`. На скриншотах это превращает
  shortcut, счётчик, eyebrow и пояснение в слабый визуальный шум рядом с
  крупным заголовком.
- Composer уже имеет правильную семантическую основу: `section`, связанный
  `aria-labelledby`, label textarea, character count, `aria-busy` и live status.
  Новый визуальный слой не должен менять DOM-порядок или становиться доступным
  для screen reader.
- Текущий фон composer сочетает radial/linear gradients, но не объясняет
  состояние и не создаёт отчётливую AI-границу. Carbon рекомендует использовать
  glow/gradient как сигнал реального AI-присутствия, не как украшение, и держать
  spread по краям контейнера ограниченным ради читаемости
  ([Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/)).
- Глобальный `prefers-reduced-motion` уже сокращает все duration до `.01ms`.
  Это хорошая страховка, но для нового ambient-слоя лучше явный локальный
  контракт `animation: none`: он проще проверяется и не оставляет случайный
  первый/последний кадр.
- `AIAnalysesPage.vue` и `AIOperationsPage.vue` уже переходят к одной колонке и
  скрывают list при открытом detail на узком экране. Проблема остаётся на
  промежуточной ширине: две насыщенные карточки получают узкие колонки и
  обрезанные значения, как на приложенном master-detail скриншоте.

## Рекомендуемая композиция

### Блок вопроса к Lola

```text
┌ ИИ · LOLA ANALYSIS ───────────────────────────────────────────────┐
│ Что нужно узнать о проекте?                                      │
│ Lola использует только разрешённые источники…                    │
│                                                                  │
│ ┌ Запрос ──────────────────────────────────────────────────────┐ │
│ │ Например: кто завершил депозит вчера…                       │ │
│ │                                                             │ │
│ │ 0 / 10 000                 Ctrl/⌘ + Enter  [Спросить Lola]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
   ^ тонкая AI-border + ограниченная aura только по краям
```

- На desktop оставить информационный блок и форму в двух колонках только когда
  у пояснения остаётся нормальная строка, а textarea не уже примерно 520 px.
  Ниже этого порога — одна колонка.
- Метка `ИИ` является постоянным текстовым индикатором. Sparkle и glow —
  усиление, но не единственный способ понять, что действие выполняет AI.
  Carbon прямо называет AI label основным индикатором и путём к explainability
  ([Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/),
  [Carbon AI label](https://carbondesignsystem.com/components/ai-label/usage/)).
- Aura не накрывает textarea и текст. Форма остаётся непрозрачной raised-surface
  в обеих темах. Для текста на градиенте контраст нужно проверять в каждой
  точке, где он может оказаться; движущийся фон делает такую гарантию хрупкой
  ([Carbon accessibility: color](https://v10.carbondesignsystem.com/guidelines/accessibility/color/)).
- При `busy` менять не всю геометрию карточки, а статус: подпись
  «Lola анализирует», `aria-busy`, live-status и небольшой индикатор рядом с
  label. Завершение и ошибка остаются текстовыми состояниями.

### Страницы списка

- Заголовок страницы: 32–42 px desktop, 28–34 px mobile; subtitle 15–16 px.
- Card title: 16–18 px; описание и значения: 14–15 px; uppercase labels и
  secondary metadata: 12–13 px с достаточным line-height. Это предлагаемая
  шкала Lola: WCAG задаёт контраст, а не минимальный font-size.
- В карточке сначала показывать человекочитаемые поля: статус, вопрос,
  завершение, стоимость. UUID и provenance — вторичный раскрываемый/копируемый
  слой. Нельзя пытаться уместить семь одинаково важных колонок.
- Для выбранного элемента:
  - `>= 1280 px`: компактная summary-карточка/список слева, detail справа;
  - `768–1279 px`: detail полноширинно над списком либо отдельным состоянием;
  - `< 768 px`: detail как отдельная страница/панель с явной кнопкой «Назад».
- Фильтры: 3–4 колонки только на широком экране, 2 на среднем, 1 на телефоне.
  На телефоне по умолчанию показывать кнопку `Фильтры` с числом активных
  условий; раскрытая форма остаётся в DOM-потоке, а не перекрывает результаты.

## AI glow и motion-контракт

Carbon for AI использует brightness, glow и gradients как метафору света, но
требует применять их только там, где реально присутствует AI; light spread
ограничивается краями контейнера для сохранения контраста
([Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/)). Для
Lola это означает один сильный AI-composer и сдержанные AI labels в результатах,
а не glow на каждой обычной карточке.

### Предлагаемая анимация

- **Покой:** статичная тонкая gradient-border и слабая aura в двух углах.
- **Первое появление:** один цикл `opacity 0 → .55 → .30` и
  `transform: translate3d(...) scale(...)`, суммарно 1.2–2.4 s.
- **Focus-within:** быстрый переход 160–220 ms — немного выше opacity и чётче
  border. Геометрия не меняется.
- **Submit:** конечная 2–3-цикловая подсветка до 4.5 s, затем статичный busy
  state. Длительное состояние сообщается текстом, а не постоянным движением.
- **Success/error:** короткий fade/translate статуса через Vue `<Transition>`;
  не пульсировать всей карточкой.

Точные длительности — продуктовая рекомендация. Ограничение до пяти секунд
избегает требования отдельного pause/stop/hide для автоматически начавшегося
движения рядом с другим контентом. WCAG требует такой механизм, если движение
идёт дольше пяти секунд и не является essential
([W3C SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)).

### Производительная реализация

```css
.ai-composer {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.ai-composer::before {
  content: "";
  position: absolute;
  inset: -18%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 24%, var(--ai-aura-lime), transparent 36%),
    radial-gradient(circle at 82% 72%, var(--ai-aura-violet), transparent 38%);
  filter: blur(28px); /* статичное значение */
  opacity: .30;
  transform: translate3d(0, 0, 0) scale(1);
}

.ai-composer.is-intro::before {
  animation: ai-aura-intro 1800ms ease-out both;
}

@keyframes ai-aura-intro {
  0%   { opacity: 0;   transform: translate3d(-2%, 1%, 0) scale(.98); }
  55%  { opacity: .55; transform: translate3d(1%, -1%, 0) scale(1.02); }
  100% { opacity: .30; transform: translate3d(0, 0, 0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-composer::before {
    animation: none;
    transform: none;
  }
}
```

Почему так:

- Vue и web.dev рекомендуют `transform` и `opacity`: они не меняют layout и
  обычно могут быть обработаны compositor-ом. `height`, `margin` и другие
  layout-свойства дороже
  ([Vue Transition](https://vuejs.org/guide/built-ins/transition.html),
  [web.dev: high-performance CSS animations](https://web.dev/articles/animations-guide)).
- Blur и тени требуют дорогой отрисовки. Chrome рекомендует не анимировать
  radius blur, а подготовить размытую поверхность и cross-fade её через opacity
  ([Chrome Developers: Animating a blur](https://developer.chrome.com/blog/animated-blur),
  [web.dev animations guide](https://web.dev/articles/animations-guide)).
- Не анимировать `background-position`, `box-shadow`, `filter`, `border-width`,
  `width/height`, `padding/margin`, `top/left` или grid/flex-размеры.
- `will-change` не добавлять глобально и «на всякий случай». MDN рекомендует
  использовать его как крайнюю меру, точечно и временно: избыток удерживает
  слои в памяти и может ухудшить производительность
  ([MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)).
- Не подключать motion-библиотеку ради одного aura и enter/leave. Vue
  `<Transition>` плюс CSS достаточно; официальный Vue performance guide
  рекомендует осторожно относиться к новым зависимостям из-за bundle size
  ([Vue performance](https://vuejs.org/guide/best-practices/performance)).

## Reduced motion

`prefers-reduced-motion: reduce` означает просьбу убрать, сократить или заменить
необязательное движение. Особенно нежелательны масштабирование и панорамирование
крупных областей
([MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion),
[W3C SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).

Контракт Lola:

- aura остаётся статичной: AI-присутствие не исчезает вместе с motion;
- enter/leave превращается в мгновенную смену либо короткий opacity-only fade;
- никакого auto-pulse, shimmer или scale;
- loading/success/error по-прежнему читаются текстом и через live region;
- если позже появится JS-driven animation, Vue composable должен использовать
  `matchMedia('(prefers-reduced-motion: reduce)')`, слушать `change` и очищать
  listener/таймеры в `onBeforeUnmount`.

## Светлая и тёмная темы

### Токены

Не смешивать glow с общими status/action tokens. Добавить отдельные роли:

```css
--ai-surface;
--ai-surface-raised;
--ai-border-start;
--ai-border-end;
--ai-aura-lime;
--ai-aura-violet;
--ai-label;
--ai-focus;
```

У каждой темы свои значения, назначение остаётся тем же. `color-scheme` должен
соответствовать активной теме, чтобы browser-provided controls также были
правильными
([MDN: color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme),
[MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)).

### Контраст

- Обычный текст и placeholder: минимум `4.5:1` к фону; крупный текст — `3:1`
  ([W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)).
- Видимые границы полей, иконки, select chevron, status/focus indicators:
  минимум `3:1` относительно соседнего цвета
  ([W3C SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- В gradient-border проверять участок с наименьшим контрастом. Сам glow не
  может быть единственной границей поля или focus-индикатором.
- Lime на светлом фоне использовать как заливку с тёмным `--on-brand`,
  декоративную aura или крупный графический акцент. Для мелких ссылок/eyebrow
  выбирать более тёмный `--text-brand` или violet link token.
- В dark theme не делать всё одной чёрно-зелёной плоскостью: canvas, card,
  raised composer input и filters должны иметь различимые поверхности плюс
  границы. Тень сама по себе не отделяет слои.
- Статусы всегда имеют текст/иконку, а не только зелёный, оранжевый или glow.

## Mobile и touch

WCAG AA требует target не меньше `24 × 24 CSS px` либо достаточный интервал;
усиленный ориентир — `44 × 44 CSS px`
([W3C SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
[W3C SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)).
Для Lola принять 44 px как внутренний минимум, 48 px — для основных кнопок и
полей на телефоне.

### Правила

- `Спросить Lola`, `Применить`, `Обновить`, close/back, date picker,
  select-chevron, copy ID и icon-only actions получают реальную кликабельную
  область 44–48 px, даже если иконка визуально 16–20 px.
- При `<= 600 px` composer: padding 16 px, heading/form/actions в одну колонку,
  textarea `font-size: 16px`, primary action полноширинный, shortcut скрыт, но
  character count остаётся.
- Header actions переносятся в две равные кнопки либо вертикально; они не должны
  уезжать вправо и создавать viewport overflow.
- Metadata-карточка: одна колонка; пары label/value не разбиваются между
  колонками. Длинный ID переносится или сокращается вместе с доступной кнопкой
  копирования, но не обрезает соседнее поле.
- Filter panel и detail не используют fixed width. Любая двухмерная прокрутка
  ограничена только действительно табличным участком, а не всей страницей.
- Проверить reflow на эквиваленте 320 CSS px без потери информации и функций и
  без горизонтальной прокрутки страницы
  ([W3C SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Матрица проверки

### Viewports и состояния

| Viewport | Обязательные состояния |
| --- | --- |
| 1440 × 900 | list, filters open, selected detail, long Russian title/UUID |
| 1024 × 768 | selected detail без сжатия двух полных карточек |
| 768 × 1024 | single-column composer, filters, detail |
| 390 × 844 | idle, typing, busy, success, error, filters open |
| 360 × 800 | те же состояния + long values |
| 320 × 568 | reflow, keyboard focus, no page-level horizontal scroll |

В каждой точке проверить light/dark и `prefers-reduced-motion: reduce`.

### Acceptance criteria

- Нет текста, placeholder или essential icon ниже WCAG-контраста в обеих темах.
- Focus виден на всех controls и имеет `3:1` к соседней поверхности.
- Glow расположен только по краям, не снижает контраст текста и не является
  единственным AI-индикатором.
- После завершения intro-анимации Chrome Paint Flashing не показывает
  постоянную перерисовку composer. Во время motion меняются только
  `transform/opacity` aura-слоя.
- В reduced motion aura статична; submit, loading и result остаются полностью
  понятны.
- На 320 px доступны фильтры, карточки, detail и все действия; страница не
  требует горизонтальной прокрутки.
- Все основные и icon-only mobile targets имеют не меньше 44 px в обеих осях.
- Открытие detail не оставляет рядом обрезанную полноценную карточку списка.

## Источники

- [IBM Carbon: Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/)
- [IBM Carbon: AI label usage](https://carbondesignsystem.com/components/ai-label/usage/)
- [IBM Carbon: accessibility and color](https://v10.carbondesignsystem.com/guidelines/accessibility/color/)
- [Vue: Transition](https://vuejs.org/guide/built-ins/transition.html)
- [Vue: Performance](https://vuejs.org/guide/best-practices/performance)
- [web.dev: How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- [Chrome Developers: Animating a blur](https://developer.chrome.com/blog/animated-blur)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- [MDN: color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme)
- [W3C: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
- [W3C: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [W3C: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- [W3C: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
- [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
