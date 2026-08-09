# Support Workspace: зафиксированные contract gaps

Статус: исторический snapshot; актуальная сводка —
[backend-блокеры 01–33](../../research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md)
Источник проверки: OpenAPI, экспортированный из `Lola_backend` ветки `develop`
на commit `866404ec167ae293777259ee2bdd60d609c914af`
Дата: 7 августа 2026 года

Этот документ не является задачей на изменение backend. Он фиксирует границы,
за которыми frontend не должен создавать локальную «истину» или показывать
псевдо-функциональность.

## P1: Case Intelligence Detection и Human Escalation

Существующий Case policy/OpenAPI и legacy `/cases/settings` не разблокируют
полноценную настройку. На фактическом runtime каждый USER message создаёт
signal, но Project не может отдельно опубликовать typed Detection Policy и
Escalation Policy, настроить include/exclude, confidence tiers, approved cheap
model/budget, stateful failure/clarification counters, test/shadow evaluation
или безопасный rollback. Описание и examples taxonomy сохраняются, но не
доходят до router как полноценный compiled policy; runtime thresholds остаются
code-owned, а `adminRequestTerms` не выражены согласованным closed DTO.

До backend задач 31–34 frontend не должен превращать raw JSON editor в новый
source of truth, исполнять keyword rules в браузере или считать message text
доказательством эскалации. Normative handoff описан в
[Case Intelligence Detection и Human Escalation](./16-case-intelligence-detection-escalation.ru.md),
а проверка текущей реализации — в
[backend-аудите](../../research/support-case-intelligence-backend-audit-2026-08-08.ru.md).

## P1: rollout — снят

Backend `4d82b6bd` опубликовал typed per-Project
`SupportWorkspace_readAdmission`, а `9f36796b` добавил проверяемый pilot/rollback
proof. Router и navigation читают только server-owned admission и fail closed
при ошибке, неизвестной комбинации enum или недоступной capability. Временный
`VITE_SUPPORT_WORKSPACE_ENABLED` удалён; `ProjectResponseDto.settings` не
используется как authority. Lead Control и личные browser notifications
сохраняют собственные permission/admission gates и не зависят от shell cutover.

## P1: аватары оператора и пользователя

`AdminConversationMessageResponseDto.author.avatarUrl` можно безопасно
отрисовывать с fallback initials. Однако в `develop` нет upload/read/write
контракта для avatar asset, а серверный actor snapshot сейчас отдаёт
`avatarUrl: null`. Frontend реализует только отображение и fallback; загрузку
аватара нельзя выпускать без отдельного профильно-медийного contract.

## P1: live collaboration и read state

Опубликованных REST-проекций Support Workspace, команды отправки публичного
сообщения с `Idempotency-Key`, server receipt/delivery status и cursor-history
достаточно для рабочего места оператора. Поэтому F0 монтирует public composer,
показывает только ответивший сервер delivery status и после отправки делает
authoritative REST reconcile. Повтор неизвестного исхода использует тот же
idempotency key; UI не называет pending-сообщение доставленным.

Realtime transport и события `conversation.*.upserted.v1` используются
исключительно как invalidation hints: после них frontend заново читает
authoritative REST snapshot. В OpenAPI по-прежнему нет типизированных
contracts для typing, viewers, durable personal read position и operator
presence. Поэтому UI не показывает «печатает», список смотрящих, unread или
online ownership как достоверные состояния; индикатор соединения означает
только состояние транспорта, а не доступность другого сотрудника.

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

## P1: неполная управляющая поверхность Lead Control

Для alerts теперь опубликованы versioned `acknowledge` и `resolve`: команда
принимает `If-Match` с текущей server version и `Idempotency-Key`, возвращает
authoritative receipt. Frontend реализует эти два действия только при exact
`project.support.alerts.manage`, не делает optimistic mutation и после успеха
перечитывает список и detail. Конфликт сохраняет detail для явного refresh.

Локальный allow-list `PROJECT_PERMISSION_CODES` пока не содержит
`project.support.alerts.manage`, хотя backend команда уже его требует. Это
frontend permission-registry gap, а не повод выдавать право: до синхронизации
UI проверяет строку только в фактическом effective-permissions наборе, поэтому
кнопки не появятся без server-issued permission.

`change owner` всё ещё нельзя реализовать: нет published команды вместе с
каталогом eligible operators/Teams и target-authority projection. Frontend не
подставляет кандидатов из inbox, presence или browser state.

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

## P1: Internal Notes realtime и reason-code catalog

`GET /cases/{caseId}/internal-notes` и protected revision history готовы для
read-only панели: они повторно проверяют Case target authority и имеют
типизированные cursor response. Frontend показывает их только по exact
`internal_notes.read` (history дополнительно требует `history_read`) и очищает
memory state при concealed `403/404`.

OpenAPI публикует create/correct/tombstone с `Idempotency-Key` и `If-Match`
action ETag, но `SupportWorkspaceSelection` не содержит Case-scoped
`internalNotes.create/correct/tombstone` allowed actions. Одних project
permissions `internal_notes.write`/`internal_notes.redact` недостаточно, чтобы
показать mutation control на текущем Case: backend правильно отклонит
неавторизованный target, но frontend не должен приглашать к действию заранее.
Поэтому текущая панель остаётся read-only; write/redact UI включается только
после published Case action projection.

`reasonCode` в OpenAPI — свободная строка, а не опубликованный enum/catalog с
label. Frontend не придумывает локальный перечень причин или author fields. Для
предсказуемого audit UX backend должен либо опубликовать конечный каталог, либо
явно закрепить free-form semantics и правила валидации.

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
