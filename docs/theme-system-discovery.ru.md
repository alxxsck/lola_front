# Темизация Lola CMS: discovery и план перехода

Статус: discovery, без изменений production-кода.

## Рекомендация

Сохранить характер Lola — тёплые оливковые нейтрали, lime-акцент и violet для действий — и построить темы на семантических токенах. Тёмная тема должна быть не инверсией и не почти чёрным интерфейсом, а спокойной серией зеленовато-графитовых поверхностей.

Переключатель темы не стоит выпускать, пока не мигрированы все пользовательские экраны: сейчас большая часть локальных стилей содержит прямые светлые цвета.

## Что найдено

- PrimeVue уже настроен на селектор `.lola-dark` в `src/main.ts`, но класс нигде не устанавливается, состояние темы не хранится, переключателя нет.
- В `src/app/styles/main.css` есть только небольшой набор глобальных переменных: `--ink`, `--muted`, `--line`, `--paper`, `--canvas`, `--accent`, `--accent-strong`, `--violet`, `--coral`, `--shadow`.
- В 48 файлах найдено около 1 038 прямых цветовых значений и 601 уникальное строковое значение. Это не 601 реальный дизайн-токен: много почти одинаковых нейтралей и оттенков состояний нужно нормализовать.
- Наибольшая концентрация прямых цветов: `KnowledgePage.vue` (56), `ScenarioEditorPage.vue` (55), `AiUsageSection.vue` (47), `EventsPage.vue` (46), `EventLogsPage.vue` (38), `SegmentManager.vue` (37), `ProjectPage.vue` и `RuleNodeCard.vue` (по 36).
- Есть отдельные цветовые острова: PrimeVue Aura, Vue Flow, графики, markdown/code blocks, overlay/drawer, skeleton, статусы и иллюстративные градиенты.

## Сайдбар

Проблема подтверждена в браузере на desktop viewport:

| Высота viewport | `clientHeight` | `scrollHeight` | `overflow-y` | Нижняя граница профиля |
| ---: | ---: | ---: | --- | ---: |
| 844 px | 844 px | 844 px | `visible` | 826 px |
| 700 px | 700 px | 770 px | `visible` | 770 px |
| 600 px | 600 px | 770 px | `visible` | 770 px |

Причина: весь `aside.sidebar` — один flex-контейнер с `height: 100vh`; `nav` не имеет собственной прокручиваемой области, а `sidebar-note` использует `margin-top: auto`. При нехватке высоты нижние блоки просто уходят за viewport.

Рекомендуемая структура:

```text
aside.sidebar (height: 100dvh; overflow: hidden)
├── sidebar-header        — логотип и проект, не прокручивается
├── sidebar-scroll        — min-height: 0; overflow-y: auto
│   └── nav
└── sidebar-footer        — тема, режим и профиль, не прокручивается
```

На очень низкой высоте прокручивается только навигация; тема и профиль остаются достижимыми. На mobile drawer используется та же структура и `100dvh`.

## Архитектура токенов

Не следует создавать токен на каждый существующий hex. Нужны три уровня:

1. Примитивная палитра — нейтральные, lime, violet, semantic hues. Используется только внутри файла темы.
2. Семантические токены — фон, поверхность, текст, граница, интерактивное состояние, статус.
3. Компонентные токены — только когда общей семантики недостаточно: sidebar, chart series, code block, graph canvas.

Основной интерфейс компонентов должен ссылаться на семантику, например `background: var(--surface-card)`, а не на `--olive-950` и не на `#1d211a`.

### Базовые пары

| Семантика | Светлая | Тёмная |
| --- | --- | --- |
| `--surface-canvas` | `#F5F5F1` | `#151812` |
| `--surface-card` | `#FFFFFF` | `#1D211A` |
| `--surface-raised` | `#FFFFFF` | `#23281F` |
| `--surface-subtle` | `#F8F8F5` | `#292F25` |
| `--surface-hover` | `#F0F1EC` | `#30362C` |
| `--text-primary` | `#20231E` | `#F1F3EC` |
| `--text-secondary` | `#71756D` | `#AEB5A7` |
| `--text-tertiary` | `#92978D` | `#8A9384` |
| `--border-default` | `#E4E5DF` | `#343A30` |
| `--border-strong` | `#CFD2C7` | `#485043` |
| `--brand` | `#D7FF64` | `#D7FF64` |
| `--brand-hover` | `#C7F05A` | `#C7F05A` |
| `--brand-soft` | `#EFF8D7` | `#2D371A` |
| `--on-brand` | `#20231E` | `#202510` |
| `--action-primary` | `#7059DF` | `#765CE5` |
| `--focus-ring` | `#765CE5` | `#A994FF` |

### Статусы

Для каждого статуса нужны минимум `base`, `soft` и `text`, чтобы один цвет не пытался быть одновременно фоном, иконкой и текстом.

| Статус | Base dark | Soft dark | Text dark |
| --- | --- | --- | --- |
| Success | `#79D586` | `#1E3724` | `#98E6A2` |
| Warning | `#F0C66C` | `#3B3018` | `#F6D892` |
| Danger | `#FF8A78` | `#43231F` | `#FFB0A0` |
| Info | `#76C7E7` | `#19313A` | `#A9E3F4` |
| Violet/category | `#A994FF` | `#2B2546` | `#C6BBFF` |

Проверенные ключевые контрасты WCAG: primary text/canvas — 16.03:1, primary text/card — 14.61:1, secondary text/card — 7.76:1, tertiary text/card — 5.13:1, on-brand/brand — 13.78:1. `#765CE5` выбран для filled violet action, потому что белый текст на более светлом `#8068ED` даёт только 4.10:1, а на `#765CE5` — 4.74:1.

### Дополнительные группы

- `--overlay-backdrop`, `--shadow-raised`, `--shadow-dialog`.
- `--input-background`, `--input-border`, `--input-placeholder`, `--input-disabled`.
- `--code-background`, `--code-text`, `--code-keyword`, `--code-string`.
- `--chart-series-1..6`, `--chart-grid`, `--chart-axis`, `--chart-tooltip`.
- `--graph-canvas`, `--graph-node`, `--graph-edge`, `--graph-selection`.
- `--sidebar-background`, `--sidebar-surface`, `--sidebar-text`, `--sidebar-text-muted`, `--sidebar-active-background`, `--sidebar-active-text`.

Сайдбар можно оставить стабильной брендовой поверхностью в обеих темах; это сохраняет узнаваемость и уменьшает визуальный скачок при переключении.

## Поведение темы

- Единственный DOM-контракт: класс `.lola-dark` на `<html>`. Он одновременно активирует собственные CSS-токены и уже настроенную dark-схему PrimeVue.
- Пользовательский контрол — компактная строка «Тема» над блоком режима/профилем в sidebar footer, с иконкой и нативным switch. Состояния подписываются «Светлая»/«Тёмная»; цвет не является единственным сигналом.
- На первом запуске без сохранённого выбора используется `prefers-color-scheme`. После ручного выбора значение сохраняется в `localStorage` и системные изменения его не перезаписывают.
- Класс темы применяется маленьким bootstrap-скриптом до mount Vue, иначе при открытии тёмной темы будет светлая вспышка.
- Login, dialogs, toast, drawer и teleported PrimeVue overlays получают ту же тему через класс на `<html>`, а не через класс внутри `#app`.

## План реализации

### Этап 1. Foundation

- Добавить единый файл темы с light/dark semantic tokens.
- Создать кастомный PrimeVue preset на базе Aura и связать его semantic colors с палитрой Lola.
- Добавить `useTheme`/theme store: initial system preference, persistence, DOM class, реакция на system preference до ручного выбора.
- Подготовить pre-mount bootstrap против FOUC, но подключить его только после миграции экранов.
- Подключить foundation tokens к root color/background и legacy aliases без изменения текущих light-значений; детальную миграцию global UI оставить Этапу 2.
- Покрыть тему unit-тестами. Не активировать тёмную тему и не показывать переключатель пользователям до финальной visual matrix.

### Этап 2. Global UI и AppShell

- Перевести `main.css`, form controls, cards, table, dialogs, toast, skeleton и focus states на токены.
- Разделить sidebar на header / scroll / footer и исправить overflow.
- Добавить строку переключения темы в sidebar footer.
- Покрыть sidebar component-тестом и Playwright-проверкой на высотах 844/700/600 px и mobile drawer.

### Этап 3. Главные пользовательские потоки

- Мигрировать `Overview`, `Knowledge`, `Events`, `EventLogs`, `ScenarioEditor` и `Project`.
- Для каждого экрана проверить default, hover, focus, disabled, loading, empty, error, modal/drawer.
- Не заменять hex механически: сначала сопоставлять смыслу, затем удалять локальные дубли.

### Этап 4. Features и визуальные подсистемы

- Мигрировать scenario rules/audience/goals/publishing, AI usage, speech synthesis, documentation и remaining pages.
- Отдельно настроить chart tokens, Vue Flow, markdown/code blocks и декоративные градиенты.
- Проверить, что пользовательские/динамические цвета не ломают контраст в тёмной теме.

### Этап 5. Выпуск и защита от регрессий

- Провести screenshot matrix для representative screens в light/dark и desktop/mobile.
- Запустить axe и ручную keyboard-проверку theme switch, меню, dialogs и drawers.
- Добавить CI-проверку на новые raw colors вне файла палитры с коротким allowlist для редких data-driven значений.
- Только после прохождения матрицы включить видимый переключатель темы.

## Критерии готовности

- На пользовательских экранах нет прямых UI-цветов вне theme/palette и документированного allowlist.
- PrimeVue, собственные компоненты, teleports, charts и Vue Flow меняют тему синхронно.
- После reload тема не мигает и сохраняет выбор пользователя.
- При высоте 600 px все пункты навигации доступны прокруткой, а переключатель и профиль не выходят за viewport.
- Текстовые пары соответствуют WCAG AA; focus-visible заметен в обеих темах.
- Dark mode не выглядит как инверсия: поверхности читаются слоями, brand lime используется дозированно, статусы различимы не только цветом.
