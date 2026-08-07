# Support Workspace: discovery полноэкранного режима вкладки

Статус: обязательное решение для F0
Дата: 7 августа 2026 года
Область: кнопка `На весь экран / Свернуть`, full-tab shell, анимация,
scroll/focus ownership и визуальная приёмка

## 1. Решение

Кнопка должна переключать представление рабочего места, а не вызывать
встроенный `maximizable` у PrimeVue Dialog.

В развёрнутом состоянии workspace занимает ровно видимую область вкладки:

```text
left = 0
top = 0
width = document.documentElement.clientWidth
height = window.visualViewport?.height ?? document.documentElement.clientHeight
margin = 0
border / radius / outer shadow = 0
background scroll delta = 0
```

Под этим режимом не видны CMS sidebar, исходная страница, backdrop или пустой
внешний canvas. Внутри остаются три полезные области: inbox, Conversation и
inspector. Прокручиваются они, а не `body`.

Browser Fullscreen API здесь не используется. Он скрывает интерфейс браузера,
требует user activation и может быть в любой момент отменён браузером или
пользователем. Задача кнопки другая: занять вкладку и сохранить обычные browser
navigation, tabs и системные жесты.

## 2. Почему текущее состояние не принимается

На приложенном скриншоте компонент уже показывает действие `Свернуть`, то есть
PrimeVue считает Dialog maximized. Визуально это всё ещё плавающая карточка:

- слева виден старый CMS sidebar и содержимое страницы под workspace;
- сверху остаётся внешний слой CMS с отдельными controls;
- у белой поверхности есть отступы, radius, border и dialog shadow;
- рабочая сетка заканчивается раньше правой границы вкладки, справа остаётся
  большой пустой canvas;
- inbox обрезает длинные названия, в центре слишком много пустоты, а inspector
  не использует доступную ширину;
- визуальная модель говорит «модалка поверх Users», хотя оператору нужен
  самостоятельный рабочий режим.

Причины видны в коде:

- [`UserWorkspaceDialog.vue`](../../../src/features/end-user-workspace/UserWorkspaceDialog.vue)
  задаёт Dialog `modal`, `block-scroll`, `maximizable` и ограничивает размер
  через `min(..., 100vw - 32px)` / `min(..., 100dvh - 32px)`;
- локальный selector `.user-workspace-dialog.p-dialog` возвращает radius `20px`,
  border и shadow даже при maximized-состоянии;
- высота `.workspace-grid` отдельно ограничена `min(760px, 100dvh - 170px)`;
- PrimeVue maximized style использует `100vw × 100vh`. `100vw` может включить
  scrollbar gutter, а `100vh` плохо отражает меняющийся mobile viewport;
- PrimeVue уже блокирует `body`, но компонент параллельно переключает
  `workspace-scroll-locked`. У вложенных overlays нет одного владельца lock;
- тест проверяет только наличие body class. Он не доказывает геометрию,
  сохранение `scrollY`, отсутствие scroll chaining, focus lifecycle или
  поведение экранной клавиатуры.

Исправление пары CSS selectors сделает скриншот ровнее, но оставит неправильную
модель. Нужен отдельный presentation shell.

## 3. Два входа, один workspace

Целевой UI использует один `ConversationSurface`; полноэкранный режим меняет
только оболочку.

```text
Users/Profile quick launcher
  ├─ windowed UserWorkspaceDialog ─┐
  └─ кнопка «На весь экран»        ├─ FullViewportWorkspaceShell
                                   │             │
/support/* route ──────────────────┘             ├─ inbox
                                                 ├─ ConversationSurface
                                                 └─ inspector
```

### Переходный вход из Users/Profile

1. Quick launcher может открыться как компактный Dialog.
2. `На весь экран` переносит тот же workspace subtree в full-viewport shell.
3. Selection, draft, message anchor, translation mode, active inspector tab,
   filters и загруженные данные не сбрасываются и не запрашиваются заново.
4. `Свернуть` возвращает прежний windowed rect и focus на ту же кнопку.
5. `Закрыть` закрывает workspace и возвращает focus на исходный launcher.

Нельзя одновременно держать две смонтированные копии Conversation и
синхронизировать их через watchers. Для переноса presentation layer подходит
один стабильный controller/store и один Surface instance либо state-preserving
shell swap с доказанным отсутствием повторной загрузки и потери DOM anchors.

### Основной `/support/*` route

Support сразу открывается в `FullViewportWorkspaceShell`. Это не modal: у него
нет backdrop, `aria-modal` и focus trap всей страницы. Route-level shell
получает `layout: support-focus`, поэтому обычный широкий CMS layout не
монтируется за ним.

В route mode кнопка `Свернуть` не возвращает оператора к случайной фоновой
странице. На первом этапе её можно скрыть. Если продукту нужен compact mode,
он проектируется отдельно с понятным destination и browser history, а не
наследуется от Dialog.

## 4. Контракт presentation shell

Предлагаемая граница модуля:

```text
features/support-workspace/presentation/
├─ FullViewportWorkspaceShell.vue
├─ WindowedWorkspaceShell.vue
├─ useWorkspacePresentation.ts
├─ useRootScrollLock.ts
└─ workspace-motion.css
```

`useWorkspacePresentation` хранит только UI state:

```ts
type WorkspacePresentationMode = "windowed" | "full-tab" | "route";

interface WorkspacePresentationController {
  mode: Readonly<Ref<WorkspacePresentationMode>>;
  expand(): void;
  collapse(): void;
  close(): void;
  isTransitioning: Readonly<Ref<boolean>>;
}
```

Conversation/Case domain state сюда не попадает. Shell получает готовые
capabilities и layout regions; он не рисует message bubble, translation toggle
или composer.

### Геометрия

```css
.full-viewport-workspace {
  position: fixed;
  z-index: var(--z-workspace-full-tab);
  inset: 0;
  width: auto;
  height: 100vh;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--surface-canvas);
  box-shadow: none;
  padding: env(safe-area-inset-top, 0)
           env(safe-area-inset-right, 0)
           env(safe-area-inset-bottom, 0)
           env(safe-area-inset-left, 0);
}
```

Используется `inset: 0`, а не `width: 100vw`: так shell не захватывает лишнюю
ширину scrollbar gutter. `100vh` остаётся fallback, затем его перекрывает
`100dvh`. Все промежуточные flex/grid children получают `min-width: 0` и
`min-height: 0`.

### Scroll ownership

- full-tab shell и `body` не прокручиваются;
- inbox list, message history и inspector content имеют отдельный
  `overflow: auto`;
- `overscroll-behavior: contain` не даёт колесу/touch передать прокрутку фону
  или соседней панели на границе списка;
- header и composer закреплены внутри Conversation column; history занимает
  остаток через flex/grid, а не вычисляемую высоту `calc(100dvh - Npx)`;
- desktop scroll owners используют `scrollbar-gutter: stable`, если появление
  classic scrollbar двигает содержимое;
- открытие, сворачивание и закрытие сохраняет document `scrollY` и внутренние
  позиции панелей.

Для full-tab overlay из Users background становится `inert`, а один
reference-counted scroll-lock владеет root scroller. Он сохраняет scroll
position и inline styles, компенсирует scrollbar и снимается только после
закрытия последнего modal/full-tab overlay. Нельзя одновременно использовать
PrimeVue `block-scroll` и собственный class.

Route mode не нуждается в modal lock: у страницы изначально нет document
scroll, потому что AppShell отдаёт viewport Support shell.

### Mobile keyboard

Базовый механизм: `100dvh`, column flex, `min-height: 0` и отдельный message
scroll. `VisualViewport` подключается только после воспроизводимого browser
defect. Тогда `resize`/`scroll` обновляют одну CSS custom property; listeners
снимаются при unmount. Composer учитывает `safe-area-inset-bottom`.

## 5. Кнопка и состояния

| Состояние | Label | Accessible state | Действие |
| --- | --- | --- | --- |
| windowed | `На весь экран` | `aria-label="Развернуть рабочее место на всю вкладку"` | открыть full-tab shell |
| full-tab | `Свернуть` | `aria-label="Вернуть рабочее место в окно"` | восстановить windowed rect |
| transition | тот же label | `disabled`, `aria-busy` на shell | повторный click игнорируется |
| route | control скрыт либо имеет отдельный согласованный compact destination | не притворяется dialog toggle | route policy |

Кнопка имеет icon + видимый текст на desktop. На узкой ширине текст можно
скрыть, но accessible name остаётся. Tooltip не заменяет label. Состояние можно
передать через `aria-pressed`, если control остаётся настоящей toggle button;
иначе достаточно меняющегося accessible name.

`Свернуть` и `Закрыть` — разные действия. Их нельзя объединять в один `X`.

## 6. Анимация

Цель анимации — показать непрерывность контекста, не заставлять браузер
пересчитывать огромную сетку на каждом frame.

### Windowed → full-tab

1. До смены режима снять `getBoundingClientRect()` windowed shell.
2. Смонтировать full-tab shell в конечной геометрии.
3. Применить inverse transform от старого rect к viewport (FLIP).
4. За `220–260ms` анимировать только `transform` и `opacity` к `none / 1`.
5. После `transitionend` убрать temporary styles и `will-change`.

Рекомендованная кривая: `cubic-bezier(.2, .8, .2, 1)`. Начальный scale не
должен быть меньше `.985`; крупное масштабирование всей переписки визуально
дёргает текст. Border radius можно интерполировать от `20px` к `0`, но он не
должен запускать сложный layout/paint на слабых устройствах.

### Full-tab → windowed

Reverse FLIP занимает `180–220ms`. Windowed target rect вычисляется заново:
viewport мог измениться. До конца анимации input не размонтируется; draft и
selection остаются живыми.

### Обычное открытие и закрытие

- open overlay: opacity + `translateY(6px)` / scale `.99`, `180–220ms`;
- close: обратный переход `140–180ms`;
- нельзя анимировать `width`, `height`, grid columns, scrollTop или
  `100dvh`;
- View Transition API допустим как progressive enhancement после базового
  FLIP, но не как единственная реализация.

### Reduced motion

При `prefers-reduced-motion: reduce` FLIP, scale, slide, smooth auto-scroll и
skeleton shimmer отключены. Mode switch происходит сразу; допустим короткий
opacity fade до `80ms`, если он не мешает focus.

## 7. Focus, inert и Escape

### Windowed/full-tab overlay

- перед первым open сохраняется launcher element;
- background CMS становится фактически inert для keyboard, pointer и AT;
- initial focus идёт на workspace heading или первое непрочитанное/основное
  действие, а не автоматически на destructive control;
- Tab/Shift+Tab остаётся внутри topmost overlay;
- переключение windowed/full-tab не сбрасывает focus: активный control или
  composer восстанавливается по stable ref;
- закрытие возвращает focus launcher либо логичной соседней строке, если
  launcher исчез;
- вложенный menu/dialog закрывается первым. Только затем Escape закрывает
  workspace. Escape не отправляет сообщение и не теряет draft.

Если product хочет, чтобы первый Escape только сворачивал full-tab overlay, это
нужно явно проверить с пользователями и отразить в shortcut help. Базовый
accessible dialog contract проще: Escape закрывает отменяемый workspace целиком,
а `Свернуть` остаётся явной кнопкой.

### Route

Route не получает `aria-modal`, inert и global focus trap. Escape закрывает
только верхний menu/dialog/drawer. Он не уводит оператора из Support.

## 8. Визуальная композиция full-tab

```text
┌──────────────────────────────── viewport вкладки ────────────────────────────┐
│ 56–64 app rail │ inbox 300–336 │ Conversation flex │ inspector 336–392     │
│                │ sticky tools  │ compact header    │ tabs + actions         │
│                │ scroll list   │ scroll history    │ scroll content         │
│                │               │ sticky composer   │                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- никаких внешних 16/32px margins, общей rounded mega-card и backdrop;
- full-tab header высотой `56–64px`, если он нужен, входит в shell и не
  дублирует CMS page toolbar;
- shell background — `--surface-canvas`; inbox и inspector — спокойный
  `--surface-card`, Conversation history — едва заметный brand tint через
  semantic token/color-mix, composer — `--surface-raised` с одной мягкой тенью;
  это разбивает белое полотно на рабочие зоны без тяжёлых вложенных карточек;
- верхняя панель отделяется линией `1px`, а не отдельной парящей карточкой;
  connectivity, availability и actions собираются в один compact cluster;
- кнопка full-tab выглядит как neutral secondary control `36–40px` высотой с
  icon и текстом. В активном состоянии она не получает кислотную заливку:
  смена label/icon уже объясняет режим;
- status/availability/actions сгруппированы справа и не отнимают отдельную
  строку при рабочей ширине;
- Conversation забирает остаток ширины; inspector имеет верхнюю границу, а не
  оставляет справа пустой canvas;
- pane separators `1px`; radius используется у локальных controls/composer,
  не у всего приложения;
- во время FLIP конечный shell уже имеет правильный background, поэтому между
  windowed rect и viewport не появляется белая вспышка;
- inbox row показывает две строки без горизонтального clipping всей колонки;
- на `768–1279px` inspector становится drawer;
- ниже `768px` работает route-like stack `Inbox → Conversation → Inspector`,
  а не три сжатые колонки.

## 9. Проверки и acceptance criteria

### Геометрия и scroll

Playwright проверяет не class name, а результат:

```ts
const box = await page.getByTestId("full-viewport-workspace").boundingBox();
expect(box?.x).toBeCloseTo(0, 0);
expect(box?.y).toBeCloseTo(0, 0);
expect(box?.width).toBe(await page.evaluate(() => document.documentElement.clientWidth));
expect(box?.height).toBeCloseTo(
  await page.evaluate(() => visualViewport?.height ?? document.documentElement.clientHeight),
  0,
);
```

Также обязательно:

1. Открыть launcher при `scrollY = 600`, развернуть, прокрутить каждую панель,
   свернуть и закрыть. Document возвращается ровно на `600` без horizontal
   jump.
2. Wheel, touch и PageDown на границе history не меняют document scroll и не
   прокручивают соседнюю панель.
3. Вложенный dialog/menu не снимает root lock после своего закрытия.
4. `document.documentElement.scrollWidth === clientWidth` на всех размерах.
5. Toggle не меняет выбранную Conversation, draft, message anchor, перевод,
   inspector tab, loaded pages и pending attachment.

### Keyboard и accessibility

1. Focus входит, остаётся в topmost overlay и возвращается launcher.
2. Focus сохраняется на `На весь экран / Свернуть` и в composer при mode
   switch.
3. Escape соблюдает stack: menu → nested dialog → workspace.
4. At 200% zoom focused control не закрыт sticky header/composer.
5. Reduced motion убирает пространственное движение.
6. Screen reader получает один dialog/workspace landmark, а не две копии
   Conversation в DOM.

### Browser и visual matrix

| Размер | Что фиксируем |
| --- | --- |
| `1920×1080` | весь canvas занят, center не растянут до нечитаемой ширины |
| `1440×1000` | inbox + Conversation + inspector без CMS sidebar и пустого right gutter |
| `1280×800` | минимальная desktop высота, composer и actions доступны |
| `1024×768` | inspector drawer, независимый scroll |
| `390×844` | stack, safe area, open keyboard, orientation change |

Для каждого desktop состояния нужны light/dark screenshots: windowed, animation
start/end, full-tab, inspector open, long inbox labels, long message, nested
dialog и error banner. Mobile дополнительно проверяется с экранной клавиатурой.

## 10. План реализации

### F0. Зафиксировать поведение

- добавить geometry/scroll/focus tests для текущего launcher;
- снять baseline screenshots из приложенного состояния;
- вынести selection/draft/translation/scroll state из presentation Dialog;
- завершить единый `ConversationSurface`, прежде чем менять shell.

### F1. Ввести full-tab shell

- добавить `WorkspacePresentationController` и
  `FullViewportWorkspaceShell`;
- заменить PrimeVue maximize button собственной toggle button;
- перенести full-tab overlay в верхний app portal/Teleport;
- сделать один reference-counted overlay/scroll-lock owner;
- удалить конкурирующий `workspace-scroll-locked` и `block-scroll` из этого
  flow после parity;
- добавить FLIP и reduced-motion fallback.

### F2. Подключить Support route

- route meta переключает `AppShell` в `support-focus`;
- route сразу монтирует full viewport composition без modal semantics;
- Users/Live/Cases launcher открывает canonical deep link или тот же full-tab
  adapter;
- URL и store сохраняют selection, но presentation mode не становится backend
  или Conversation domain state.

### F3. Удалить legacy maximize path

- удалить `maximizable`, PrimeVue-specific maximized CSS и тесты body class;
- заменить их behavioral tests из раздела 9;
- проверить, что в production остался один message renderer, один translation
  toggle и один composer frame;
- после adoption оставить windowed launcher только как тонкий adapter либо
  заменить его direct Support deep link.

## 11. Не делать

- не вызывать `requestFullscreen()` из текущей кнопки;
- не лечить всё набором `!important` поверх `.p-dialog-maximized`;
- не создавать второй полноэкранный chat component;
- не клонировать Surface для анимации так, чтобы обе копии были доступны AT;
- не анимировать `width`, `height`, grid columns и scroll position;
- не блокировать `body` несколькими независимыми composables/classes;
- не использовать `100vw` как ширину fixed shell;
- не закрывать route по Escape;
- не считать screenshot достаточным без geometry, scroll и focus assertions.

## 12. Источники

Техническое исследование с первичными ссылками:
[support-fullscreen-workspace-browser-platform-discovery-2026-08-07.ru.md](../../research/support-fullscreen-workspace-browser-platform-discovery-2026-08-07.ru.md).

Основные нормы и browser primitives:

- [WAI-ARIA APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WHATWG: inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees)
- [CSSWG: viewport-relative lengths](https://drafts.csswg.org/css-values-4/#viewport-relative-lengths)
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [MDN: Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [Vue: Transition](https://vuejs.org/guide/built-ins/transition.html)
- [PrimeVue: Dialog](https://primevue.org/dialog/)
