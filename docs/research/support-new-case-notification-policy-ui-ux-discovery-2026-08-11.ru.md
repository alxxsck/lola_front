# Ticket 38: UI/UX для уведомлений о новых обращениях

Дата: 11 августа 2026 года
Статус: read-only discovery перед frontend-реализацией

## Короткий вывод

Ticket 38 лучше реализовать не как ещё одну постоянно открытую форму, а как два
явно разделённых уровня на существующей странице уведомлений:

1. **Политика проекта** — доступна только с
   `project.support.notification_policy.manage`. На основной странице видны
   текущее состояние, период действия, охват, фактические показатели и кнопка
   «Настроить».
2. **Мои уведомления** — личные переключатели «Новые обращения», «Требует
   человека», «Назначено мне», затем готовность браузера и список устройств.

Редактирование политики стоит открыть отдельным route-level экраном, а не в
узкой боковой панели. Такой экран выдержит длинную форму, preview и mobile Back.
Главный фирменный элемент — **цепочка доставки**:

```text
Политика проекта  ×  Моя подписка  ×  Подключённый браузер  =  Доставка мне
```

Она должна быть видна и в Project summary, и рядом с личным переключателем. Это
сразу объясняет главное ограничение: Lead разрешает событие на уровне проекта,
но не включает чужую подписку и не регистрирует чужой браузер.

## Локальный baseline

- Ticket требует `OFF / IMMEDIATE / DIGEST`, `CREATED / REOPENED`, классы,
  темы, минимальный приоритет, всех подписанных сотрудников или выбранные
  команды, временное окно, impact preview и независимую личную подписку
  ([Ticket 38](../../.scratch/support-workspace/issues/38-add-new-case-notification-policy.md#L1-L33)).
- Backend теперь публикует closed DTO: режимы и scope, список доступных команд,
  effective window, digest window/limit, current/draft/restorable revisions,
  effective status, preview с оценками и пятью обезличенными примерами, metrics
  и command-result lookup
  ([DTO](../../../Lola_backend/src/modules/notifications/case-policy/support-case-notification-policy.dto.ts#L20-L347)).
- Нормативная граница продукта: `SUPPORT_CASE_CREATED`,
  `SUPPORT_CASE_ATTENTION` и `SUPPORT_CASE_ASSIGNED_TO_ME` — независимые темы;
  Project policy не меняет Case, SLA, priority, assignment или Human Escalation
  ([backend spec](../../../Lola_backend/docs/specs/support-platform/35-support-case-notification-policy.ru.md#L6-L22)).
- Текущая frontend-страница уже правильно разделяет browser permission, local
  subscription и server registration, но пока показывает только Attention и
  Assigned-to-me, а New Case называет будущей политикой
  ([текущая страница](../../src/pages/SupportNotificationSettingsPage.vue#L42-L63),
  [личные состояния](../../src/pages/SupportNotificationSettingsPage.vue#L167-L236),
  [временная заглушка](../../src/pages/SupportNotificationSettingsPage.vue#L294-L302)).
- Локальная UI-система требует workbench-tight density, 4px grid, тихие borders
  и tonal shifts, semantic tokens, 14px рабочие радиусы и минимум 44px для
  действий; decorative cards и технические ID исключены
  ([UI system](../../.interface-design/system.md#L3-L45),
  [адаптив](../../.interface-design/system.md#L102-L114)).

## Что подтверждают официальные интерфейсы

### Project policy и личная доставка — разные уровни

Atlassian разделяет team notification policy и личные правила. Даже управляемое
правило не доставляет уведомление человеку, если у него нет активного способа
связи; этот пробел показывается на личной странице уведомлений
([Atlassian role-based notifications](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-role-based-notifications/)).
Это прямой аргумент не объединять Project policy, personal preference и browser
registration в один toggle «Уведомления включены».

Slack также оставляет человеку собственное расписание и паузу уведомлений;
личное расписание может переопределить организационное значение
([Slack notification schedule](https://slack.com/help/articles/214908388-Pause-your-Slack-notifications)).
Для Lola это означает: рядом с Project state нужно писать «Разрешено политикой»,
а рядом с личной темой — «Доставка мне активна / не готова».

### Scope, действие и время читаются последовательно

Azure Monitor строит настройку alert-processing rule в понятном порядке:
scope → действие → расписание → детали → review/create; одноразовое и постоянное
окно показаны как разные варианты
([Azure alert processing rules](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-processing-rules)).
Atlassian notification policy отдельно собирает filters, временные слоты,
поведение уведомлений и только затем предлагает включить политику
([Atlassian notification policy](https://support.atlassian.com/jira-service-management-cloud/docs/create-edit-delete-a-notification-policy/)).

Для Lola не нужен тяжёлый wizard с заблокированной навигацией, но этот порядок
нужно сохранить в одной прокручиваемой форме с якорями и итоговой проверкой.

### Немедленно и сводкой — это разные последствия, а не технические enum

Grafana разделяет источник сигнала, notification policy и contact point, а
группировку и timing использует для снижения шума
([Grafana notifications](https://grafana.com/docs/grafana/latest/alerting/fundamentals/notifications/)).
GitHub прямо предлагает immediate web/email delivery либо daily/weekly digest
для security notifications
([GitHub security notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-security-notifications)).

Поэтому режимы в Lola должны называться последствиями:

- **Выключено** — новые и переоткрытые обращения не создают эту тему;
- **Сразу** — отдельное уведомление на каждое подходящее событие;
- **Сводкой** — события копятся в ограниченном временном окне и приходят группой.

`IMMEDIATE` и `DIGEST` можно оставить только как технические значения в коде.

### Разрешение браузера запрашивается после объяснения

Apple рекомендует сначала объяснить, какие уведомления приложение хочет
присылать, дать явный opt-in/out и оставить управление уведомлениями внутри
приложения
([Apple Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications)).
Текущий frontend уже следует этому принципу. Ticket 38 не должен автоматически
вызывать browser permission после publish Project policy или после включения
личной темы.

## Дизайн-направление

**Человек.** Support Lead перед запуском проекта или началом смены хочет быстро
включить наблюдение за потоком обращений, оценить шум и заранее ограничить срок.
Оператор ниже на той же странице решает только, что получать лично и готов ли
его текущий браузер.

**Задача.** Безопасно ответить на четыре вопроса: что создаёт сигнал, кому он
доступен, когда действует и сколько доставки получится.

**Ощущение.** Спокойный диспетчерский пульт: плотный, ясный, без тёмной
«технической» боковой панели и без одинаковых декоративных KPI-карточек.

**Домен.** Допуск Case, сигнал, охват, подписчик, команда, окно действия,
сводка, объём доставки, истечение, подтверждённое устройство, аудит.

**Цветовой мир.** Нейтральный canvas; белая рабочая поверхность; фирменный
синий для выбранного режима и primary action; мягкий blue tint для scheduled;
зелёный только для фактически active/ready; янтарный для expiring/incomplete;
красный только для blocking error или опасного отключения.

**Signature.** Цепочка доставки из трёх узлов с итогом. На Project surface
узлы 2–3 описываются как личные условия, не как управляемые Lead значения. В
личном блоке узлы показывают состояние текущего сотрудника.

**Отвергаем:**

- постоянно открытую форму справа → summary-first и отдельный экран редактора;
- табы без ясной модели → одна страница с двумя уровнями и заголовками
  «Политика проекта» / «Мои уведомления»;
- четыре равноправные KPI-карточки → одна смысловая формула impact и компактные
  вторичные факты;
- тёмный preview в светлой теме → обычная светлая elevated surface на тех же
  semantic tokens;
- скрытие формы без объяснения → conditional fields с короткой причиной.

### Обязательный checkpoint компонентов

```text
Intent:     Lead оценивает риск шума и включает ограниченную Project policy;
            сотрудник отдельно управляет личной доставкой.
Hierarchy:  effective Project state и ожидаемый impact — focal; детали scope
            и audit — второй уровень; технические версии скрыты.
Palette:    semantic neutral + один brand accent; status colors только по смыслу.
Depth:      тихие borders + tonal shifts, без декоративных теней внутри.
Surfaces:   canvas → section → inset control/preview; popover/dialog на один
            уровень выше.
Typography: текущая CMS typography; иерархия весом/цветом, числа tabular.
Spacing:    4px grid; 8/12/16px внутри, 24/32px между крупными областями.
```

## Информационная архитектура

### Основной route `/support/settings/notifications`

1. **Header:** «Уведомления поддержки», Project context, «Обновить».
2. **Политика проекта** — рендерится только при exact permission:
   - статус `Выключена / Запланирована / Активна / Срок истёк`;
   - режим `Сразу / Сводкой`;
   - начало и окончание человеческой фразой с timezone;
   - охват: новые/переоткрытые, классы, темы, минимум priority;
   - получатели: все подходящие подписчики или выбранные команды;
   - delivery equation и короткая фактическая метрика;
   - primary «Настроить», secondary «Отключить» при active/scheduled,
     «Восстановить» рядом с историей.
3. **Мои уведомления:** три независимые строки с toggle и честным состоянием
   доставки.
4. **Готовность этого браузера:** существующие permission/subscription/server
   registration states.
5. **Мои браузеры:** существующий список устройств.

Если manage permission нет, Project section отсутствует целиком, но личный
раздел остаётся полноценным. Нельзя показывать disabled admin controls или
намекать на название роли.

### Editor route `/support/settings/notifications/new-cases`

Кнопка «Настроить» открывает отдельный экран. Browser Back и явная «Назад к
уведомлениям» возвращают на summary без потери уже подтверждённого server draft.
Верхняя status strip показывает «Редактируется черновик» и основу опубликованной
ревизии человеческим текстом.

Форма идёт в одном порядке:

1. **Как отправлять** — radio cards `Выключено / Сразу / Сводкой`.
   `Сводкой` раскрывает «Интервал сводки» и «Не больше событий в одной сводке».
2. **О каких событиях** — «Новое обращение» обязательно, «Переоткрытое
   обращение» опционально; классы, темы и минимальный priority ниже.
3. **Кому** — «Всем подписанным сотрудникам» или «Подписанным сотрудникам из
   выбранных команд». Team picker использует только `available-teams`; рядом
   постоянная подпись: «Политика не подписывает сотрудников автоматически».
4. **Когда** — «Постоянно» или «В период»; start/end в локальном timezone,
   ниже вычисленная строка «Начнёт действовать … / завершится …».
5. **Причина изменения** — 3–500 символов, написанная для audit, не как
   технический комментарий.
6. **Проверка влияния** — server preview, затем сохранение черновика и publish.

`OFF` не должен оставлять видимый активный scope. При выборе «Выключено» поля
scope скрываются, а короткий текст объясняет, что Attention и Assigned-to-me
продолжат работать независимо.

## Preview: не маленький виджет, а доказательство изменения

На desktop preview занимает правые 4 из 12 колонок редактора и остаётся sticky
только внутри экрана. На tablet/mobile он становится полноценным блоком после
формы. Цвет поверхности совпадает с темой страницы.

Верхний результат собирается в одну формулу:

```text
За последние 7 дней
42 подходящих события × 8 доступных подписчиков → около 336 уведомлений
```

Для digest формула меняется на «42 события → около N окон сводки». Числа —
tabular; подпись всегда говорит «оценка по последним 7 дням», а не обещает
будущую доставку.

Ниже:

- `Можно публиковать / Нужно исправить`;
- errors/warnings с переходом к связанному полю;
- до пяти обезличенных примеров: событие, класс, тема, приоритет, время;
- явная строка expiry;
- reminder: фактическая доставка зависит от personal subscription, active
  membership, Case authority и registered device.

Preview инвалидируется при любом изменении формы. Старые числа остаются
визуально приглушёнными с подписью «Настройки изменились — проверьте снова», а
publish блокируется до нового server preview.

## Действия и publishing flow

- Bottom action bar: «Назад», «Сохранить черновик», «Проверить влияние»;
  «Опубликовать» доступно только для сохранённого актуального draft и
  `publishable=true`.
- Publish confirmation — небольшой PrimeVue `Dialog`, не повторяющий всю форму.
  Он показывает режим, охват, получателей, период, impact formula и обязательное
  подтверждение действия.
- Disable и restore всегда требуют reason. Не прятать отключение рядом с
  primary publish; использовать danger outlined и отдельное подтверждение.
- После command timeout UI не сообщает успех. Показывается состояние
  «Проверяем результат…», затем `command-result`; если результат не найден —
  точное повторение той же операции с тем же idempotency key.
- При version conflict draft ввода остаётся на экране; authoritative state
  перечитывается, пользователю предлагается сверить изменения, а не начинать
  заново.

## Desktop, tablet, mobile

### Desktop, `≥ 1100px`

- Summary: 12 колонок, policy state 7/12, delivery equation/impact 5/12.
- Editor: form 7/12, preview 5/12; max content width около 1120–1200px.
- Fields в строке только когда их смысл равноправен: start/end, digest interval/
  limit. Helper/error reserve space inside field group; соседние input baselines
  не должны прыгать.

### Tablet, `760–1099px`

- Одна колонка; compact anchor navigation сверху (`Как отправлять`, `События`,
  `Получатели`, `Период`, `Проверка`).
- Preview следует после формы, action bar остаётся внизу viewport.
- Team picker и date/time занимают полную ширину; не делать desktop sidebar уже.

### Mobile, `< 760px`

- Route stack, не сжатый desktop. Header — back, title, effective status.
- Radio cards, checkbox rows и team choices занимают всю ширину; target не менее
  44px.
- Start и end идут вертикально, timezone остаётся видимым.
- Safe examples превращаются из таблицы в список label/value.
- Bottom actions идут в две строки: primary full width, secondary ниже или в
  overflow menu; контент получает safe bottom padding.
- Не допускаются horizontal scroll, обрезанные topic codes и скрытая кнопка
  publish при mobile keyboard.

При 200% zoom экран должен перейти в одно-колоночную компоновку; WCAG Reflow
требует обходиться без двухмерной прокрутки при узком viewport
([W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).

## Состояния, которые надо спроектировать до happy path

| Состояние                            | Что показывает UI                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Loading                              | Skeleton повторяет будущие policy rail, topic rows и browser readiness, без скачка высоты. |
| Нет policy                           | «Уведомления о новых обращениях выключены» + «Настроить»; не error.                        |
| Draft есть                           | Отдельный neutral badge «Есть несохранённый/неопубликованный черновик» и «Продолжить».     |
| Scheduled                            | Точное начало, timezone и countdown без постоянной анимации.                               |
| Active                               | Зелёный status только если policy реально effective; не означает личную доставку.          |
| Expired                              | Янтарный neutral state, период и «Настроить новый срок»; личные темы не меняются.          |
| Personal topic on, browser not ready | «Выбрано, но браузер не подключён», recovery CTA к browser section.                        |
| Browser denied/unsupported           | Существующее честное browser state; без повторного автоматического permission prompt.      |
| Preview stale                        | Старые оценки приглушены, publish blocked, «Проверить снова».                              |
| Validation issue                     | Human copy рядом с полем + общий список с jump-to-field.                                   |
| `409` conflict                       | Сохранить local input, перечитать server version, предложить сверку.                       |
| Unknown command outcome              | Lookup по operation + idempotency key; до результата конкурентные действия заблокированы.  |
| Permission revoked                   | Немедленно скрыть Project editor, очистить draft/preview/team cache, refresh auth context. |
| Metrics unavailable                  | Policy остаётся управляемой; метрики показывают «Сейчас недоступны», не нули.              |

Backend issue codes нужно перевести в действия: неверный период, нужна команда,
команда недоступна/не найдена, тема недоступна, неверная настройка сводки, канал
недоступен, лишний scope при выключенной policy. Path используется для
focus/jump, но не показывается пользователю.

## Accessibility и формы

- Использовать PrimeVue `RadioButton`, `Checkbox`, `Select/MultiSelect`,
  `DatePicker`, `InputNumber`, `Textarea`, `Button`, `Dialog`, `Message` вместо
  ручных clickable div.
- Связанные группы оформлять через `fieldset/legend`; каждому input — label и
  описывающий helper/error ID. W3C отдельно рекомендует labels, fieldsets,
  instructions и простые короткие формы
  ([W3C Forms Tutorial](https://www.w3.org/WAI/tutorials/forms/)).
- Ошибка содержит текст и понятное исправление возле поля; success/overall
  result объявляется через `role=status`, blocking publish failure — через
  alert. W3C требует сообщать и общий исход, и inline feedback
  ([W3C User Notification](https://www.w3.org/WAI/tutorials/forms/notifications/)).
- Publish/disable dialog: focus внутрь при открытии, Tab trap, Escape, видимая
  Cancel, возврат focus в trigger
  ([WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)).
- Цвет не единственный признак: status всегда имеет текст и icon. Preview metrics
  имеют accessible names, динамическое обновление не должно быть chatty.

## Motion и perceived performance

- Раскрытие conditional fields: 180ms opacity + translateY 4px,
  `cubic-bezier(0.23, 1, 0.32, 1)`; не анимировать height всего экрана.
- Preview update: skeleton только в числах и примерах; форма остаётся доступной.
  Новый результат появляется через 140–180ms opacity.
- Delivery equation: при изменении личного состояния обновляется только
  соответствующий узел и итог, без постоянного pulse.
- Publish/disable confirmation: стандартная PrimeVue Dialog transition;
  button press 100–140ms scale до 0.97.
- `prefers-reduced-motion`: убрать translate/scale и оставить мгновенное
  состояние или короткую opacity-смену.
- Не запускать preview на каждый keypress. Запуск явной кнопкой; локальная
  validation мгновенная, server preview — cancellable single-flight. Списки
  команд пагинируются server cursor и кэшируются только внутри Project/permission
  scope.

## Проверочный сценарий frontend

1. Пользователь без manage permission видит только личные настройки и браузеры.
2. Lead открывает policy summary, создаёт temporary IMMEDIATE policy, выбирает
   CREATED/REOPENED, команды и период.
3. Preview показывает estimates и только обезличенные примеры; изменение поля
   делает preview stale.
4. Draft сохраняется, publish confirmation повторяет impact и expiry, после
   publish summary показывает authoritative status.
5. Та же policy в DIGEST показывает interval/max-items и digest estimate.
6. Project policy active, личная тема выключена: delivery equation честно
   показывает «Мне не доставляется».
7. Личная тема включена, browser denied/unregistered: UI не показывает active
   delivery и ведёт к recovery.
8. CREATE и последующий Human Escalation приходят как разные темы; обычное
   Message/ATTACH/correction не создаёт повторный New Case signal.
9. Expiry прекращает новые New Case notifications, не меняя Attention,
   Assigned-to-me, Case или историю.
10. Проверены desktop/tablet/mobile, keyboard-only, 200% zoom, light/dark,
    reduced motion, axe, `409`, timeout lookup и permission revoke.

## Итоговая рекомендация

Сохранить один navigation item «Уведомления», но внутри провести непрерывную
границу между Project policy и личной доставкой. На основном экране — обзор и
фактическая готовность; сложное редактирование — отдельным route-level экраном;
preview — крупный, светлый и непосредственно перед publish. Delivery equation
должна стать узнаваемым паттерном Ticket 38 и снять главную UX-ошибку: «Lead
включил policy» не равно «каждый сотрудник уже получает push».
