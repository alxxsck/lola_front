# Запуск AI-расходов и пользовательских лимитов

Этот чек-лист нужен для первого production-запуска и повторного развёртывания после изменений
allowance. Backend выкатывается раньше frontend: новый интерфейс читает project policy и баланс
пользователя одновременно и отклоняет ответ, если версии не совпадают.

## 1. Проверить код и контракт API

Backend:

```bash
npm ci
npm run prisma:generate
npm run lint
npm run format:check
npm test
npm run test:release:startup
```

Frontend после обновления backend OpenAPI:

```bash
npm ci
npm run api:sync:local
npm run lint
npm run typecheck
npm test
npm run build
```

`api:sync:local` меняет committed OpenAPI contract и generated client. Если команда показала diff,
его нужно проверить и включить в тот же релиз. Нельзя выкатывать frontend с контрактом от другой
версии backend.

## 2. Настроить backend в Render

Денежные лимиты пользователей не задаются через env. В env находятся тарифы провайдеров,
предохранители и параметры фоновых worker. Сами планы, назначения и начисления хранятся в БД и
редактируются в CMS.

Для безопасного первого запуска нужны такие значения:

```dotenv
AI_PRICING_CATALOG_SYNC_ENABLED=true
AI_ALLOWANCE_EMERGENCY_DISABLED=true
AI_ALLOWANCE_HARD_ENFORCEMENT_APPROVED=false
AI_ALLOWANCE_ACCRUAL_CONSUMER_ENABLED=false
AI_ALLOWANCE_END_USER_EXACT_USD_VISIBLE=false

AI_ALLOWANCE_RECONCILE_INTERVAL_MS=30000
AI_ALLOWANCE_RECONCILE_STALE_AFTER_MS=600000
AI_ALLOWANCE_RECONCILE_BATCH_SIZE=100
AI_ALLOWANCE_RECONCILE_CLAIM_LEASE_MS=60000
AI_ALLOWANCE_RECONCILE_UNKNOWN_RETRY_MS=900000

AI_COST_PROJECTION_RECONCILE_INTERVAL_MS=300000
AI_COST_PROJECTION_DEEP_RECONCILE_INTERVAL_MS=86400000
AI_COST_PROJECTION_RECONCILE_BATCH_SIZE=10
AI_COST_REPORT_MAX_FACT_ROWS=250000
```

`AI_PRICING_CATALOG_JSON` также обязателен. Его `version` меняется при изменении тарифов. Старую
версию нельзя переписывать задним числом.

`AI_ALLOWANCE_EMERGENCY_DISABLED=true` не отключает учёт. Reservations, settlement, overage и
reconciliation продолжают работать, но исчерпание квоты не блокирует AI. Это правильное состояние
для первого запуска.

`AI_ALLOWANCE_ACCRUAL_CONSUMER_ENABLED=false` останавливает только автоматические бонусы по
событиям. Ручное начисление из CMS продолжает работать.

### Если статистика показывает `STALE` или `SERVICE_UNAVAILABLE`

Новые usage records обновляют cost projection в той же транзакции. Полная пересборка нужна для
старой истории, смены timezone или найденного drift.

В текущей реализации repair запускается только при:

```dotenv
AI_COST_PROJECTION_REBUILD_ENABLED=true
```

Для проекта с небольшим объёмом истории флаг можно включить, дождаться состояния `FRESH` и
проверить нагрузку на PostgreSQL. Большой backlog сначала прогоняется на production-like snapshot:
rebuild перечитывает историю проекта целиком. Отключённый флаг не ломает запись новых расходов, но
не ремонтирует уже найденный drift.

## 3. Применить миграции и запустить backend

Render должен запускать backend через:

```bash
npm run start:deploy
```

Команда сначала выполняет `prisma:migrate:deploy`, затем запускает приложение. Traffic нельзя
переключать на новую версию, если миграции или startup validation завершились ошибкой.

После старта проверить логи pricing catalog sync, allowance reconciliation worker и cost projection
worker. В логах не должно быть циклических startup failures или постоянного drift одного проекта.

## 4. Настроить права CMS

Для просмотра карточки пользователя достаточно:

```text
project.ai_usage.read
project.ai_allowance.read
```

Изменяющие действия выдаются отдельно:

```text
project.ai_allowance.manage
project.ai_allowance.grant
project.ai_allowance.reconcile
```

`manage`, `grant` и `reconcile` не должны автоматически следовать из права чтения. После изменения
роли оператору нужно обновить auth context или войти заново.

## 5. Создать project policy

В CMS открыть `Расходы AI → Лимиты` и выполнить по порядку:

1. Задать timezone проекта.
2. Создать базовый план с суммой в USD и периодом `DAY` или `MONTH`.
3. Назначить этот план проектным default.
4. Проверить responsibility и cap каждой категории расходов.
5. Начать с режима `SHADOW`.
6. Проверить тексты предупреждения и исчерпания лимита.

В той же форме `Изменить базовый план` настраиваются:

- `Предупреждение (<locale>)` — событие LOW после пересечения порога для каждой локали из
  `supportedLocales` проекта;
- `Лимит исчерпан (<locale>)` — текст HARD-отказа до вызова AI provider для каждой проектной
  локали;
- `Fallback` — нейтральный текст, если для locale пользователя нет отдельной версии;
- `Сбросить ... на системный текст` — явное удаление сохранённой настройки;
- `Показывать End User точную оставшуюся квоту в USD` — проектная половина
  двухключевого privacy gate.

Backend сначала определяет Delivery Locale по опубликованному внутреннему профилю End User, затем
по legacy locale и только потом по default locale проекта. Для текста он ищет точную BCP-47
локаль, вариант того же основного языка и project default. Если ни один локализованный вариант не
подошёл, используется `Fallback`; если проектный текст сброшен или не задан — встроенный системный
текст. Выбранная локаль, источник и причина fallback сохраняются в журнале для аудита.

Без подходящего назначения новый период пользователя не получает базовое начисление. В карточке
будет `0,00 $`. Если policy выключена, пользователь при этом может продолжать пользоваться AI;
карточка прямо показывает, что блокировка не действует.

Период создаётся лениво при первой операции, которая списывается с End User allowance. До этого
карточка показывает ожидаемое начисление и сообщение `Период ещё не создан`.

## 6. Настроить frontend в Vercel

Production frontend запускается только в API-режиме:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=https://api.example.com
```

`VITE_API_BASE_URL` указывает на origin backend. Клиент принимает старое значение с `/api/v1`, но
для новых окружений лучше хранить только origin. Backend CORS и cookie settings должны разрешать
production-домен CMS.

В Vercel открыть `Project Settings → Environment Variables` и добавить оба значения минимум для
`Production` (обычно также для `Preview`). После изменения выполнить redeploy: переменные Vite
встраиваются в bundle во время build и не меняются в уже опубликованном артефакте.

Vercel выполняет `npm run build` из `vercel.json`. На Vercel эта команда fail-closed: сборка
остановится, если `VITE_DATA_MODE` не равен `api`, API URL отсутствует, использует HTTP или указывает
на localhost. Команда также проверяет OpenAPI drift, TypeScript и production bundle; публикуется
только каталог `dist/`.

Публичный production alias CMS — `https://lola-front.vercel.app`. Уникальный deployment URL может
быть закрыт Vercel Authentication; это не означает, что production alias недоступен.

### Как показать лимит самому End User

Одновременно нужны два разрешения:

1. Backend env `AI_ALLOWANCE_END_USER_EXACT_USD_VISIBLE=true` с последующим redeploy backend.
2. В CMS `Расходы AI → Лимиты → Изменить базовый план` включить
   `Показывать End User точную оставшуюся квоту в USD` и сохранить новую ревизию.

Клиентский widget/приложение End User читает `GET /api/v1/users/me/ai-allowance`. Endpoint всегда
возвращает `status`, `resetAt` и `exactUsdVisible`; денежные поля `availableUsd`, `usedUsd`,
`reservedUsd`, `unknownHeldUsd` появляются только при обоих разрешениях. CMS не является
End User widget: карточка в профиле оператора и self endpoint — разные интерфейсы.

Если точные суммы не нужны, оставьте deployment gate `false`: пользователь всё равно получит
статус `AVAILABLE/LOW/EXHAUSTED` и настроенное сообщение, но не увидит внутреннюю USD-квоту.

### Обязательный GitHub Actions secret

Workflow сверяет frontend с конкретным backend checkout. В GitHub открыть
`Settings → Secrets and variables → Actions` и создать repository secret
`LOLA_BACKEND_READ_TOKEN`: fine-grained token с read-only `Contents` к `alxxsck/lola_back`.
Repository variable `LOLA_BACKEND_REF` должна содержать 40-символьный SHA backend-релиза, а не
плавающий branch. После изменения перезапустить workflow `OpenAPI contract`.

### Обязательная защита production promotion в Vercel

Одного успешного Vercel build недостаточно: production alias должен назначаться только после
GitHub-проверок того же commit. В `Project Settings → Build and Deployment → Deployment Checks`
нажать `Add Checks`, выбрать GitHub checks и сделать обязательными для `Production`:

```text
OpenAPI contract / frontend-quality
OpenAPI contract / verify
```

Проект должен быть подключён через Vercel for GitHub, а automatic production aliasing — включён.
После сохранения создать новый production deployment: до завершения обоих checks он остаётся
готовым, но не получает production domain. `Force Promote` допустим только как журналируемое
аварийное исключение. Если имя job в workflow меняется, соответствующий Deployment Check нужно
обновить; одинаковые имена jobs в разных workflows использовать нельзя.

Источник: актуальная документация Vercel `Deployment Checks` —
https://vercel.com/docs/deployment-checks.

## 7. Smoke-проверка после deploy

Проверка выполняется на одном тестовом End User:

1. Открыть `Расходы AI`. Overview должен загрузиться без `SERVICE_UNAVAILABLE`, projection status —
   `FRESH`.
2. Открыть `Пользователи`, затем баланс выбранного пользователя.
3. Открыть того же пользователя в разделе `Пользователи`. В профиле должны быть две независимые
   карточки: фактическое потребление и лимит расходов.
4. Начислить небольшую дополнительную квоту и повторить запрос с тем же idempotency key. Второй
   запрос не должен создать второй grant.
5. Выполнить один дешёвый AI-запрос.
6. Проверить появление reservation и последующего settlement в журнале, а также cost record в
   статистике.
7. Убедиться, что после начисления или назначения сумма в карточке профиля обновилась без закрытия
   профиля.
8. Открыть журнал из карточки. Он должен появиться поверх профиля пользователя, не переводя
   оператора на другой раздел CMS.
9. Убедиться, что сумма в профиле совпадает с детальным allowance-диалогом.

Если на карточке `0,00 $`, сначала смотреть режим контроля и наличие project default. Сам по себе
ноль не доказывает, что AI должен быть заблокирован.

## 8. Включать блокировку отдельно

Rollout проходит последовательно:

```text
SHADOW → SOFT → HARD на canary-проекте → HARD для остальных проектов
```

Для настоящего `HARD` одновременно нужны:

```dotenv
AI_ALLOWANCE_EMERGENCY_DISABLED=false
AI_ALLOWANCE_HARD_ENFORCEMENT_APPROVED=true
```

и project policy `HARD` в CMS. Одного env или одной policy недостаточно. Перед переключением
проверить quote coverage, overage, unknown holds, зависшие reservations и время reconciliation.

Быстрый rollback блокировки: вернуть `AI_ALLOWANCE_EMERGENCY_DISABLED=true` и перезапустить backend.
Учёт расходов сохранится, а новые AI-операции перестанут отклоняться из-за исчерпанной квоты.

## 9. Ограничение текущего admin API

Баланс пользователя возвращает персональное назначение `END_USER`, но пока не возвращает точный
источник эффективного назначения `SEGMENT` или `LEVEL` и последние решения об отказе. Поэтому CMS
не приписывает пользователю выдуманный default: она отдельно показывает персональный план,
базовый план проекта, фактический период и точную закреплённую ревизию категорий.

Чтобы показывать точный уровень/сегмент и список последних блокировок, backend должен расширить
admin balance read model полями `effectiveAssignment` и `recentDecisions` (или отдельным
пагинируемым endpoint). Это не мешает запуску учёта, ограничений, начислений и immutable-журнала,
но эти два блока нельзя считать реализованными только средствами frontend.

Текущий endpoint ручного начисления также не принимает отдельный `internalReference`. CMS уже
показывает preset срока, exact preview и success receipt, а reason требует 10–500 символов. Если
внутренняя ссылка нужна как отдельное индексируемое поле, её следует добавить в DTO, таблицу grant,
journal entry и idempotency payload; складывать её внутрь reason нельзя.

Command response начисления возвращает атомарный `new available`, но не возвращает
`previousAvailableUsd` из locked-транзакции. Поэтому CMS не выдаёт клиентский snapshot за часть
финансового receipt: показывает `new available` из ответа команды, а значение при открытии формы —
отдельно и с пометкой «справочно». Для полной пары `previous → new` backend command receipt должен
явно вернуть оба поля; получать `previous` вычитанием или последующим refetch небезопасно при
параллельных расходах и replay.
