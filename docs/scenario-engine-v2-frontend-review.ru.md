# Проверка первых срезов frontend Scenario Engine V2

Дата: 18 июля 2026 года. Документ хранит результаты ревью FE-V2-01/02; актуальное состояние Audience и финальных срезов описано отдельно в `scenario-engine-v2-audience-unblock.ru.md`.

## Границы проверки

Проверены два реализованных среза: FE-V2-01 (contract foundation) и FE-V2-02 (Event Payload Studio). Работа не выдаёт FE-V2-03–13 за готовые функции. Rule Builder, Goal/Deadline, Delivery Policy, Preview/Publish Studio и Run Explain остаются отдельными tickets из backend-плана.

Источники требований:

- `docs/specs/scenario-engine-v2-frontend.ru.md` в backend;
- `docs/scenario-engine-v2-frontend-interface-design.ru.md`;
- `docs/scenario-engine-v2-frontend-backend-gaps.ru.md`;
- `docs/research/frontend-scenario-builder-ux.md`;
- tickets `01-contract-foundation.md` и `02-event-payload-studio.md`.

## Что изменилось после ревью

Первый вариант Event editor был технически рабочим, но заставлял администратора разбираться с `wire key`, JSON enum, stable key и английскими ошибками Ajv. Всё находилось в одном длинном dialog. Такой интерфейс сохранял контракт, но не выполнял продуктовую задачу "настроить событие без написания кода".

Теперь форма разбита на четыре шага:

1. "Смысл" — название, описание, источник и влияние на Activity Day;
2. "Данные" — визуальная настройка полей;
3. "Пример" — готовый пример и необязательная проверка JSON от разработчика;
4. "Изменения" — semantic diff и явное подтверждение новой опубликованной версии.

Основной путь использует русские названия типов и обычные поля формы. Допустимые значения вводятся по одному в строке. Stable field key показывается как read-only техническая справка и не может случайно измениться при rename. Raw JSON остался в отдельном режиме для разработчика.

Advanced mode больше не применяет текст сразу. Сначала он парсит и компилирует schema, затем показывает semantic diff. Кнопка применения появляется только после успешной проверки. Пока этот режим открыт, визуальные поля скрыты, поэтому старый JSON snapshot не может затереть параллельные изменения формы.

Неприменённый JSON нельзя потерять незаметно: переход на другой шаг и закрытие формы требуют явного подтверждения. Результат проверки примера сбрасывается после любого изменения schema. Визуальная форма не предлагает строковые варианты для числовых полей и блокирует несовместимые enum/range constraints.

## Исправленные дефекты

- UI row id теперь всегда отдельный и уникальный. Повторяющийся `x-lola-field-key` больше не ломает Vue keys и не приводит к изменению двух строк одновременно.
- Catalog field связывается по `fieldKey`. Fallback по path разрешён только для старого поля без stable identity.
- Capability summary разделяет два контекста: поле trigger Event и фильтр/расчёт по истории.
- Невалидная advanced schema остаётся в редакторе с понятной ошибкой и не заменяет draft.
- Ошибки sample validation переведены в формат "что ожидалось / что получено / как исправить".
- Ошибки формы получают focus; field issue связан с control через `aria-invalid` и `aria-describedby`.
- После добавления поля focus переходит в новую строку. После удаления возвращается к соседнему полю.
- Мобильный dialog действительно полноэкранный. Изначально scoped CSS не срабатывал из-за PrimeVue Teleport; правило перенесено в глобальный стиль для `.event-dialog`.
- OpenAPI gate теперь проверяет не только operationId и top-level DTO, но и publish concurrency fields, catalog field capabilities, Rule AST discriminator, Delivery Policy union и `countsAsActivity`.

## Проверки

| Контур | Проверка |
| --- | --- |
| Schema model | lossless round-trip, opaque nodes, orphan `required`, unique UI identity, sample validation, semantic diff |
| Capability adapter | exact revision binding, fieldKey/path mismatch, раздельные current/history capabilities |
| Component | визуальное редактирование, string choices без JSON, advanced validate/diff/apply/discard, сброс устаревшей sample-проверки, focus после add/delete |
| Page | четыре шага, блокировка неполного первого шага, update payload с `countsAsActivity` |
| Browser | desktop; 390×844 и 320×700; keyboard focus; Advanced error; отсутствие console warnings/errors |
| Reflow | viewport и document scrollWidth совпадают: 390/390 и 320/320; dialog занимает полный viewport |
| Реальный backend | login → create revision 1 → update revision 2 → catalog → DELETE cleanup |
| Build gates | `api:check`, typecheck, lint, Vitest, production build |

Backend acceptance подтвердил сохранение `countsAsActivity`, enum, stable field keys, semantic type, unit и неизвестного root keyword. Create request не отправлял `version`. Временный Event удалён штатным endpoint. Backend-файлы не менялись.

## Что всё ещё ограничено backend

BE-FE-03 не даёт надёжную current-head identity и provenance Event Definition. Поэтому frontend не группирует revisions по `code` и не угадывает managed state по префиксу `lola.*`.

BE-FE-04 не даёт revision history, compatibility и impact API. Локальный diff показывает, что изменил администратор, но не обещает совместимость внешних producers или опубликованных сценариев.

На момент этого ревью Audience блокировали BE-FE-05/06. Позже backend добавил нужный контракт, а frontend реализовал FE-V2-12/13. Контекстная матрица BE-FE-08A по-прежнему остаётся в единственном contract adapter.
