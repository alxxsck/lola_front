# Text-to-Speech в Lola CMS

Обычная команда `SPEAK_TEXT` синтезируется через ElevenLabs `eleven_v3`. Этот поток отделён от голосовых сессий xAI/Grok: изменение TTS-голоса, языка или voice settings не меняет голосовой чат и модель `grok-voice-think-fast-1.0`.

## CMS API

- `GET /api/v1/admin/projects/{projectId}/speech-synthesis` — сохранённые overrides, состояние интеграции, server defaults и capabilities;
- `PATCH /api/v1/admin/projects/{projectId}/speech-synthesis` — controlled merge только TTS-настроек;
- `GET /api/v1/admin/projects/{projectId}/speech-synthesis/voices` — актуальные default voices ElevenLabs и явно назначенные проекту голоса с `search`, `limit` и cursor pagination;
- `GET /api/v1/admin/projects/{projectId}/ai-usage` — токены xAI, символы и billed units ElevenLabs, estimated/billed cost.
- `GET /api/v1/admin/provider-billing/elevenlabs` и `POST .../sync` — workspace usage/subscription snapshot только для platform admin; эти данные не распределяются искусственно по проектам.

OpenAPI snapshot хранится в `openapi/lola-backend.json`, клиент и DTO генерируются в `src/shared/api/generated`. Ручное редактирование generated-файлов не допускается.

## UI и сохранение

Text-to-Speech имеет отдельную форму и отдельную кнопку сохранения. Общий Project PATCH продолжает сохранять `settings` проекта, включая описание, подключение и голосовые настройки Grok. Backend игнорирует только входящий `settings.speechSynthesis` и сохраняет его актуальную DB-версию: изменить этот блок можно исключительно через dedicated TTS endpoint. Селект загружает первую страницу из 20 голосов, включая server default и назначенные проекту голоса; ElevenLabs API key не попадает в браузер.

CMS показывает только настройки, опубликованные в `integration.capabilities.settings`, и использует переданные backend диапазоны. Текущий контракт включает:

- `voiceId`: голос из общего или project-specific allowlist; `null` включает server default;
- `languageOverride`: двухбуквенный ISO 639-1; `null` включает auto-detection;
- `stability`: `0..1`.

Темп и манера речи для `eleven_v3` задаются audio tags в тексте. `similarityBoost`, `style`, `speed`, `seed`, `applyTextNormalization` и `applyLanguageTextNormalization` не входят в публичные настройки CMS и не отправляются провайдеру.

Если backend возвращает `configured: false`, форма остаётся видимой для диагностики, но сохранение блокируется. API key никогда не передаётся браузеру.

## Usage

ElevenLabs не возвращает token usage, поэтому CMS показывает `inputCharacters` и официальный response header `character-cost` как `providerBilledUnits` отдельно от токенов xAI. ElevenLabs-only график автоматически открывается на «Символах», а строка модели не показывается как `0 tokens`. Для ElevenLabs backend выставляет `costStatus=PROVIDER_REPORTED_USAGE`, а `estimatedCost` и `billedCost` оставляет `null`: invoice-exact сумму отдельного TTS-запроса провайдер не сообщает.

Для Grok backend сохраняет точную стоимость из `cost_in_usd_ticks` в `billedCost`, а стоимость Voice рассчитывает по длительности отправленного и полученного аудио и записывает в `estimatedCost`. CMS складывает обе части в итогах и графиках и отдельно предупреждает, что Voice рассчитан по публичному тарифу xAI Realtime. ElevenLabs по-прежнему учитывается через `providerBilledUnits`, потому что провайдер не сообщает точную USD-сумму отдельной TTS-операции. Workspace credits, subscription limits и overage доступны только в отдельном platform-admin billing snapshot и не прибавляются к расходам проекта.
