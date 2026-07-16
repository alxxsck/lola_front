# Пользовательские поля и журнал событий в Lola CMS

Frontend использует контракты Lola Backend из актуального Swagger snapshot `openapi/lola-backend.json`. Клиент пересобирается через `npm run api:update`, а `npm run api:check` отдельно проверяет наличие новых CMS operations и синхронность generated‑файлов.

Backend‑контракт, правила ingestion и модель хранения подробно описаны в `Lola_backend/docs/user-attributes-and-event-logs.ru.md`. Этот документ фиксирует поведение CMS.

## Поля пользователя

Страница доступна по маршруту `/project/user-attributes` и связана с разделом «Подключение продукта» в настройках проекта.

CMS поддерживает `STRING`, `NUMBER`, `BOOLEAN` и `DATETIME`, required‑поля, `clientVisible`, порядок, включение поля, диапазоны, ограничения длины и `allowedValues`. Значения enum вводятся по одному в строке и преобразуются к типу поля до отправки. `DATETIME` проверяется как RFC 3339.

Ключ и тип нельзя изменить после создания — для миграции создаётся новое поле. При очистке существующего описания CMS отправляет `null`, чтобы backend действительно удалил текст, а не проигнорировал отсутствующее значение.

Каждая мутация публикует новую immutable schema revision. CMS использует атомарный ответ mutation endpoint (`definition + currentRevision`) и обновляет локальный список без дополнительного GET: сетевой сбой после успешной публикации не может превратить успех в ложную ошибку.

Чтение доступно участникам проекта. Кнопки создания, изменения и удаления показываются только ролям `OWNER` и `ADMIN`; backend остаётся окончательной границей авторизации.

## Журнал событий

Отдельный маршрут `/event-logs` расположен рядом с каталогом событий. Он использует только новые endpoints:

- `GET /admin/projects/{projectId}/event-logs` для списка;
- `GET /admin/projects/{projectId}/event-logs/{eventId}` для detail drawer.

Legacy `/events/admin/{projectId}` не используется новой страницей.

Фильтры отправляются на backend: event code, external user ID, source, status, received range и occurred range. Event code, source и status поддерживают множественный выбор; пустой список означает «все». Массивы сериализуются как repeated query parameters с `form + explode`, например `?status=FAILED&status=PROCESSED`. Диапазоны проверяются до запроса. Limit: 25, 50 или 100.

Пагинация cursor‑based. CMS хранит cursor начала каждой уже открытой страницы, поэтому поддерживает переходы «Назад» и «Дальше». При изменении фильтров cursor history сбрасывается. Cursor не интерпретируется и не объединяется с другим набором фильтров.

Есть два представления одной выборки:

- таблица — для плотного анализа и сравнения основных параметров;
- «Путь» — хронологическая лента. На мобильном экране она открывается по умолчанию.

Произвольный payload сокращается только в списке. Drawer запрашивает detail endpoint и показывает payload, context, processing result, ошибку, idempotency ID, server/client timestamps и ссылки на пользователя/definition. Кнопка «Открыть event» ведёт на `/events?event=<definitionId>` и автоматически открывает существующую форму события.

Журнал доступен только `OWNER` и `ADMIN`. CMS не делает list/detail запрос для других ролей и показывает понятное ограничение доступа.

## Каталог событий

Редактор event definition поддерживает `clientIngestible`. Новое событие по умолчанию недоступно для browser ingestion. В карточке события есть переход в журнал с уже установленным фильтром по event code.

## Проверки

Связанная логика покрыта тестами:

- преобразование typed constraints и RFC 3339 enum;
- сборка server filters и безопасный preview произвольного payload;
- repository mapping, cursor pagination, detail endpoint;
- публикация user attribute definition и перечитывание schema revision;
- сохранение `clientIngestible` в event DTO.

Обязательные команды перед merge: `npm run api:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
