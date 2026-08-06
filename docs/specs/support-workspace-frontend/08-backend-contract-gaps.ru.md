# Support Workspace: зафиксированные contract gaps

Статус: blocking gaps для production cutover
Источник проверки: OpenAPI, экспортированный из `Lola_backend` ветки `develop`
на commit `866404ec167ae293777259ee2bdd60d609c914af`
Дата: 6 августа 2026 года

Этот документ не является задачей на изменение backend. Он фиксирует границы,
за которыми frontend не должен создавать локальную «истину» или показывать
псевдо-функциональность.

## P1: rollout

В contract нет явного server-owned поля или endpoint для
`support_workspace_shell`. `ProjectResponseDto.settings` — нетипизированный
object и выдаётся только с отдельным permission, поэтому он не является
release-safe источником rollout. До появления typed contract маршрут должен
оставаться выключаемым только согласованным временным механизмом и не может
считаться готовым к массовому включению.

## P1: аватары оператора и пользователя

`AdminConversationMessageResponseDto.author.avatarUrl` можно безопасно
отрисовывать с fallback initials. Однако в `develop` нет upload/read/write
контракта для avatar asset, а серверный actor snapshot сейчас отдаёт
`avatarUrl: null`. Frontend реализует только отображение и fallback; загрузку
аватара нельзя выпускать без отдельного профильно-медийного contract.

## P1: live collaboration и read state

Socket hints `conversation.watch.v1` и `conversation.message.upserted.v1`
существуют в серверном коде, но не опубликованы в OpenAPI. Отсутствуют
типизированные contracts для typing, viewers, durable personal read position и
operator presence. Frontend использует событие только как hint и запускает
REST reconcile; он не должен показывать «печатает», список смотрящих, unread
или online ownership как достоверные состояния.

## P1: вложения и повтор доставки

Conversation attachment upload/scan/download grants отсутствуют; backend
явно возвращает `ATTACHMENTS_NOT_SUPPORTED`. Также нет отдельного command для
retry delivery с declared intent. Нельзя использовать Internal Knowledge upload
для публичного сообщения или имитировать retry локальным состоянием.

## P1: QA и персональные scorecards

`SupportLead_summary`, risks, activity и alerts достаточны для operational
control. Но contract не содержит review snapshots, versioned scorecards,
evidence, disputes, calibration либо individual quality analytics. Маршруты
`/support/quality` и `/support/analytics` не должны появляться как готовые
разделы до публикации этих server-owned моделей.

## Недостающие поля строки inbox

`ALL_CONVERSATIONS` намеренно отдаёт только безопасные metadata. В нём нет
preview текста, unread/read, assignee/responder, SLA risk, attention и delivery
assessment. UI не делает N+1 загрузку текстов для каждой строки и не выводит
эти сигналы до расширения bounded row projection.
