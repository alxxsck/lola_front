# Адаптивный UI настроек аккаунта и безопасности

Дата исследования: 23 июля 2026 года.

## Задача

Сформировать проверяемые UX-правила для страницы настроек аккаунта и
безопасности: email, пароль, passkeys, recovery-коды и активные сессии. Фокус —
на проблемах, видимых в текущем интерфейсе: растянутые формы, разное положение
действий, перегруженные карточки, слабая мобильная композиция и неоднозначная
иерархия.

Использованы только первичные источники: WCAG/WAI, GOV.UK Design System, IBM
Carbon и Microsoft Fluent 2. Все конкретные предложения для Lola ниже являются
выводами из этих источников, а не готовым макетом из одной дизайн-системы.

## Главные решения для Lola

1. **Оставить одну вертикальную ленту смысловых секций.** На телефоне вся
   страница становится одной колонкой; на широком экране контент остаётся
   ограниченным по ширине, а не растягивается до краёв. GOV.UK рекомендует
   начинать с одноколоночного small-screen layout и ограничивать длину строки
   примерно 75 символами; Fluent рассматривает reflow и reposition как базовые
   responsive-техники и начинает свою шкалу viewport с 320 px.
   ([GOV.UK: Layout](https://design-system.service.gov.uk/styles/layout/),
   [Fluent 2: Layout](https://fluent2.microsoft.design/layout))
2. **Заголовок страницы должен покрывать весь раздел:** «Безопасность
   аккаунта», а не только пароль и сессии. Ниже — одно короткое пояснение.
   Email, пароль, способы входа и сессии получают собственные `h2`; заголовок
   формы должен быть крупнейшим внутри формы, а групповые заголовки — заметно
   крупнее labels, но меньше заголовка формы. ([Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/))
3. **Убрать глобальное разрушительное действие из page header.** «Завершить
   остальные сессии» относится только к списку сессий и должно находиться в
   header/footer этой карточки. GOV.UK требует использовать warning-стиль
   экономно, только для серьёзных труднообратимых действий, и не полагаться
   только на красный цвет; Carbon размещает действия формы после её содержимого,
   а не сверху. ([GOV.UK: Button](https://design-system.service.gov.uk/components/button/),
   [Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/))
4. **Формы пароля и email строить вертикально.** Видимая label находится над
   каждым input; пояснение и ошибка относятся к конкретному полю. Primary action
   идёт после последнего поля и выравнивается по левому краю; на телефоне может
   занимать всю ширину. Carbon в общем случае рекомендует single-column forms,
   а GOV.UK — labels над полями и primary action у левого края формы.
   ([Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/),
   [GOV.UK: Text input](https://design-system.service.gov.uk/components/text-input/),
   [GOV.UK: Button](https://design-system.service.gov.uk/components/button/))
5. **Использовать один контракт геометрии.** Все обычные inputs, password
   inputs и кнопки имеют один базовый размер и радиус. Carbon использует 40 px
   как стандартную высоту product input; для Lola практичнее принять
   интерактивную область не меньше 44 × 44 CSS px на touch-экранах — это
   усиленный ориентир WCAG и минимум Fluent для Web/iOS.
   ([Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/),
   [W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html),
   [Fluent 2: Layout](https://fluent2.microsoft.design/layout))
6. **Passkeys и сессии показывать компактными списками, а не набором больших
   самостоятельных плиток.** Одна строка содержит имя устройства/ключа,
   короткий статус, вторичные даты и контекстное действие. Carbon рекомендует
   contained list для однородных элементов с inline actions; GOV.UK summary
   cards — для повторяющихся сущностей с действиями, относящимися к конкретному
   объекту. ([Carbon: Contained list](https://carbondesignsystem.com/components/contained-list/usage/),
   [GOV.UK: Summary list](https://design-system.service.gov.uk/components/summary-list/))

## Рекомендуемая структура страницы

```text
Безопасность аккаунта
Управляйте адресом входа, способами подтверждения и активными сессиями.

┌ Email и уведомления ────────────────────────────────────────┐
│ Имя · current@example.com · Подтверждён                     │
│ Изменение email / письмо подтверждения                      │
│ Получать предложения Lola по email                 [toggle] │
└─────────────────────────────────────────────────────────────┘

┌ Пароль ─────────────────────────────────────────────────────┐
│ Текущий пароль                                              │
│ Новый пароль                                                │
│ [Сохранить новый пароль]                                    │
└─────────────────────────────────────────────────────────────┘

┌ Способы входа ──────────────────────────────────────────────┐
│ Рабочий MacBook · использован сегодня             [Удалить] │
│ Recovery-коды · осталось 8                 [Создать новые]  │
│ [Добавить passkey]                                          │
└─────────────────────────────────────────────────────────────┘

┌ Активные сессии ───────────────── [Завершить остальные] ───┐
│ Chrome на macOS · Текущая · активность сегодня     [Выйти] │
│ Safari на iPhone · активность вчера              [Завершить]│
└─────────────────────────────────────────────────────────────┘
```

Карточка объединяет только один объект настройки. Её header объясняет задачу,
body содержит данные или форму, footer — действия. Повторяющиеся строки
используют одинаковую структуру и высоту; Carbon требует сохранять одинаковую
структуру содержимого внутри одного contained list и разрешает в строках кнопки,
ссылки, tags и toggles. ([Carbon: Contained list](https://carbondesignsystem.com/components/contained-list/usage/))

## Формы и действия

### Поля

- Label всегда видима, коротка, написана обычным регистром и стоит над input.
  Placeholder не заменяет label или обязательную инструкцию: он исчезает при
  вводе, не всегда читается screen reader и часто имеет недостаточный контраст.
  ([GOV.UK: Text input](https://design-system.service.gov.uk/components/text-input/))
- Ширина поля отражает ожидаемое содержимое. Email и пароль не должны
  растягиваться на всю широкую карточку: рекомендуется ограничить form column
  примерно 560–640 px, сохранив `width: 100%` внутри неё. И GOV.UK, и Carbon
  связывают ширину input с длиной ожидаемого значения и responsive grid.
  ([GOV.UK: Text input](https://design-system.service.gov.uk/components/text-input/),
  [Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/))
- Для dedicated-page form Carbon приводит ритм 32 px между inputs, больший
  интервал между группами и около 48 px между последним input и button group.
  Для Lola это не обязательные пиксели, а основание для устойчивого шага:
  20–24 px между полями, 28–32 px между секциями, 24–32 px перед actions;
  мобильные интервалы можно уменьшать, не смешивая несколько разных ритмов.
  ([Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/))
- Ошибка должна назвать поле и описать исправление текстом. Красной границы или
  общего toast недостаточно; inline error остаётся рядом с полем, а общий alert
  может дополнять его после server-side ошибки.
  ([W3C: Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html),
  [Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/))

### Password UX

- Использовать корректные `autocomplete="current-password"` и
  `autocomplete="new-password"`, не блокировать password managers, autofill,
  copy или paste. WCAG 3.3.8 прямо рассматривает password manager и paste как
  механизмы, снимающие требование запоминать и перепечатывать секрет.
  ([W3C: Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html))
- Добавить явную кнопку «Показать пароль» / «Скрыть пароль» с доступным именем,
  keyboard focus и полноценной touch-областью. GOV.UK скрывает пароль по
  умолчанию, но рекомендует toggle для визуальной проверки.
  ([GOV.UK: Password input](https://design-system.service.gov.uk/components/password-input/))
- GOV.UK рекомендует не добавлять отдельное поле подтверждения, если пользователь
  может показать и проверить новый пароль. Для Lola удаление подтверждения
  допустимо только после проверки backend-контракта и продуктового риска; если
  поле остаётся, labels и aria-label кнопок показа должны различать «новый
  пароль» и «повтор нового пароля».
  ([GOV.UK: Password input](https://design-system.service.gov.uk/components/password-input/))

### Иерархия действий

- В каждой форме одна primary button с конкретным глаголом и объектом:
  «Изменить email», «Сохранить новый пароль», «Добавить passkey». Carbon и
  GOV.UK предостерегают от нескольких равнозначных primary actions и расплывчатых
  названий вроде «Отправить».
  ([Carbon: Forms](https://carbondesignsystem.com/patterns/forms-pattern/),
  [GOV.UK: Button](https://design-system.service.gov.uk/components/button/))
- «Отменить», «Начать заново» и сходные действия — secondary/tertiary. «Удалить
  passkey», «Завершить сессию» и «Создать новые recovery-коды» получают
  явный текст последствия; необратимое подтверждается отдельным шагом. Красный
  цвет дополняет, но не заменяет формулировку.
  ([GOV.UK: Button](https://design-system.service.gov.uk/components/button/))
- Действие строки должно иметь самодостаточное accessible name: не просто
  «Удалить», а «Удалить passkey “Рабочий MacBook”»; не просто «Завершить», а
  «Завершить сессию Safari на iPhone». GOV.UK требует добавлять скрытый контекст
  к повторяющимся row actions.
  ([GOV.UK: Summary list](https://design-system.service.gov.uk/components/summary-list/))

## Responsive-правила

| Ширина         | Композиция Lola                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Широкая        | Одна bounded column страницы; card padding 24 px; формы не шире читаемой form column; list action справа в строке.                                                                                             |
| Средняя        | Карточки остаются вертикальной лентой; header/actions могут переноситься; формы уже одноколоночные.                                                                                                            |
| 390–320 CSS px | Padding страницы 12–16 px, карточки 16 px; все fields и action groups в одну колонку; основные и разрушительные row actions занимают доступную ширину; metadata переносится без ellipsis, если значение важно. |

WCAG 1.4.10 требует сохранить информацию и функции без двумерной прокрутки при
эквиваленте 320 CSS px; одноколоночный reflow — стандартный способ выполнить это
для обычной страницы настроек. Исключения для таблиц и диаграмм к этой странице
не относятся. ([W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))

Minimum по WCAG 2.5.8 AA — 24 × 24 CSS px либо достаточное расстояние по
описанным исключениям. Для мобильных кнопок, password reveal, row actions и
toggle Lola следует принять 44 × 44 CSS px как внутренний стандарт: это
усиленный WCAG target, особенно полезный для частых и труднообратимых действий.
([W3C: Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html))

## Dark theme и доступность

- Цвета задаются только role-based tokens: page background, card/layer,
  field, border, primary/secondary text, status, focus. Carbon использует
  одинаковые роли токенов во всех темах; меняются их значения, а не назначение.
  ([Carbon: Color](https://carbondesignsystem.com/elements/color/overview/))
- В dark theme каждый вложенный слой становится немного светлее основного
  background. Карточка, contained list row и input не должны сливаться в один
  near-black прямоугольник или различаться только shadow.
  ([Carbon: Color](https://carbondesignsystem.com/elements/color/overview/))
- Если пользователь явно не выбрал тему, допустимо следовать
  `prefers-color-scheme`; явный выбор продукта должен сохраняться. Carbon
  документирует соответствие системной light/dark preference.
  ([Carbon: Themes](https://carbondesignsystem.com/elements/themes/code/))
- Текст обычного размера должен иметь контраст не ниже 4.5:1; визуальные границы
  controls, состояния и focus — не ниже 3:1 относительно соседних цветов.
  Эти проверки выполняются отдельно для light и dark themes.
  ([W3C: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  [W3C: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html))
- Статус не кодируется только цветом: рядом есть короткий текст и, при
  необходимости, иконка. Fluent рекомендует держать badge рядом с описываемым
  объектом, использовать одинаковый размер в одном контексте и формулировать
  состояние одним-двумя словами. Async-результаты «сохранено», «ошибка»,
  «письмо отправлено», «сессия завершена» объявляются через подходящий live
  status/alert без принудительного перемещения фокуса.
  ([W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html),
  [W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
  [Fluent 2: Badge](https://fluent2.microsoft.design/components/web/react/core/badge/usage))

## Проверяемый сценарий и критерии готовности

1. На 1440/1024/390/320 px пользователь видит один и тот же порядок: email →
   пароль → способы входа → сессии; ни один status, email, код или action не
   создаёт горизонтальный page scroll.
2. При 200% text resize и эквиваленте 400% zoom содержимое reflow-ится в 320 CSS
   px без потери функций. ([W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html))
3. Все labels видимы; placeholder не является единственной инструкцией; ошибка
   связана с конкретным input и объясняет исправление.
4. Password manager заполняет current/new password; paste работает; каждый
   password input можно отдельно показать и скрыть.
5. Tab проходит страницу в визуальном порядке. Focus не теряется после
   сохранения, удаления или обновления списка; кнопки доступны с клавиатуры.
6. Повторяющиеся session/passkey actions имеют уникальные accessible names.
7. Primary action находится после полей. Destructive actions находятся рядом с
   объектом воздействия и требуют подтверждения там, где результат трудно
   отменить.
8. Light и dark themes отдельно проходят проверки 4.5:1 text, 3:1 control/focus,
   а статусы остаются понятны в grayscale.
9. Touch targets основных и опасных действий не меньше 44 × 44 CSS px; минимум
   WCAG AA 24 × 24 проверяется автоматически для всех остальных targets.

## Источники, намеренно не использованные как доказательство

Dribbble, Behance, Pinterest, маркетинговые галереи, сторонние UX-блоги и
скриншоты чужих продуктов не использовались. Они могут подсказать визуальное
настроение, но не являются основанием для поведения формы, доступности или
responsive layout. Конкретные ширины, padding и breakpoint Lola являются
проектными выводами и должны подтверждаться browser QA, а не копироваться из
одной внешней дизайн-системы.
