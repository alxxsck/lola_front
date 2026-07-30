# CMS: проекты и авторизация в нескольких вкладках

## Контекст

CMS уже получает полный список доступных пользователю Projects в
`GET /api/v1/auth/me`, хранит выбранный Project в `sessionStorage` и умеет
выбирать его через auth store. Однако повторный выбор доступен только сразу
после входа.

Access token хранится только в памяти вкладки, а rotating refresh capability —
в общей для origin `HttpOnly` cookie. Поэтому новая вкладка выполняет refresh,
бэкенд отзывает предыдущее поколение session, и access token уже открытой
вкладки перестаёт быть действительным. Параллельные refresh-запросы ещё опаснее:
reuse detection отзывает всю session family.

## Цели

1. Пользователь переключает доступный Project без выхода из аккаунта через меню
   профиля.
2. Пользователь открывает любой доступный Project в новой вкладке из того же
   меню.
3. Несколько вкладок остаются авторизованными и могут одновременно работать в
   разных Projects.
4. Перезагрузка вкладки сохраняет выбранный в ней Project.
5. Закрытие вкладки не требует восстановления её Project при следующем ручном
   открытии CMS.

## Не входит в объём

- хранение Project в URL;
- восстановление Project после закрытия вкладки или браузера;
- изменение backend rotation/reuse policy;
- хранение access/refresh token в `localStorage` или `sessionStorage`;
- синхронизация выбранного Project между вкладками.

## Решение

### Tab-local Project

- Выбранный Project продолжает храниться под существующим ключом
  `lola-cms-selected-project-v1` в `sessionStorage`.
- Меню профиля содержит действия «Переключить проект» и «Открыть проект в новой
  вкладке».
- Переключение в текущей вкладке вызывает существующий `auth.selectProject`,
  очищает project-scoped transient state и открывает безопасную стартовую
  страницу `/overview`.
- Новая вкладка создаётся как same-origin `about:blank`. До навигации в её
  `sessionStorage` записывается выбранный Project, после чего `opener`
  отсоединяется и вкладка переходит на `/overview`. Project не появляется в URL.
- Если браузер блокирует создание вкладки, текущая вкладка и её Project не
  изменяются.

### Shared browser authentication

- Refresh capability остаётся только в общей `HttpOnly` cookie.
- Access token остаётся только в памяти, но его актуальное поколение
  синхронизируется между вкладками через `BroadcastChannel`.
- Перед backend refresh вкладка получает origin-wide Web Lock.
- После получения lock вкладка сначала запрашивает актуальный access token у
  других вкладок. Backend refresh выполняется только если нового поколения нет.
- Успешный login/refresh/password-change публикует новый access token всем
  вкладкам.
- Запрос, получивший `401` со старым access token, повторяется с уже
  синхронизированным поколением и не запускает лишний refresh.
- Явный или окончательный локальный logout очищает auth state во всех вкладках.
- Сообщения auth-канала никогда не содержат refresh capability или Project id.

Web Locks являются обязательной возможностью поддерживаемого браузерного
профиля CMS. Если API недоступно, остаётся только прежняя per-tab single-flight
защита; это не ослабляет backend security policy, но multi-tab refresh не
гарантируется в таком браузере.

## Тестовые швы

1. `auth-session` public API:
   - две независимые browser session instances получают одно поколение access
     token;
   - одновременный refresh вызывает backend handler один раз;
   - remote token update не меняет `sessionStorage` выбранного Project;
   - logout очищает token в обеих вкладках.
2. `AppShell` как пользовательский интерфейс:
   - меню перечисляет доступные Projects;
   - Project переключается в текущей вкладке;
   - Project открывается в новой вкладке без добавления id в URL.
3. API-mode Playwright:
   - две страницы одного BrowserContext проходят restore;
   - refresh rotation не отзывает browser session;
   - каждая страница сохраняет свой выбранный Project после reload.

## Критерии приёмки

- Ни один auth secret не записывается в browser storage или URL.
- Одновременная работа минимум четырёх вкладок не создаёт конкурентный refresh.
- Project одной вкладки не меняется при переключении в другой.
- Все существующие auth, routing и permission tests остаются зелёными.
- Проходят unit tests, API-mode browser regression, typecheck и lint.
