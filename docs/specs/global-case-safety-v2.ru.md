# Global Safety v2: минимальная обязательная защита

## Решение

В Lola существует одна Global Safety Policy. Она принадлежит платформе, применяется ко всем
Projects и ко всем входящим End User сообщениям и не имеет Project-level выключателя.

Platform Operator настраивает только:

1. допущенную xAI-модель из живого серверного каталога;
2. глубину рассуждения, которую поддерживает выбранная модель;
3. причину публикации новой неизменяемой ревизии.

Сервер владеет четырьмя Risk Classes, structured-output схемой, всеми каналами, любым языком,
обязательными последствиями, лимитом ответа и fail-closed поведением. Проект настраивает только
маршрут уже выявленного риска: очередь, уведомление и передачу оператору.

## Почему текущий контракт нужно заменить

Текущий `POST /admin/platform/case-intelligence/safety/revisions` принимает classifier,
calibrator, labelled dataset и sentinel dataset revision IDs, а затем требует, чтобы эти записи
заранее существовали в `case_intelligence_component_revisions`. Публичного продуктового потока
создания этих артефактов нет. Поэтому форма не может быть корректно заполнена обычным Platform
Operator и смешивает продуктовую настройку с внутренней MLOps-инфраструктурой.

Языковые и канальные gates тоже создают ложный выбор. Safety должна проверять неизвестный язык и
новый канал по умолчанию; отсутствие строки покрытия не может быть причиной пропустить проверку.

## HTTP-контракт

### Состояние и каталог

`GET /api/v1/admin/platform/case-intelligence/safety`

Возвращает текущую ревизию в продуктовых терминах:

```json
{
  "version": 3,
  "status": "ACTIVE",
  "reconciliationState": "IDLE",
  "profile": {
    "modelId": "grok-4.5",
    "displayName": "Grok 4.5",
    "reasoningEffort": "medium"
  },
  "coverage": {
    "projects": "ALL",
    "locales": "ALL",
    "channels": ["TEXT", "VOICE", "TELEGRAM"]
  },
  "riskClasses": [
    "SELF_HARM_OR_SUICIDE",
    "CREDIBLE_THREAT_OR_VIOLENCE",
    "HARM_INVOLVING_MINORS",
    "RESPONSIBLE_GAMING_CRISIS"
  ],
  "publishedAt": "2026-08-11T10:00:00.000Z"
}
```

`GET /api/v1/admin/platform/case-intelligence/safety/models`

Использует тот же `XaiLanguageModelCatalogService` и тот же pricing catalog, что настройки моделей
Projects. Возвращает только допущенные для safety модели и поддерживаемые reasoning efforts.
`selectable=false` запрещает новую публикацию; stale-каталог разрешает только повтор текущего
профиля и не должен молча подтверждать другую модель.

### Публикация

`POST /api/v1/admin/platform/case-intelligence/safety/revisions`

```json
{
  "expectedVersion": 3,
  "idempotencyKey": "server-compatible UUID",
  "modelId": "grok-4.5",
  "reasoningEffort": "medium",
  "reason": "Переход на рекомендуемую модель безопасности"
}
```

`revisionId`, provider, `maxOutputTokens`, классы, последствия, охват и compiler revision клиент
не отправляет. Новую UUID-ревизию создаёт Postgres/Prisma. Публикация сохраняет существующие
optimistic concurrency, idempotency, MFA, аудит и reconciliation Projects.

## Хранение без миграции

Новые таблицы и столбцы не нужны. `PlatformCaseIntelligenceSafetyPolicyRevision.definition` и
`compiledPolicy` уже JSONB, а `id` уже имеет `uuid()` по умолчанию.

Новая `definition.schemaVersion = 2` хранит только Safety Model Profile. `compiledPolicy` хранит
полностью выведенный сервером runtime contract. Читатель поддерживает legacy schema v1, чтобы
существующие опубликованные ревизии продолжили работать до следующей публикации. Переписывать
старые строки или выполнять data migration не нужно.

## Runtime

Для каждого USER_MESSAGE создаётся safety analysis независимо от Project, locale и channel.
Модель обязана вернуть structured decision `CLEAR | SUSPECTED | URGENT`, канонический Risk Class,
reason code и confidence. Невалидный ответ, недоступный provider, отсутствие политики или
неизвестный исход не считаются `CLEAR`: обычный assistant release остаётся заблокированным либо
использует существующий safe fallback.

В v2 нет пользовательской «калибровки». Self-reported confidence модели сохраняется как
операционный сигнал, но UI не называет его статистически откалиброванной вероятностью. Recall,
false-negative rate и admission gates появятся только вместе с отдельным внутренним evaluation
pipeline, который сам создаёт воспроизводимые datasets и measurements.

## Изменения backend

- Расширить модельный каталог платформенным workload `SAFETY`, не смешивая его с Project settings.
- Добавить platform-scoped `GET .../safety/models` с тем же IAM permission.
- Заменить publish DTO на `modelId`, `reasoningEffort`, `reason`, concurrency и idempotency.
- В `CaseIntelligenceService` валидировать профиль по живому каталогу до транзакции и собирать
  schema v2 на сервере.
- Убрать admission зависимости публикации от `SAFETY_CLASSIFIER`, `SAFETY_CALIBRATOR` и
  `SAFETY_DATASET`. Сохранить immutable revision, hash, audit и reconciliation.
- В runtime читать v1 и v2. Для v2 не требовать locale/channel calibration cell; safety запускается
  на любом языке и канале.
- В evaluation показывать v2 safety confidence как `UNCALIBRATED`, пока нет внутреннего набора
  измерений, и не выдавать его за пройденную quality gate.
- Добавить contract, service, runtime и Postgres tests для первичной публикации, смены модели,
  stale/unavailable catalog, idempotent replay, version conflict, неизвестного locale и fail-closed.

## Изменения frontend

- Удалить поля внутренних revision IDs, datasets, locales, channels и ML thresholds.
- Загрузить состояние и safety model catalog параллельно.
- Показать один selector модели, понятный selector глубины и обязательную причину публикации.
- Показать автоматический охват и фиксированные Risk Classes только для чтения.
- Сохранить MFA, conflict refresh, unknown-outcome lookup и permission revocation flows.
- Не показывать opaque revision UUID; пользователю достаточно номера версии и даты публикации.

## Готовность

Функция готова, когда Platform Operator с нужным permission может из пустого состояния выбрать
доступный Grok, пройти MFA и одной командой активировать защиту; после этого сообщение на языке,
которого нет в Project profile, всё равно получает safety analysis, а каждый Project видит одну и
ту же platform revision.
