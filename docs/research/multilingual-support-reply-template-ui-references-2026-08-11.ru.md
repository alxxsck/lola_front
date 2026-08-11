# Многоязычные шаблоны ответов: первичные UI-референсы

Дата: 2026-08-11
Область: библиотека шаблонов Lola Support, создание/редактирование, перевод и вставка в активный чат.

## Короткий вывод

Лучший эталон для Lola — не существующий split-view с постоянной формой справа, а
сочетание трёх зрелых паттернов:

1. **Shopify resource index** для самой библиотеки: одна широкая колонка, явный
   заголовок и счётчик, затем поиск/фильтры/сортировка и сканируемый список объектов.
2. **Intercom / Zendesk macro library** для операторского поиска: понятное имя,
   папка или категория, область доступности, использование и быстрые действия.
3. **Zendesk dynamic content** для локализации: один логический объект, один
   основной вариант и языковые варианты, из которых при использовании выбирается
   нужный по языку пользователя.

Рекомендуемый north star: **один шаблон с каноническим русским текстом**. Переводы
всех языков проекта скрыты под строкой `Переводы 7 из 8`, генерируются отдельным
асинхронным job и раскрываются только для проверки или исправления. Создание и
редактирование — в focused modal на desktop и full-screen dialog на mobile.

## Что подтверждают официальные источники

### 1. Библиотека — это resource index, а не форма рядом с мелкими карточками

Shopify описывает resource index как одноколоночную страницу: page-level title и
actions сверху, фильтры/сортировка/multi-select перед списком, сами объекты — в
основной области. Строка должна давать быстрый обзор и открывать detail; длинные
списки получают search, filters, sort и pagination. Источники:
[Shopify Polaris — Resource index layout](https://polaris-react.shopify.com/patterns/resource-index-layout),
[Shopify Polaris — Index table](https://polaris-react.shopify.com/components/tables/index-table?example=index-table-without-checkboxes).

Zendesk в актуальном управлении macros показывает общее количество, поддерживает
поиск по частичному имени, фильтры по статусу, доступности и категории, сортировку
по имени/дате/использованию и bulk actions. Это прямой продуктовый референс для
крупной библиотеки шаблонов ответов:
[Zendesk — Organizing and managing your macros](https://support.zendesk.com/hc/en-us/articles/4408884166554-Organizing-and-managing-your-macros).

Intercom также позволяет искать macros по названию, совмещать search с фильтром
команды, раскладывать macros по folders и видеть число использований за 30 дней.
Название там считается главным способом найти и применить macro:
[Intercom — Creating and managing macros](https://www.intercom.com/help/en/articles/6433193-creating-and-managing-macros).

**Вывод для Lola:** убрать постоянную форму справа. Библиотека занимает всю ширину;
создание и редактирование не сжимают список.

### 2. Один шаблон должен содержать все языковые варианты

Zendesk Dynamic Content моделирует локализацию как один item: default variant плюс
варианты поддерживаемых языков. Один placeholder вставляет вариант по языку
пользователя, а при отсутствии нужного языка используется default. Изменение
оригинала помечает варианты потенциально устаревшими; вариант можно временно сделать
inactive. Источник:
[Zendesk — Providing multiple language support with dynamic content](https://support.zendesk.com/hc/en-us/articles/4408882999066-Providing-multiple-language-support-with-dynamic-content).

Shopify аналогично хранит переводы как варианты одного ресурса, различает состояния
`Translated`, `Outdated`, `Untranslated` и сохраняет связь с исходным содержимым:
[Shopify Help — Localization and translation](https://help.shopify.com/en/manual/markets/languages/manage-languages?locale=en),
[Shopify Dev — Manage translations](https://shopify.dev/docs/apps/build/markets/manage-translated-content).

**Вывод для Lola:** `language` не должен дробить библиотеку на отдельные templates.
Русский — канонический source, а `translations[locale]` — дочерние варианты одного
template с собственными статусами и source revision.

### 3. Перевод должен быть отдельным действием с видимым результатом

Shopify Translate & Adapt запускает auto-translate отдельной кнопкой; результат
появляется спустя несколько минут. Повторный запуск переводит пустые и устаревшие
поля, но не перезаписывает вручную отредактированные варианты. Shopify отдельно
рекомендует проверять машинный перевод перед публикацией:
[Shopify Help — Translate & Adapt](https://help.shopify.com/en/manual/international/translate-adapt-app).

Официальные продукты не задают универсальный wire protocol для такого job. Поэтому
следующая state machine — **рекомендованный синтез**, а не скопированный контракт:

```text
IDLE → QUEUED → RUNNING → SUCCEEDED
                   ├────→ PARTIAL
                   └────→ FAILED
```

Для каждого языка полезны состояния `pending`, `ready`, `outdated`, `failed`, а также
признак `machine` / `edited`. После изменения русского source готовые варианты не
удаляются, но становятся `outdated`; повторный job обновляет только отсутствующие,
устаревшие и failed-варианты, сохраняя ручные правки по явному правилу.

### 4. Переводы можно скрывать, но прогресс и ошибки — нельзя

Shopify рекомендует Collapsible для вторичной информации, которая не нужна постоянно,
но запрещает прятать в нём критические ошибки. Контрол должен иметь `aria-expanded`
и `aria-controls`; стандартный переход компонента — короткие 150 ms:
[Shopify Polaris — Collapsible](https://polaris-react.shopify.com/components/utilities/collapsible).

Atlassian определяет progress bar как индикатор системного процесса, tag — как
компактную категоризацию, а lozenge — как быстро распознаваемый статус:
[Atlassian Design — Progress bar](https://atlassian.design/components/progress-bar),
[Atlassian Design — Tag](https://atlassian.design/components/tag/).

**Вывод для Lola:** в спокойном состоянии показывать компактную строку
`Переводы 7 из 8` с chevron. Во время job рядом остаются spinner/progress и текст
`Переводим 4 из 8`; при partial/failed ошибка видна сразу, а раскрытие показывает
конкретные языки и retry. Цвет не является единственным носителем состояния.

### 5. В активный чат вставляется вариант языка разговора

Zendesk выбирает dynamic-content variant по языку пользователя и использует default,
если нужный язык не поддержан. Intercom Inbox Translation позволяет вручную
переопределить язык разговора и переводит ответ обратно на язык клиента:
[Zendesk — Dynamic content](https://support.zendesk.com/hc/en-us/articles/4408882999066-Providing-multiple-language-support-with-dynamic-content),
[Intercom — AI Inbox Translation](https://www.intercom.com/help/en/articles/10545610-how-to-use-ai-inbox-translations).

Intercom вставляет macro в текущую позицию composer и оставляет текст редактируемым
до отправки; Front заполняет variables данными текущего recipient/conversation:
[Intercom — Using macros in the Inbox](https://www.intercom.com/help/en/articles/6584504-using-macros-in-the-inbox),
[Front — Variables in message templates](https://help.front.com/en/articles/2306).

**Рекомендуемый resolver Lola:**

1. explicit language override разговора;
2. detected conversation language;
3. точный locale variant (`pt-BR`);
4. базовый язык (`pt`), если продукт его поддерживает;
5. русский source как явный fallback с предупреждением оператору.

Выбранный текст вставляется в composer, но не отправляется автоматически. Оператор
может персонализировать его; variables разрешаются из контекста активного чата.

## Рекомендуемая композиция Lola

### Desktop: единая библиотека

```text
Шаблоны ответов                              [Перевести всё] [+ Шаблон]
24 шаблона · 21 готовы на всех языках

[ Поиск по названию и тексту… ] [Теги] [Статус перевода] [Сортировка]

Название / preview          Теги           Переводы     Использован  Обновлён  ⋯
Возврат депозита            payments       8/8 Готово   42 раза      сегодня
Короткий preview русского…  vip
──────────────────────────────────────────────────────────────────────────────
Запрос документов           kyc             6/8 Ошибка   11 раз      вчера
Короткий preview русского…  compliance
```

- Header: title, total count, тихая aggregate coverage и две ясные actions.
- Search ищет по title и canonical body; promoted filters — максимум 2–3, как
  рекомендует [Shopify Polaris Index filters](https://polaris-react.shopify.com/components/selection-and-input/index-filters).
- Каждая row: title, максимум двухстрочный русский preview, 1–2 видимых tag плюс
  `+N`, translation coverage/status, usage, updated time, overflow actions.
- Вся строка открывает edit modal; `⋯` содержит duplicate, deactivate/delete и retry.
- Никакой сетки мини-карточек: повторяющиеся объекты лучше сравниваются в строках.

### Create/edit modal

Desktop — large modal около 720–840 px; mobile — full-screen dialog. Содержимое:

1. `Название`.
2. `Теги` и область доступности.
3. `Текст на русском` — главное и самое большое поле, с variables menu.
4. Secondary action `Перевести на языки проекта`.
5. Свернутая секция `Переводы N из M`.
6. Sticky footer: `Отмена` и `Сохранить`.

Linear использует create modal для шаблонного объекта и сохраняет draft при уходе,
а Shopify требует для modal одного фокусного действия, не более primary + secondary
в footer и корректного focus return:
[Linear — Create issues](https://linear.app/docs/creating-issues),
[Shopify Polaris — Modal](https://polaris-react.shopify.com/components/internal-only/modal).

Поэтому modal Lola не должен становиться вторым экраном администрирования: длинный
список переводов остаётся свернутым, а bulk translation живёт как durable background
job и продолжает выполняться после закрытия dialog.

### Раскрытая секция переводов

```text
Переводы 6 из 8                                      [Обновить переводы]
[████████████████░░░░] 75%

English       Готово            Изменён машинный перевод       [Открыть]
Español       Устарел           Русский текст изменён          [Обновить]
Deutsch       Переводим…                                      [spinner]
Français      Ошибка            Повторить                       [Retry]
```

Текст варианта редактируется inline после `Открыть`, но список языков не раскрывает
все большие textarea одновременно. Job status должен обновляться polling/SSE без
блокировки modal и сохраняться после reload.

### Mobile

- Один столбец; summary/count и primary action не конкурируют по горизонтали.
- Search остаётся сверху; filters открываются отдельным sheet/dialog.
- Строка превращается в compact resource card: title, preview, tags, `Переводы N/M`,
  updated; usage и редкие actions уходят в `⋯`.
- Нельзя зависеть от hover. Shopify прямо рекомендует на touch-устройствах учитывать
  placement и target size, а hover-actions оставлять desktop:
  [Shopify Polaris — Common actions](https://polaris-react.shopify.com/patterns/common-actions/best-practices).
- Create/edit — full-screen; footer остаётся sticky над safe area и экранной
  клавиатурой; translations collapsed по умолчанию.
- Проверять минимум 320, 390, 768 и 1440 px. Atlassian требует проектировать хотя бы
  для desktop и mobile и приводит отдельные grid breakpoints для 320–479 px:
  [Atlassian Design — Applying grid](https://atlassian.design/foundations/grid-beta/applying-grid/).

## Motion

Анимация нужна только чтобы объяснить изменение состояния:

- modal enter около 250 ms, exit около 200 ms;
- раскрытие translations 150 ms;
- row hover/press и success feedback 50–150 ms;
- spinner только у выполняющегося языка, determinate bar — у job с известным total;
- никаких stagger-анимаций всех rows и декоративного confetti;
- при `prefers-reduced-motion` всё становится мгновенным.

Эти интервалы соответствуют актуальной motion guidance Atlassian: frequent
interactions короче 150 ms, modal enter 250 ms, motion должен пояснять изменение и
полностью отключаться при reduced motion:
[Atlassian Design — Motion](https://atlassian.design/foundations/motion).

## Проверяемые критерии для реализации

1. В библиотеке один template отображается одной row/card независимо от количества
   языков.
2. Видны total template count, search, tags, translation coverage и updated time.
3. Create/edit не занимает постоянную колонку и открывается как modal/full-screen.
4. Canonical source — русский; языки проекта не вводятся как отдельные templates.
5. Translation job не блокирует навигацию, переживает закрытие modal/reload и даёт
   aggregate плюс per-language state.
6. Изменение русского текста делает зависимые варианты `outdated`, а не молча
   оставляет их «готовыми».
7. Translations collapsed по умолчанию; partial/failed видны до раскрытия.
8. В composer вставляется best matching variant активного разговора и остаётся
   редактируемым перед отправкой.
9. На 320/390 px нет горизонтального overflow; все ключевые действия доступны без
   hover.
10. Progress, errors, focus и reduced-motion состояния доступны с клавиатуры и
    assistive technologies.

## Итоговый verdict

Самый сильный референс — **Shopify resource index + Zendesk dynamic content +
Intercom operator macro flow**. Это даёт Lola спокойную масштабируемую библиотеку,
один объект вместо языковых дублей, предсказуемый background translation и точную
вставку варианта в контекст текущего разговора. Persistent split-view editor и
карточная россыпь здесь проигрывают: они уменьшают полезную площадь, скрывают
сравнение и плохо масштабируются и на сотни templates, и на mobile.
