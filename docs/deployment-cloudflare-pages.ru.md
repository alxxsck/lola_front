# Деплой Retenive CMS из GitLab CI в Cloudflare Pages

## Принятое решение

GitLab CI выполняет проверки, собирает статический Vite bundle и загружает `dist/` в существующий
Cloudflare Pages project через Wrangler Direct Upload.

Встроенную Git-интеграцию Cloudflare Pages для этого project включать не нужно: иначе один commit
будет запускать независимые деплои и в GitLab, и в Cloudflare.

Cloudflare продолжает поддерживать Pages, Direct Upload и branch previews. При этом для нового
greenfield-размещения Cloudflare также предлагает Workers Static Assets как более новый путь. Pages
здесь выбран осознанно: это простой статический Vue SPA без server-side runtime, а Pages даёт готовые
preview deployments и удобный production rollback. Если домен уже полностью управляется Cloudflare
и проект ещё не создан, перед созданием имеет смысл отдельно сравнить Pages с Workers Static Assets.

## Однократная настройка

### 1. Создать Direct Upload project

В Cloudflare Dashboard:

1. Открыть **Workers & Pages**.
2. Создать **Pages** application через **Direct Upload**.
3. Задать имя project, которое затем будет записано в
   `CLOUDFLARE_PAGES_PROJECT_NAME`.
4. В качестве production branch использовать default branch GitLab (обычно `main`).

Project должен существовать до первого запуска pipeline: CI намеренно не создаёт инфраструктуру
автоматически и не может зависнуть на интерактивном prompt Wrangler.

### 2. Создать Cloudflare API tokens

Для токена достаточно разрешения **Account → Cloudflare Pages → Edit** только для нужного
Cloudflare account.

Рекомендуются два токена:

- production token — для protected default branch;
- preview token — для merge request из веток того же GitLab project.

Preview job не запускается для merge request из fork, чтобы fork pipeline не получил Cloudflare
credentials. Любой пользователь, который может менять CI-файл в доверенном project, потенциально
может прочитать доступные этому pipeline credentials, поэтому preview token должен иметь минимальный
scope и не должен использоваться за пределами Pages deploy.

### 3. Добавить GitLab CI/CD variables

В **Settings → CI/CD → Variables**:

| Variable | Visibility | Protected | Назначение |
| --- | --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Visible | No | Cloudflare account ID |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Visible | No | Имя созданного Pages project |
| `CLOUDFLARE_API_TOKEN` | Masked and hidden | Yes | Production deploy из protected default branch |
| `CLOUDFLARE_PREVIEW_API_TOKEN` | Masked and hidden | No | Preview deploy для доверенных MR |
| `VITE_API_BASE_URL` | Visible | No | Production API URL, встраиваемый Vite во frontend bundle |

`VITE_API_BASE_URL` не является secret: после сборки его значение видно в JavaScript bundle.
Pipeline останавливает build, если переменная отсутствует, чтобы случайно не задеплоить frontend,
обращающийся к `localhost`.

Default branch GitLab должна быть protected, иначе protected production token не будет доступен
deploy job.

`VITE_DATA_MODE=api` задан непосредственно в `.gitlab-ci.yml`. Остальные используемые приложением
`VITE_*` flags при необходимости также задаются как GitLab variables до build.

## Как работает pipeline

| Событие | Проверки | Build artifact | Cloudflare deployment |
| --- | --- | --- | --- |
| Push в ветку без открытого MR | lint, typecheck, unit/script tests | `dist/`, 7 дней | нет |
| Merge request из того же project | lint, typecheck, unit/script tests | `dist/`, 7 дней | branch preview |
| Merge request из fork | lint, typecheck, unit/script tests | `dist/`, 7 дней | нет |
| Push в default branch | lint, typecheck, unit/script tests | `dist/`, 7 дней | production |

`npm run build` дополнительно проверяет committed OpenAPI contract, generated client и production
TypeScript build. Production deployments сериализованы через GitLab `resource_group`, поэтому два
быстрых merge не смогут одновременно переключать Pages production.

Wrangler получает commit SHA и title из GitLab. URL конкретного deployment печатается в логе deploy
job. Для preview Cloudflare также создаёт branch alias вида
`<branch>.<project>.pages.dev`.

## SPA routing и HTTP headers

Vue Router использует history mode. Cloudflare Pages автоматически распознаёт SPA по `index.html`
при отсутствии top-level `404.html` и отдаёт app shell для client-side routes. Поэтому глобальный
`_redirects` rewrite не добавлен: он не нужен Pages и может скрывать реальные missing assets за
ответом `index.html`.

`public/_headers` попадает в `dist/_headers` во время Vite build. Он переносит существующие
Vercel-правила `no-store` и `no-referrer` для password/email action routes.

## Переключение с Vercel

1. Выполнить merge request deployment и проверить preview URL:
   login, refresh на вложенном route, password reset/email links и обращения к API.
2. Проверить CORS backend и cookie settings для `*.pages.dev` preview и будущего production domain.
3. Выполнить production deployment default branch и проверить `<project>.pages.dev`.
4. В Cloudflare Pages сначала добавить production hostname в **Custom domains**.
5. Только после успешной проверки hostname переключить DNS с Vercel на Pages.
6. Не удалять Vercel deployment до завершения наблюдения после переключения.

Для rollback открыть **Workers & Pages → project → Deployments**, выбрать предыдущий успешный
production deployment и выполнить **Rollback to this deployment**. Preview deployments нельзя
использовать как production rollback target.

## Локальная проверка артефакта

```bash
VITE_DATA_MODE=api \
VITE_API_BASE_URL=https://api.example.com/api/v1 \
npm run build

test -f dist/index.html
test -f dist/_headers
```

Локальная команда ручного preview deploy после `wrangler login`:

```bash
npx wrangler@4 pages deploy dist \
  --project-name <project-name> \
  --branch <preview-branch>
```
