# Full-screen Support Workspace: browser-platform discovery

Дата: 7 августа 2026 года.
Границы: технические и accessibility-решения для полноэкранного route-based
операторского workspace Lola. Использованы первичные источники WHATWG, W3C/WAI,
CSSWG, MDN, Vue/PrimeVue и исходный код установленной PrimeVue 4.5.5. Это не
изменение продуктовой спецификации.

## Решение в одном абзаце

`/support/*` должен быть **обычным deep-linkable application route**, который
занимает viewport вкладки, а не `Dialog` поверх `/users` или `/cases`. Под
«полноэкранным» здесь понимается `in-tab workspace`: браузерная строка, вкладки и
системные жесты остаются. Real Fullscreen API — только необязательная кнопка для
явно запрошенного focus mode, никогда не prerequisite работы.

```text
browser tab viewport
└─ SupportRouteShell (100dvh, overflow: clip/hidden)
   ├─ app rail / Support nav             — не прокручивается
   ├─ inbox pane > list                  — самостоятельный scroll
   ├─ conversation > header/history/composer
   │                 history             — самостоятельный scroll
   └─ inspector > content                — самостоятельный scroll
```

Во всех grid/flex-узлах между shell и scroll owners обязательны `min-width: 0`
и `min-height: 0`; иначе вложенная лента вытеснит composer или вернёт scroll
на `body`.

## Что есть сейчас

Исходная Surface находится в
[`UserWorkspaceDialog.vue`](../../src/features/end-user-workspace/UserWorkspaceDialog.vue).

- Desktop screenshot в mock-CMS при `1440×1000` показал белую modal surface с
  radius и затемнёнными, но отчётливо видимыми sidebar и Users page. Это
  соответствует текущим `width: min(1480px, calc(100vw - 32px))` и
  `height: min(900px, calc(100dvh - 32px))`, а fullscreen возможен только после
  ручного maximize. Следовательно, это хороший legacy launcher/adapter, но не
  Support route. На `390×844` CSS уже делает Dialog edge-to-edge (`100vw ×
  100dvh`), однако остаётся modal model.
- Dialog одновременно использует PrimeVue `modal`, `block-scroll`, `maximizable`
  и собственный class `workspace-scroll-locked` на `body`. PrimeVue уже ловит
  focus и вычисляет ширину scrollbar для своей design-token переменной; второй
  ручной lock создаёт неявную ownership-модель и риск при вложенных overlays.
  Исходник PrimeVue показывает, что `Dialog` сохраняет trigger, ловит Escape,
  применяет focus trap только для modal и блокирует body на enter/leave.
  ([PrimeVue Dialog source](../../node_modules/primevue/dialog/Dialog.vue),
  [PrimeVue Dialog API](https://primevue.dev/dialog/))
- Внутри Dialog полезная база уже есть: grid с `min-height: 0`, отдельные
  `conversation-list` и `message-history`, scroll anchor при older messages и
  `prefers-reduced-motion`. Но desktop grid содержит только список Conversations
  и chat, без Case inbox/inspector; его нельзя растягивать простым maximize.
- Router восстанавливает browser `savedPosition`, в остальных переходах обычно
  возвращает `{ top: 0 }`.
  ([router](../../src/app/router.ts)) Локальный `/users/:endUserId` кодирует
  selection/`conversationId` в URL, но поддерживает modal как состояние страницы.
  Для Support URL должен стать source of truth, а launcher из Users/Live/Cases —
  лишь переходом на него.

## 1. Route, viewport и history

### Рекомендуемая модель

- Маршруты: `/support/cases`, `/support/chats`, `/support/cases/:caseId` и
  `/support/chats/:conversationId` (точные domain params уточняются контрактом).
  Query хранит только нормализованные shareable параметры view/filter/sort и
  selection; transient drawer/open animation, hover, upload progress и drafts
  в URL не попадают.
- Вход из legacy Users/Live/Cases: `router.push()` на канонический Support URL.
  Переключение filter/sort/selection в пределах workflow: `router.replace()`,
  чтобы Back возвращал к предыдущему рабочему контексту, а не к каждому клику.
  Делать `push()` для намеренного открытия другого Case/Conversation можно лишь
  после согласования product history policy.
- `SupportRouteShell` получает route meta `layout: 'support-focus'`; `AppShell`
  в этом режиме заменяет широкий 250px CMS sidebar компактным rail или вовсе
  не монтирует обычный page header. Результат должен быть visual-full viewport
  без backdrop, margins и кнопки maximize.
- При переходе **в** Support не восстанавливать scroll `body`: у route нет
  document scroll. Сохранять независимые positions по stable ключам
  `view + case/conversation`; hydrate после загрузки list/messages, а не до неё.
  Назад на обычную CMS-страницу возвращает её browser `savedPosition`.

### Высота и безопасная область

```css
html, body, #app { min-height: 100%; }
.support-route-shell {
  height: 100vh;       /* fallback */
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  padding-block: env(safe-area-inset-top, 0px)
                 env(safe-area-inset-bottom, 0px);
  padding-inline: env(safe-area-inset-left, 0px)
                 env(safe-area-inset-right, 0px);
}
.support-pane, .support-pane__scroll { min-width: 0; min-height: 0; }
.support-pane__scroll { overflow: auto; overscroll-behavior: contain; }
.support-composer { padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)); }
```

`dvh` следует использовать именно для app shell: в отличие от legacy `vh`, он
реагирует на раскрытие/скрытие browser chrome. Но динамическая высота может
меняться при scroll, поэтому она не годится для беспричинной анимации размеров
вложенных панелей. `safe-area-inset-*` защищает edge-to-edge composer от notch и
нижней системной области.
([CSSWG: viewport-relative lengths](https://drafts.csswg.org/css-values-4/#viewport-relative-lengths),
[MDN: viewport lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length),
[MDN: CSS environment variables](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Environment_variables/Using))

### Mobile keyboard и Visual Viewport

Не добавлять JavaScript-пересчёт высоты «на всякий случай». В mobile layout
viewport и visual viewport различаются: экранная клавиатура может уменьшить
видимую область без изменения layout viewport. Базовый вариант — `100dvh`,
flex column, min-height zero и scrollable message history. Если конкретный
iOS/browser тест докажет, что fixed composer скрыт, подключить
`window.visualViewport` только для CSS custom property/imperative offset,
слушая `resize` и `scroll` и корректно снимая listeners.
([MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport))

Acceptance: открыть клавиатуру в composer, сменить orientation и pinch zoom;
textarea, Send, close drawer и последнее сообщение остаются достижимы, а scroll
не уходит на document.

## 2. Scroll lock и независимые панели

- **Route focus mode не применяет modal body lock.** `body` не должен иметь
  scroll потому, что route shell ограничен viewport и владеет scroll panes, а не
  потому что глобальный style случайно спрятал overflow.
- Для настоящего **modal** (delete, attachment preview, short picker) использовать
  один общий overlay primitive. Не добавлять параллельно PrimeVue `block-scroll`
  и собственный `body` class. Если primitive не PrimeVue, lock обязан быть
  reference-counted: сохранить `scrollY`, заблокировать именно root scroller,
  компенсировать classic scrollbar и точно восстановить style/position после
  последнего close.
- `scrollbar-gutter: stable` поставить на каждый desktop scroll owner, где
  изменение наличия scrollbar сдвигает column content. Оно резервирует gutter
  для classic scrollbars, но не для overlay scrollbars — поэтому не использовать
  его как расчётный отступ для fixed controls.
  ([MDN: scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter))
- `overscroll-behavior: contain` на inbox/history/inspector предотвращает scroll
  chaining к соседней панели; он не является полноценным iOS scroll-lock
  заменителем. На browser matrix нужно проверить touch scroll, pull-to-refresh
  и fallback behavior Safari.
  ([MDN: overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior))
- Header и composer sticky **внутри conversation column**, а не `position:
  fixed` относительно документа. Только history владеет вертикальным scroll;
  incoming message сохраняет anchor/показывает new-message pill и не двигает
  читающего оператора.

## 3. Focus, inert и Escape

### Route workspace

Support route — не modal: не ставить `aria-modal`, не inert-ить остальной
workspace и не trap-ить Tab. Предсказуемый порядок — rail/nav → inbox →
conversation header/history/composer → inspector. Выбранная строка не равна
focused строке: realtime refresh/selection никогда не может удалить или
переместить текущий focus. Для virtualized inbox применить roving `tabindex` или
`aria-activedescendant` и перед догрузкой удержать active row в view.
([WAI-ARIA APG: keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/),
[W3C: Focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html),
[W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum))

`Escape` на route имеет только local, ненасильственный порядок: закрыть
открытый menu/popover → close non-modal inspector drawer → если нет overlay,
ничего не делать. Он не должен неожиданно уводить оператора на `/cases` и не
должен отправлять текст composer. A visible focus indicator обязателен на всех
токенах темы.

### Настоящие dialogs

Для blocking confirm / attachment preview / template editor:

1. Открыть с `role="dialog"`, accessible name и `aria-modal="true"`; после
   фокуса на dialog сделать фон `inert` и визуально замаскировать.
2. Переместить focus внутрь. В длинном structured dialog — на heading/summary с
   `tabindex="-1"`, не сразу на destructive button.
3. `Tab`/`Shift+Tab` остаются внутри, `Escape` закрывает отменяемую modal,
   visible close/cancel всегда доступен. После close вернуть focus trigger либо
   логичную следующую строку, если trigger исчез.
4. Не применять `aria-modal` к persistent inspector/drawer, если pointer/Tab
   должен работать с conversation позади него.

W3C требует не только декларацию `aria-modal`, но и фактическую неоперабельность
фона. HTML `inert` исключает subtree из focus, pointer/commands и accessibility
tree; `aria-hidden` сам по себе не заменяет lock. Native `<dialog>.showModal()`
делает фон inert автоматически, но PrimeVue Dialog — custom portal, поэтому
поведение следует проверить в browser/AT matrix или обеспечить в primitive.
([WAI-ARIA APG: Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[WHATWG: inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees),
[WAI-ARIA 1.2: aria-modal](https://www.w3.org/TR/wai-aria-1.2/#aria-modal),
[W3C technique H102](https://www.w3.org/WAI/WCAG21/Techniques/html/H102))

## 4. Motion и overlays

- Переход в Support route: короткий opacity transition без сдвига всей рабочей
  поверхности. Не анимировать grid widths, `height: 100dvh`, scroll positions
  или автоскролл ленты.
- Inspector drawer и noncritical menu: максимум opacity/короткий transform;
  после transition получатель focus уже видим и не заслонён. Critical confirm
  может открываться статично.
- `@media (prefers-reduced-motion: reduce)` отключает slide/scale/pulse,
  smooth auto-scroll и skeleton shimmer; функциональный enter/exit остаётся
  мгновенным. Vue `<Transition>` годится для route/drawer lifecycle, но не
  заменяет semantic/focus lifecycle.

([Vue: Transition](https://vuejs.org/guide/built-ins/transition.html),
[MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion),
[W3C technique C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39),
[W3C: Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html))

## 5. Fullscreen API: не основной механизм

Browser Fullscreen API скрывает browser UI и другие apps; он ограниченно
доступен, зависит от user activation/Permissions Policy, может reject и
пользователь всегда вправе выйти через `Esc`/`F11`, смену tab/app или навигацию.
Кроме того, `<dialog>` не может быть fullscreen target. Поэтому первичная
реализация Support не вызывает `requestFullscreen()`.

Если впоследствии нужен optional control «Скрыть интерфейс браузера», он
вызывается только click handler на `SupportRouteShell` (не на Dialog), ожидает
promise, отражает `fullscreenchange`/`fullscreenerror` и сохраняет одинаково
рабочий in-tab fallback. `Esc` сначала принадлежит browser fullscreen; после
`fullscreenchange` route не должен закрываться.
([MDN: Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API),
[MDN: requestFullscreen()](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen))

## Definition of Done для первого route shell

- Desktop 1280–1920px: Support занимает **точный viewport вкладки**, без modal
  margin/backdrop/maximize; body не scrollable, а inbox/history/inspector
  скроллятся независимо.
- Mobile 390×844 и планшет: keyboard, safe area, browser chrome и orientation
  не перекрывают composer или focus; mobile stack сохраняет drafts/scroll при
  Back.
- Keyboard-only: все actions достижимы, focus order стабилен, selected row не
  крадёт focus, sticky surfaces не заслоняют focused control.
- Modal-only behaviors: background inert для keyboard/pointer/AT, focus
  enters/traps/returns, Escape closing соответствует отменяемости действия.
- Reduced motion: no nonessential motion/forced smooth scroll.
- Direct URL reload, browser Back/Forward и переход из Users/Live/Cases
  открывают канонический Support selection без modal state и без потери
  разрешённого server-provided context.
