# Lola CMS — аудит покрытия ТЗ перед owner demo

Дата проверки: 15.07.2026.

Источники истины: `03-cms-admin.md`, приоритетные контракты `05-data-model-and-api-contracts.md` и критерии `06-mvp-scope-and-acceptance.md` из каталога ТЗ Lola.

## Результат

Frontend готов к демонстрации продукта и полностью работает в demo-режиме. Реальный production MVP всей Lola ещё не готов: часть обязательных CMS-сценариев зависит от backend и SDK endpoint, которых нет в переданной реализации backend. CMS не маскирует эти ограничения фиктивными HTTP-вызовами.

| Область ТЗ | Frontend | Реальный backend |
| --- | --- | --- |
| Login + password | Готов, включая refresh/restore/logout и выбор проекта | CMS JWT login/refresh/logout опубликованы |
| Tenant/project isolation | Доступные проекты загружаются по membership | Project guard проверяет membership для project routes |
| Project settings | Базовые поля проекта и отдельный ElevenLabs Text-to-Speech блок готовы | Generic PATCH принимает только типизированные поля проекта; TTS меняется через dedicated API |
| Text-to-Speech | Актуальный provider catalog (20 голосов на страницу), language override, voice settings и normalization готовы | ElevenLabs `eleven_v3`, PCM16 mono 24 kHz, dedicated settings/voices API опубликованы |
| AI usage | Токены, billed/estimated cost xAI и billed units ElevenLabs готовы | Voice отмечен как расчёт по тарифу xAI; platform-admin workspace billing snapshot опубликован отдельно |
| Dashboard | Готовы users, online, conversations, events, scenarios, CTA conversion, integration health и activity | Часть агрегатов пока demo data |
| Interface map | Готов CRUD buttons/elements, pages и modals | Поддерживается общим `UiElement` CRUD |
| CTA registry | CTA поддержан в сценариях и ручных действиях | Отдельной CTA entity/API пока нет |
| Event definitions | Готов CRUD, unique code, field builder, strict JSON Schema preview | CRUD есть; schema validation/publish compatibility отсутствуют |
| Scenario editor | Готов trigger, conditions, priority/frequency, ordered steps, linked targets, variables и graph preview | `SPEAK_TEXT` использует ElevenLabs; остальные action capabilities определяются backend action definitions |
| Activation | Status toggle и frontend validation готовы | Нет отдельного validate endpoint/version snapshot |
| Product users | Готовы search, segment, online/stale/offline, lastSeenAt | Список есть без server pagination/search |
| User activity | Готов unified timeline | Aggregated activity endpoint отсутствует |
| Conversations/messages | Готовы conversation selector и message history UI | Admin conversation endpoints отсутствуют |
| Realtime presence | Live center опрашивает backend каждые 15 секунд и показывает активные interaction sessions | `GET /admin/projects/:projectId/users/active` опубликован |
| Direct admin message | Готов выбор online-пользователя/сессии, idempotency и USER_OFFLINE | Admin message endpoint опубликован |
| Frontend commands | Готовы CTA, animation, page/modal/highlight в составе admin message | Backend принимает до 5 actions; отдельного журнала ACK для ручных commands пока нет |
| Bonus integration | Готов безопасный UI без browser secrets | Integration Dispatcher и bonus endpoint отсутствуют |
| Loading/empty/error/pending | Реализованы на ключевых CRUD и operational screens | Нужны stable error codes/requestId |
| Responsive | Проверены desktop, tablet 768/901 и mobile 390; overflow исправлен | Не зависит от backend |

## Что показывать owner’ам

Основной demo flow:

1. Login как owner.
2. Dashboard с состоянием продукта и live users.
3. Project settings и integration URLs.
4. Interface map: button/page/modal.
5. Event definition и payload schema.
6. Scenario builder: event, condition, variables, actions и visual flow.
7. Product user: activity + conversation history.
8. Live center: direct text/TTS/CTA/frontend command/bonus.

## Что нельзя заявлять как production-ready

- Достоверный realtime presence из нескольких backend instances.
- Финальный ACK ручной frontend-команды и bonus integration.
- Полную историю диалогов из backend.
- Полное прохождение AC-08–AC-16 на staging.

Эти пункты требуют изменений Lola Backend и Frontend SDK, перечисленных в `docs/cms-mvp-spec.md`.
