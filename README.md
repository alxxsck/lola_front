# Lola CMS

Практическое руководство по CMS-пользователям, ролям, Initial Access Secret и IAM API находится в
[документации backend](https://github.com/alxxsck/lola_back/blob/main/docs/cms-users-roles-access-guide.ru.md).

Документация графового редактора сценариев: [docs/scenario-graph-editor.ru.md](docs/scenario-graph-editor.ru.md). Настройка пользовательских атрибутов и новый журнал событий описаны в [docs/user-attributes-and-event-logs.ru.md](docs/user-attributes-and-event-logs.ru.md). Реализованная часть Scenario Engine V2 и границы следующих этапов зафиксированы в [docs/scenario-engine-v2-frontend-review.ru.md](docs/scenario-engine-v2-frontend-review.ru.md).

Typed Audience, versioned Segments и snapshot/recheck semantics FE-V2-12/13 описаны в [docs/scenario-engine-v2-audience-unblock.ru.md](docs/scenario-engine-v2-audience-unblock.ru.md).

Административная SaaS-панель для настройки Lola AI Assistant. Это отдельное Vue 3 приложение, которое работает поверх Lola Backend и не входит в пользовательский SDK.

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run dev
```

По умолчанию приложение безопасно запускается в `api`-режиме. Demo-данные включаются только явно через `VITE_DATA_MODE=mock`. Для подключения существующего backend:

```env
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

CMS авторизуется через пользовательский JWT flow: access token хранится только в памяти, а refresh
capability — только в `HttpOnly; Secure; SameSite=Strict` cookie и недоступна JavaScript-коду.

## Команды

- `npm run dev` — dev server;
- `npm run build` — обязательная проверка committed OpenAPI contract, type-check и production build;
- `npm run typecheck` — TypeScript/Vue проверка;
- `npm run lint` — ESLint;
- `npm test` — Vitest.
- `npm run test:e2e` — Playwright-проверки основных маршрутов в mock-режиме на desktop и mobile, включая axe;
- `E2E_LOGIN=... E2E_PASSWORD=... npm run test:e2e:api` — тот же браузерный smoke-тест против реального backend;
- `npm run api:check` — standalone-проверка committed OpenAPI artifact, его SHA-256 metadata и generated client;
- `npm run api:sync:local` — явно экспортировать контракт из соседнего `../Lola_backend`, одновременно обновить artifact, digest metadata и generated client.

## OpenAPI contract gate

Production/Vercel build не обращается к сети и не ищет backend в соседней директории. Его обязательный
источник — committed `openapi/lola-backend.json`; файл
`openapi/lola-backend.contract.json` фиксирует immutable content address
`contractRevision=sha256:<canonical OpenAPI digest>`. Удаление metadata, ручное изменение artifact
без digest или устаревший generated client останавливают build. Этот content address является
release-authority и не зависит от состояния backend Git worktree.

Cross-repository GitHub workflow дополнительно checkout-ит `alxxsck/lola_back` и сравнивает его
фактический экспорт с committed artifact. Backend ref задаётся repository variable
`LOLA_BACKEND_REF`; без настройки используется существующая default branch `main`. Read-only token
для checkout задаётся обязательным Actions secret `LOLA_BACKEND_READ_TOKEN`: workflow явно падает,
если secret отсутствует или checkout недоступен. Для release ref обязан быть immutable commit SHA.
Optional `backendSourceRevision` добавляется в metadata только после backend commit и служит
traceability, но не заменяет authoritative content-addressed `contractRevision`. Sentinel вроде
`WORKTREE_UNCOMMITTED` в release metadata запрещён.

После изменения backend-контракта:

1. Выполнить `npm run api:sync:local`.
2. После backend commit выполнить
   `node scripts/check-backend-openapi-drift.mjs --backend-directory ../Lola_backend --backend-ref <40-character commit SHA> --write && npm run api:generate`
   либо добавить `backendSourceRevision` с этим SHA вручную вместе с проверкой digest.
3. Закоммитить artifact, metadata и весь generated client одним изменением.
4. Установить `LOLA_BACKEND_REF` в тот же SHA перед release и дождаться зелёного cross-repo workflow.

## Архитектура

Используется FSD-lite без лишних слоёв:

- `app` — bootstrap, router, глобальные стили;
- `pages` — route-level экраны;
- `widgets` — каркас приложения;
- `features` — auth, scenario/live actions и формы;
- `shared/api` — единый repository boundary для API и demo data;
- `shared/types` — контракты домена;
- `shared/lib` — небольшие общие функции.

API-режим подключает авторизацию и существующие CRUD endpoints проектов, UI elements, event definitions, scenarios и users. Функции без backend-контракта остаются только в mock implementation и явно сообщают об отсутствии API.

Настройки ElevenLabs для обычного `SPEAK_TEXT` вынесены в отдельный блок Text-to-Speech и сохраняются только через dedicated speech-synthesis API. Они не меняют голосовые сессии xAI/Grok. Контракты, диапазоны настроек, каталог голосов и отображение usage описаны в [docs/text-to-speech.ru.md](docs/text-to-speech.ru.md).

Полный MVP scope и требуемые backend-контракты описаны в [docs/cms-mvp-spec.md](docs/cms-mvp-spec.md). Матрица покрытия актуального ТЗ перед презентацией — в [docs/cms-coverage-audit.md](docs/cms-coverage-audit.md).
