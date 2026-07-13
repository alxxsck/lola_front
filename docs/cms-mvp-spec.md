# Lola CMS — ТЗ на MVP

## 1. Цель

Lola CMS — SaaS-интерфейс администратора для настройки одного заранее созданного проекта и управления реакциями Lola на продуктовые события. CMS общается только с Lola Backend; прямой связи CMS с пользовательским виджетом нет.

Поток ручной или сценарной команды:

`CMS → Lola Backend → realtime session channel → Frontend SDK → пользовательский интерфейс → acknowledgement`.

## 2. Границы MVP

В MVP входят:

1. Вход по рабочей почте и паролю/одноразовой ссылке; backend автоматически определяет единственный доступный проект.
2. Настройки текущего проекта.
3. CRUD кнопок и других элементов интерфейса.
4. CRUD страниц.
5. CRUD модальных окон.
6. CRUD определений событий и визуальный конструктор полей payload.
7. CRUD сценариев: trigger, ограничения и упорядоченный список actions.
8. Таблица пользователей, минимальные фильтры и карточка с timeline.
9. Список online/idle сессий.
10. Ручная отправка online-пользователю текста, TTS-сообщения, CTA-кнопки или анимации.

В MVP не входят создание/переключение проектов, управление сотрудниками и ролями, биллинг, knowledge base, аватары и каталог голосов, полная аналитика, draft/publish/versioning, audit log, API keys UI и сценарные ветвления.

## 3. Авторизация и tenant resolution

Пользователь вводит email и проходит подтверждение личности. Backend возвращает CMS access/refresh token, текущего CMS user и текущий project. В MVP одна учётная запись должна иметь ровно один доступный проект; иначе backend возвращает явную ошибку до появления project switcher.

Frontend не хранит server API key или глобальный CMS API key. Все административные endpoint проверяют CMS token и project membership. Данные разных проектов не должны смешиваться ни в URL, ни в кеше.

Необходимые endpoint:

- `POST /cms/auth/login`;
- `POST /cms/auth/refresh`;
- `POST /cms/auth/logout`;
- `GET /cms/me` — user, role, project.

## 4. Разделы и маршруты

| Маршрут | Назначение |
| --- | --- |
| `/login` | Вход и автоматическое определение проекта |
| `/overview` | Состояние конфигурации и быстрые переходы |
| `/project` | Настройки текущего проекта и Lola |
| `/interface/buttons` | Кнопки и элементы интерфейса |
| `/interface/pages` | Страницы продукта |
| `/interface/modals` | Модальные окна |
| `/events` | Определения продуктовых событий |
| `/scenarios` | Сценарии и action builder |
| `/users` | Пользователи, фильтры, карточка и timeline |
| `/live` | Активные сессии и ручные команды |

## 5. Настройки проекта

Редактируются название, описание, основной и доступные языки, часовой пояс, имя ассистента и системная инструкция. `projectId`, slug и public project key показываются только для чтения. Создание и удаление проекта из CMS недоступно.

## 6. Карта интерфейса

Все сущности используют общий backend-ресурс `UiElement`, но отображаются в CMS отдельными вкладками.

Общие поля: `name`, уникальный `code`, `kind`, `enabled`, описание и fallback в `config`.

- Кнопка/элемент: CSS selector или `data-lola-*` атрибут, доступные actions.
- Страница: route pattern, разрешение прямого перехода.
- Модальное окно: frontend handler либо URL-based способ открытия, fallback URL.

## 7. События

Событие содержит название, автоматически предложенный редактируемый `code`, описание, версию, enabled и JSON Schema payload. UI редактирует schema как список полей: название, code, тип (`string`, `number`, `integer`, `boolean`, `object`, `array`) и обязательность. CMS показывает итоговый JSON и пример запроса.

Backend должен проверять уникальность code и валидность JSON Schema при сохранении, а не только при получении реального события.

## 8. Сценарии

MVP использует линейный action builder, потому что backend хранит упорядоченный список и не поддерживает ветвления. Схема рядом с формой визуализирует trigger и последовательность actions, но не меняет модель данных.

Сценарий содержит `name`, `code`, `status`, `eventDefinitionId`, `priority`, AND-условия, cooldown, max runs per user, период активности и actions. Frontend перед сохранением перенумеровывает `position` от нуля.

Минимальные actions: показать/скрыть Lola, открыть/закрыть чат, текст, анимация, подсветка элемента, убрать подсветку, CTA, открыть страницу, открыть модальное окно, track и завершение. CTA содержит label и вложенную цель: page, modal или element.

## 9. Пользователи и presence

Таблица пользователей поддерживает поиск по имени/email/external ID, фильтр сегмента и online status. Карточка показывает профиль, атрибуты, последнюю активность и единый timeline событий, сценариев, сообщений, команд и ошибок.

Online означает активное realtime-соединение с heartbeat не старше согласованного timeout. Одна пользовательская запись может иметь несколько сессий. Backend обновляет presence при connect, heartbeat и disconnect и предоставляет polling endpoint или SSE/WebSocket stream.

Необходимые endpoint:

- `GET /admin/projects/:projectId/users?search=&segment=&status=&cursor=`;
- `GET /admin/projects/:projectId/users/:userId`;
- `GET /admin/projects/:projectId/users/:userId/activity?cursor=`;
- `GET /admin/projects/:projectId/sessions?status=active`;
- presence stream или polling с ETag/updatedSince.

## 10. Ручные действия

Admin command принимает `sessionId`, idempotency key и discriminated union payload:

- `TEXT` — текст от Lola;
- `VOICE` — текст для TTS и optional voice code;
- `BUTTON` — label, action, target code;
- `ANIMATION` — animation code.

`POST /admin/projects/:projectId/sessions/:sessionId/commands` возвращает `commandId` и status. Статусы: `queued`, `delivered`, `failed`, `expired`. Для MVP команда офлайн-пользователю отклоняется. SDK подтверждает выполнение, а CMS получает обновление статуса.

## 11. Frontend требования

- Vue 3 SPA, TypeScript strict, Vite, Vue Router, Pinia и PrimeVue.
- FSD-lite с изолированным repository/API boundary.
- OpenAPI — источник request/response типов после исправления Swagger schemas.
- Loading, empty, error и destructive-confirm states на всех CRUD экранах.
- Responsive layout от 320 px, основная desktop-ориентация.
- Формы не отправляют неизвестные backend поля; JSON config изолирован.
- Unit tests для преобразования event fields в JSON Schema, slug generation и scenario position normalization; smoke test ключевых маршрутов.

## 12. Backend gaps текущего MVP

Текущий backend предоставляет CMS JWT auth, project membership, project, `UiElement`, `EventDefinition`, `Scenario`, users CRUD, active presence, operational logs и admin messaging. OpenAPI используется как источник generated client. Пока отсутствуют user detail/timeline, conversation history, server-side pagination и отдельный журнал ACK ручных frontend-команд.

В admin project responses также нельзя возвращать `serverKeyHash`; backend должен использовать явный response presenter/select.

## 13. Критерии приёмки

- После входа пользователь попадает в свой проект без ручного project ID.
- Все поддерживаемые backend сущности создаются, редактируются, включаются и удаляются из CMS.
- Event fields сериализуются в валидную JSON Schema.
- Scenario actions сохраняются в показанном порядке с корректными positions.
- Пользовательская таблица фильтруется без перезагрузки; карточка показывает timeline.
- Online screen обновляет presence и разрешает отправку только в активную сессию.
- Команда имеет видимый delivery status и появляется в пользовательском timeline.
- Production build, type-check, lint и tests проходят без ошибок.
