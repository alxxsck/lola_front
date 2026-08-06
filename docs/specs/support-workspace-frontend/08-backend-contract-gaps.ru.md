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
release-safe источником rollout. До появления typed contract frontend использует
временный global deployment switch `VITE_SUPPORT_WORKSPACE_ENABLED=true` (в mock
mode включён для проверки). Он не читает `project.settings` и по умолчанию
выключен в production. Это снимает ложный отказ оператору из-за отсутствующего
`project.settings.read`, но не заменяет per-project rollout: массовое включение
по-прежнему заблокировано typed server contract.

Этот же временный switch пока включает `/support/inbox` и `/support/control`
вместе; `project.support.lead_control.read` остаётся обязательным permission,
но независимого server-owned rollout для lead control нет. Поэтому нельзя
считать этот global switch заменой поэтапного project rollout control center.

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

До публикации протокола F0 route показывает authoritative REST snapshot и
ручное обновление, а не статус «Live». Public composer также не монтируется:
без server-owned lookup неизвестного результата, `expectedVersion` и typed
watch protocol нельзя честно гарантировать delivery/recovery.

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

## P1: управляющие команды Lead Control

В OpenAPI уже есть read-модели Case risks, alerts и их причинной истории, но
body `acknowledge`, `resolve` и `change owner` не передают `expectedVersion`,
`actionEtag` или client attempt/idempotency key. Frontend поэтому показывает
эти списки и timeline в read-only режиме: при конкурентной работе lead нельзя
безопасно повторять либо подтверждать command, не зная, относится ли она к
актуальной generation alert. Для audited action нужен versioned intent contract
с однозначным recovery неизвестного результата.

`support/lead/risks/capacity` также пока документирован как пустой список до
Routing Ticket 13; UI не рисует фиктивные capacity targets или предложения по
командам, а показывает только authoritative summary capacity.

## P1: read-only availability для другого сотрудника

`GET /support/operators/{operatorId}/availability` формально требует
`project.support.availability.read`, но server-side target check допускает
только сотрудника с `project.support.availability.self_manage`. Поэтому нельзя
построить честный read-only inspector: участник только с read-permission
получит concealed `404`, а не безопасную projection. Текущий workspace
показывает только собственную availability и монтирует её лишь при обеих
capabilities (`read` + `self_manage`).

Для lead override нужен отдельный каталог eligible operators и явная
target-authority projection; frontend не выводит кандидатов из inbox, presence
или browser state.

## P1: AI Suspension capability для закрытого диалога

Нынешний `SupportWorkspaceCapabilitiesResponseDto.suspendAi` в `develop`
вычисляется как `conversationOpen && project.conversations.ai_suspend`. Это
достаточно для кнопки start, но не выражает отдельные права `extend`, `resume`
и `history`: базовый контракт AI Suspension допускает early resume активного
состояния и после закрытия Conversation.

Frontend загружает безопасное текущее состояние и историю по exact
`project.conversations.read`; read-only роль видит только server-sanitized
detail. Любая state-changing кнопка в Support Workspace требует одновременно
`project.conversations.ai_suspend` и текущего
server-owned `suspendAi`. Поэтому закрытый диалог не получает выдуманный
resume-control даже если общий AI endpoint мог бы его принять.

Для полного parity нужен versioned action projection, например
`aiSuspension: { read, start, extend, resume, history }`, где каждое поле
отражает target/state authority. До этого frontend не преобразует один boolean
в набор неописанных прав.

## P1: ручной self-claim и transfer

В `SupportWorkspaceSelection` есть version и server capability Case, но нет
каталога допустимых Team текущего оператора. `claim` требует именно `teamId`, а
`transfer` — ещё Team и target operator. Нельзя подставлять Team из предыдущего
Assignment, inbox, browser state или membership UI: это нарушит server-side
eligibility и может назначить Case не туда.

Пока frontend поддерживает только actor-bound routing offers: их own-list
выдаёт opaque capability, ETag и exact assignment version. Для ручного
self-claim/transfer требуется отдельная eligible-target projection.

## P1: Internal Notes commands

`GET /cases/{caseId}/internal-notes` и protected revision history готовы для
read-only панели: они повторно проверяют Case target authority и имеют
типизированные cursor response. Frontend показывает их только по exact
`internal_notes.read` (history дополнительно требует `history_read`) и очищает
memory state при concealed `403/404`.

Но `SupportWorkspaceSelection.capabilities` не содержит case-scoped
`internalNotes.create/correct/tombstone` и rollout capability. Нельзя выводить
write authority из assignment, Team или project-wide permission: backend
проверяет current Case scope на каждом command. Поэтому create/correct/tombstone
не монтируются до server-owned action projection. Также OpenAPI описывает
creator/author как untyped object и не публикует closed catalog reason codes;
frontend не придумывает author fields или значения reason code.

В серверном коде есть realtime события заметок, но их watch/renew/unwatch
протокол и payload не опубликованы в frontend-контракте. Экран не принимает
неверифицированные socket payload. Пока панель открыта, frontend повторно
сверяет список по REST каждые 30 секунд и оставляет ручное обновление; при
смене `checkpoint` или `capabilitiesRevision` того же Case он сразу закрывает
панель и purge-ит текст до следующего explicit read. Для полноценной realtime
синхронизации нужен публичный typed watch contract с server admission.

## Реализованная безопасная команда: release assignment

В отличие от self-claim и transfer, `POST
/support/cases/{caseId}/assignment/release` уже имеет полный контракт для
безопасной команды: server-owned `releaseAssignment` в выбранной Case,
assignment version, strong `actionEtag`, `Idempotency-Key`, reason code и
authoritative receipt. Поэтому frontend монтирует «Снять назначение» только
при текущей per-Case capability и активном assignment. Дополнительно он
сверяет session authority: `self_manage` допускает только assignment текущего
CMS user, а чужой assignment требует `override`.

Клиент захватывает Case ID, assignment ID, version и ETag в момент подтверждения
и перед commit проверяет, что тот же selection всё ещё выбран и разрешён. Он не
показывает эти значения в DOM и не делает optimistic mutation. `409` приводит
к reconcile выбранного Case и inbox; для concealed `403/404`
action surface сразу purge-ится до refresh permissions, чтобы stale capability
не отправила повторную команду. Timeout/transport error
оставляет единственную команду для повторения с тем же idempotency key. Успешный
receipt остаётся успешным, даже если последующий reconcile не удался; до нового
authoritative assignment selection повторное снятие блокируется.

Эта команда не снимает blocking gap для claim/transfer: release не требует
Team или target operator, поэтому его нельзя использовать как доказательство
наличия соответствующего каталога и authority для других lifecycle actions.

## Недостающие поля строки inbox

`ALL_CONVERSATIONS` намеренно отдаёт только безопасные metadata. В нём нет
preview текста, unread/read, assignee/responder, SLA risk, attention и delivery
assessment. UI не делает N+1 загрузку текстов для каждой строки и не выводит
эти сигналы до расширения bounded row projection.
