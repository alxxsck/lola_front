# Discovery: Ticket 39 — полный frontend control plane маршрутизации

Дата исследования: 2026-08-11  
Проверенные срезы: frontend `b767b309ea89`, backend worktree `b72dd685567e`
(`origin/main` — `e7dc6a134844`).  
Метод: чтение текущего frontend/backend-кода, OpenAPI-generated клиента и официальной документации Zendesk, Intercom, Salesforce, Twilio, AWS, W3C, Apple и Google. Вторичные обзоры и дизайн-галереи не использовались.

## Короткий вывод

Runtime автоматической маршрутизации на backend действительно существует: live worker запускается вместе с Support Platform, сервер компилирует и публикует Queue, Workforce и Routing Policy, связывает Queue с Policy, фиксирует immutable activation vector, резервирует capacity и передаёт назначение владельцу assignment-домена ([worker](../../../Lola_backend/src/modules/support-operations/application/support-routing-live-worker.service.ts#L32), [activation](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L309), [assignment owner](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-assignment-routing-owner.ts#L561)). Удалённый `SUPPORT_ROUTING_LIVE_WORKER_ENABLED` запрещён конфигурацией, а общий `SUPPORT_ENABLED` по умолчанию включён ([config](../../../Lola_backend/src/config.ts#L12), [config](../../../Lola_backend/src/config.ts#L108)).

Но Ticket 39 нельзя честно реализовать только на frontend поверх текущих backend-контрактов. Перед UI нужны несколько небольших, но блокирующих backend-изменений: читаемый Queue-slot catalog и серверная readiness-проекция; типизированные Policy/Decision DTO; каталог операторов с presentation; исправление реконструкции опубликованной Policy. Экспорт актуального OpenAPI и регенерация клиента — отдельный frontend integration step, а не backend-дефект. После этих preflight-зависимостей один frontend epic может закрыть полный путь `Configure → Verify → Publish → Bind → Activate → Operate`.

Главный UX-инвариант: `AUTO_ASSIGN` — не обычный toggle. Это финальный шаг активации после серверной проверки опубликованной Queue, READY generation, опубликованных Policy и Workforce, Queue slot и совместимого Queue mode ([activation query](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L309)). Текущий `CONFIGURATION_REQUIRED` должен стать actionable checklist с переходами к конкретным недостающим объектам, а не тупиковым баннером ([current mapping](../../src/pages/SupportControlPage.vue#L666)).

## Что уже готово

| Область | Реальное состояние | Источник |
|---|---|---|
| Teams и Skills | CRUD identity-каталогов есть | [workforce controller](../../../Lola_backend/src/composition/support-workspace/support-workforce.controller.ts#L109), [generated client](../../src/shared/api/generated/retenive-backend.ts#L9922) |
| Workforce | Full-snapshot draft, discard и publish; до 500 операторов и 100 команд | [DTO](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L208), [generated client](../../src/shared/api/generated/retenive-backend.ts#L10276) |
| Operator capacity | Capacity, skills и language proficiency входят в Workforce | [operator DTO](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L182) |
| Availability | Отдельное live-state API уже есть и используется как runtime-факт | [availability generated API](../../src/shared/api/generated/retenive-backend.ts#L8778), [routing availability port](../../../Lola_backend/src/modules/support-operations/public/support-availability-routing.port.ts#L6) |
| Queues | Catalog/create/detail/archive, replace draft, preview, publish, cases | [generated client](../../src/shared/api/generated/retenive-backend.ts#L9250) |
| Queue grammar | AND/OR/NOT, predicates, sorting, primary/fallback teams, OFFER/AUTO_ASSIGN | [queue domain](../../../Lola_backend/src/modules/support-operations/domain/support-queue.ts#L219), [validation](../../../Lola_backend/src/modules/support-operations/domain/support-queue.ts#L383) |
| Routing Policy | Catalog/create/detail/archive, replace draft, publish | [generated client](../../src/shared/api/generated/retenive-backend.ts#L9545), [policy compiler](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L175) |
| Queue → Policy | PUT Queue slot с route priority и optimistic concurrency | [runtime controller](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L135) |
| Activation | Server-owned list и per-Queue transition в OFFER/AUTO_ASSIGN/DISABLED | [runtime controller](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L83) |
| Automatic assignment | Решение сохраняется, capacity резервируется, assignment получает source `ROUTING_AUTO_ASSIGN` | [live work](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-routing-live-work.ts#L300), [assignment owner](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-assignment-routing-owner.ts#L561) |
| Diagnostics | Decision list/detail и candidate evidence существуют в application service | [decision service](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L155) |

Queue draft уже достаточно выразителен для безопасного редактора: глубина выражения ограничена пятью уровнями, количество predicates — 64, число children — 16; AUTO/OFFER требуют primary team, `ASSIGNMENT_STATE=UNASSIGNED` и `ACTIONABLE=true` ([queue compiler](../../../Lola_backend/src/modules/support-operations/domain/support-queue.ts#L710)). Preview возвращает sample Case IDs, оценку count, high-water mark и diagnostics, поэтому frontend не должен сам исполнять Queue predicate ([queue preview service](../../../Lola_backend/src/modules/support-operations/application/support-queue-preview.service.ts#L1)).

## Блокеры до начала UI

### Frontend integration. Checked-in OpenAPI устарел относительно текущего backend

Frontend всё ещё генерирует `transition project activation` и admission receipt list/issue/detail/revoke, а queue transition принимает `admissionReceiptId` и возвращает старый rollout shape ([generated runtime methods](../../src/shared/api/generated/retenive-backend.ts#L9396)). В текущем backend controller этих маршрутов уже нет: остались `GET activation`, per-Queue transition, Queue-slot PUT, decisions и shadow controls ([current controller](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L83)). Текущий transition body содержит только `targetMode`, `expectedActivationVersion`, `reasonCode`, а activation возвращает `activationVectorId` ([current DTO](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L309)). Backend contract test специально запрещает удалённые rollout/admission поля ([contract test](../../../Lola_backend/test/support-routing-activation-service-contract.test.ts#L5)).

**Закрытие на frontend:** после стабилизации backend DTO экспортировать актуальный OpenAPI, перегенерировать клиент, удалить obsolete methods/types и зафиксировать contract-diff check в CI. Это блокер frontend-интеграции, но не backend-задача.

### P0. Queue slot write-only; readiness недоступна как читаемая модель

Runtime controller даёт только `PUT queue-slots/:queueId`; GET/list отсутствует ([controller](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L135)). Activation list показывает только активированные immutable vectors и поэтому не позволяет восстановить binding/priority для выключенной Queue ([activation response](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L326)). Сервер проверяет slot, опубликованную Queue, READY generation, опубликованную Policy, опубликованный Workforce и совместимый mode одной SQL-проекцией, но при любом пропуске отвечает только `SUPPORT_ROUTING_CONFIGURATION_NOT_READY` ([readiness query](../../../Lola_backend/src/modules/support-operations/application/support-routing-activation.service.ts#L309)).

**Закрытие:** добавить read/catalog Queue slots и server-owned readiness endpoint на Queue со стабильными machine codes, entity IDs/versions и repair target. Frontend не должен угадывать readiness из нескольких гоняющихся запросов. Disabled Queue должна оставаться полностью редактируемой и диагностируемой.

### P0. Policy и decision contracts открытые/неполные

`SupportRoutingPolicyResponseDto.draft` и `publishedRevision` объявлены как arbitrary object ([DTO](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L348)). Decision DTO оставляет `outcome` строкой, не содержит `selectedTeamId`, а `candidates` описывает как пустые objects, хотя application service реально возвращает `rank`, `operatorId`, `eligible`, `exclusions`, `score` и `factVersions` ([DTO](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L256), [service](../../../Lola_backend/src/modules/support-operations/application/support-routing-decision-read.service.ts#L155)). Generated TypeScript поэтому не даёт безопасно построить policy form и explain drawer.

**Закрытие:** типизировать policy draft/published config, outcomes, source vector, input manifest и candidate rows; добавить `selectedTeamId`; документировать enum exclusion codes и score keys.

### P0. Нет display seam для операторов Workforce и diagnostics

Workforce snapshot хранит `cmsUserId`, а team membership — массив UUID без display name/avatar ([DTO](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L122), [operator DTO](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L182)). Routing decisions также возвращают только operator IDs ([decision DTO](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L256)). В Case workspace presentation уже существует, но это Case-specific seam, а не bounded project operator catalog ([frontend workspace contract](../../src/features/support-workspace/api/support-workspace-source.ts#L232)).

**Закрытие:** предоставить paginated/searchable project operator catalog или bounded `resolve presentations by IDs` API с `id`, `displayName`, `avatarUrl`, membership/active state. Не делать N+1 и не показывать UUID как основной текст.

### P0. Опубликованная Policy может деградировать при чтении

Policy compiler включает `queueWeights`, `timeouts` и `retry` в canonical value/content hash ([compiler](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L178)), но projection reader при реконструкции передаёт только skills/languages, capacity, utilization и weights ([reader](../../../Lola_backend/src/modules/support-operations/persistence/prisma-support-routing-projection-read.ts#L147)). Для опубликованной Policy с non-default значениями это может дать hash mismatch и `SUPPORT_ROUTING_DEGRADED`.

**Закрытие:** реконструировать все поля, покрыть publish→read round-trip тестами с non-default значениями. Одновременно выровнять `maxAttempts`: transport допускает 1…10, compiler — 1…5 ([DTO](../../../Lola_backend/src/composition/support-workspace/support-routing.dto.ts#L92), [compiler](../../../Lola_backend/src/modules/support-operations/domain/support-routing.ts#L200)).

### P1. Нет revision history/diff/restore и routing configuration audit projection

Текущие Queue/Policy/Workforce API показывают active draft/current published head, но не дают catalog прошлых revisions и restore-as-new-draft ([Queue client](../../src/shared/api/generated/retenive-backend.ts#L9250), [Policy client](../../src/shared/api/generated/retenive-backend.ts#L9545), [Workforce client](../../src/shared/api/generated/retenive-backend.ts#L10276)). Если Ticket 39 обещает полное versioning/audit, это backend dependency, а не имитация в браузере.

**Закрытие:** revision list/detail, semantic diff metadata, actor/time/reason и restore-as-new-draft; не активировать старую версию разрушительным rollback. Такой же безопасный паттерн использует Intercom: publish создаёт версию, история показывает автора/время, rollback создаёт новый draft ([Intercom version history](https://www.intercom.com/changes/en/134017-workflow-version-history-and-rollback)).

### Release gate, не UI-блокер

Live worker требует отдельный `SUPPORT_ROUTING_WORKER_DATABASE_URL`, отдельного DB principal и ограниченный набор grants; service fail-fast проверяет это при старте ([worker database](../../../Lola_backend/src/modules/support-operations/persistence/support-routing-worker.database.ts#L20), [capability checks](../../../Lola_backend/src/modules/support-operations/persistence/support-routing-worker.database.ts#L67)). Release proof Ticket 39 должен включать staging smoke этой capability, но frontend не должен пытаться исправлять deployment.

## Frontend gap

Сейчас Queue/Routing/Workforce authoring methods встречаются только в generated client; продуктового adapter/store/UI над ними нет ([generated Queue](../../src/shared/api/generated/retenive-backend.ts#L9250), [generated Routing](../../src/shared/api/generated/retenive-backend.ts#L9396), [generated Workforce](../../src/shared/api/generated/retenive-backend.ts#L9922)). Router содержит Case Intelligence, Macros, SLA, Notifications и Integrations, но не Teams/Workforce/Queues/Routing ([router](../../src/app/router.ts#L352)); shell navigation повторяет этот пробел ([AppShell](../../src/widgets/layout/AppShell.vue#L235)). Внутренняя remediation-документация уже помечает Workforce как «Нет UI» и планирует settings routes ([remediation plan](../specs/support-workspace-frontend/08-remediation-plan.ru.md#L101), [UX plan](../specs/support-workspace-frontend/09-ui-ux-remediation.ru.md#L111)).

Есть и permission gap: frontend registry знает routing permissions, но не canonical `project.support.teams.*` и `project.support.queues.*`, которые backend включает в каталог ([frontend registry](../../src/features/auth/permission-access.ts#L121), [backend catalog](../../../Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L87)).

## Предлагаемая IA Ticket 39

Один пункт бокового меню **«Маршрутизация»**, внутри — связанный workspace, а не россыпь несвязанных navigation items:

1. `/support/settings/routing` — обзор, readiness и activation.
2. `/support/settings/teams-skills` — Teams и Skills.
3. `/support/settings/workforce` — операторские профили и configured capacity.
4. `/support/settings/queues` — ordered Queue catalog и rule editor.
5. `/support/settings/routing/policies` — Routing Policies.
6. `/support/settings/routing/decisions` — explain/diagnostics.

Целевой flow: `Configure → Preview/Validate → Publish → Bind Queue→Policy → Readiness → Activate OFFER/AUTO_ASSIGN → Observe/Diagnose`. Это соответствует фактическим backend seams Queue, Policy, Workforce, slot и activation ([runtime controller](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L73)) и устойчивым first-party паттернам Zendesk, Intercom, Twilio и AWS ([Zendesk setup](https://support.zendesk.com/hc/en-us/articles/5866925319962-Turning-on-and-setting-up-omnichannel-routing), [Intercom publish](https://www.intercom.com/help/en/articles/7836467-preview-and-set-workflows-live), [Twilio workflow](https://www.twilio.com/docs/taskrouter/workflow-configuration), [AWS routing profiles](https://docs.aws.amazon.com/connect/latest/adminguide/routing-profiles.html)).

## Scope экранов

### 1. Routing overview и activation

- Карточки состояния Teams/Skills, Workforce, Queues, Policies и bindings: draft/published, version, freshness, last publish, active pins.
- Server-owned readiness checklist с blocking errors/warnings и deep links к repair target.
- Activation wizard/drawer: выбранная Queue, Policy/Workforce/generation pins, затрагиваемые teams/cases, reason code, явное подтверждение OFFER или AUTO_ASSIGN.
- При timeout/unknown mutation outcome — refetch activation; не показывать успех только по локальному optimistic state.
- Deactivate сохраняет Queue slot и опубликованные configs.

### 2. Teams и Skills

- Searchable catalogs, create/rename/archive, member picker, required/preferred skills и language requirements.
- Coverage summary: операторов в team, capacity, skill/language gaps, archive impact.
- Архивация с reference check и понятным conflict recovery.

Zendesk сочетает skill catalog с назначением skills агентам и предупреждает, что routing без подходящих skilled agents не сработает ([Zendesk skills](https://support.zendesk.com/hc/en-us/articles/4408838892826-Creating-agent-skills-to-use-for-routing), [skills routing](https://support.zendesk.com/hc/en-us/articles/5833468891674-About-using-skills-to-route-tickets)).

### 3. Workforce

- Operator matrix: presentation, team, capacity units, skills 1…5, languages/proficiency; поиск, фильтры, bulk edit.
- Явное разделение configured capacity и live availability: availability уже отдельное runtime-состояние, его нельзя незаметно записывать в Workforce draft ([workforce DTO](../../../Lola_backend/src/composition/support-workspace/support-workforce.dto.ts#L182), [availability API](../../src/shared/api/generated/retenive-backend.ts#L8778)).
- Autosaved/local dirty state не выдавать за server draft; Replace Draft и Publish — отдельные подтверждённые сервером состояния.
- Coverage/validation до publish: orphan capacity, team member without capacity, empty primary/fallback team.

Zendesk использует именованные capacity profiles и per-channel limits; агент принадлежит одному профилю, а eligibility требует свободной capacity ([Zendesk capacity rules](https://support.zendesk.com/hc/en-us/articles/4776409839770-Creating-capacity-rules-to-balance-agent-workloads)). Intercom показывает live workload/capacity ratio отдельно от настройки assignment limits ([Intercom monitoring](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity), [limits](https://www.intercom.com/help/en/articles/12960865-inbox-assignment-limits)).

### 4. Queues

- Ordered catalog по route priority: drag handle плюс **Move up/down**; conflict/overlap/default-path warnings.
- Guided nested rule builder `All/Any/Not` с rows `field / operator / value`; raw JSON не основной интерфейс.
- Routing section: DISABLED/OFFER/AUTO_ASSIGN draft mode, primary team, ordered fallback teams.
- Sort builder, preview count/sample, READY/BUILDING/DEGRADED freshness, publish state.
- Перед reorder показывать blast radius; routePriority conflict перезагружает authoritative catalog.

Zendesk применяет All/Any conditions, primary и fallback groups; custom queues проверяются по порядку, и срабатывает первое совпадение ([create queues](https://support.zendesk.com/hc/en-us/articles/6716530152858-Creating-custom-omnichannel-routing-queues), [queue order](https://support.zendesk.com/hc/en-us/articles/6712096584090-Understanding-how-omnichannel-routing-uses-queues-to-route-work-to-agents)). Twilio также вычисляет ordered filters сверху вниз и требует default path ([Twilio workflow configuration](https://www.twilio.com/docs/taskrouter/workflow-configuration)).

### 5. Routing Policies

- Guided sections: mandatory/preferred skills и languages, capacity weight, hard utilization, candidate score weights, Queue weights, offer/reservation timeouts, retry/cooldown/fallback delay.
- Numeric input сопровождает plain-language preview; ошибки показываются рядом с полем и в summary `N errors / M warnings` с jump-to-field.
- Live опубликованная версия read-only; Edit создаёт/обновляет draft; Preview/Validate и Publish — отдельные действия.
- History/diff/restore появляется только после P1 contract; restore создаёт новый draft.

Intercom блокирует preview/publish при path errors и отсутствии fallback, разделяет live и draft и создаёт версию на publish ([workflow builder](https://www.intercom.com/help/en/articles/6611595-using-the-workflows-builder), [preview and set live](https://www.intercom.com/help/en/articles/7836467-preview-and-set-workflows-live)). Salesforce отделяет Queue от Routing Configuration и выражает routing model, priority и capacity человеческими настройками ([routing configuration](https://help.salesforce.com/s/articleView?id=service.service_presence_create_routing_configuration.htm&language=en_US), [settings](https://help.salesforce.com/s/articleView?id=service.service_presence_routing_configuration_settings.htm&language=en_US&type=0)).

### 6. Decisions, diagnostics и audit

- Catalog: time, outcome, Case, Queue, Team, selected operator, candidate/exclusion counts, latency, pinned revisions.
- Detail drawer: evaluated path, ordered candidates, eligibility/exclusions, score breakdown, fact versions, deep link to Case.
- Не переводить неизвестный enum в «ошибку»: показывать safe fallback code и сохранять raw evidence для support.
- После P1: configuration audit с actor/time/reason, semantic diff и restore-as-new-draft.

Twilio событийно различает workflow entry/filter match/timeout, reservation created/accepted/rejected и worker capacity/activity changes; это хороший шаблон Case routing timeline ([TaskRouter events](https://www.twilio.com/docs/taskrouter/api/event), [event reference](https://www.twilio.com/docs/taskrouter/api/event/reference)). Intercom troubleshooting отдельно объясняет overlap, unmatched audience, missing fallback и unavailable team ([assignment troubleshooting](https://www.intercom.com/help/en/articles/11961281-manage-and-troubleshoot-assignment-workflows)).

## Visual и motion direction

Интерфейс должен выглядеть как спокойный операционный control plane: компактные status chips, ясная типографическая иерархия, split view «catalog → editor/inspector», тонкие связи между Queue, Policy и Workforce. Анимация только объясняет изменение: reorder, insert/remove rule branch, readiness transition, simulated path highlight. Никаких постоянных glow, parallax или декоративной активности.

`prefers-reduced-motion` заменяет пространственные/scale transitions мгновенным состоянием или короткой opacity-сменой ([WCAG animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions), [W3C C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).

## Accessibility acceptance

- Queue/rule reorder не drag-only: single-pointer кнопки Move up/down и keyboard actions сохраняют focus ([WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).
- Обычные read tables остаются semantic tables; ARIA Grid применяется только к настоящей composite editable matrix и следует grid keyboard model ([APG Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)).
- Readiness/publish errors имеют текст, связаны с полем и доступны через jump-to-field; красный/зелёный не единственный канал ([Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification), [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).
- Async preview/readiness сообщает итог через `role=status`; blocking publish error — через alert, без chatty live region ([Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)).

## План реализации Ticket 39

### Gate 0 — backend prerequisites и frontend contract sync

1. На backend добавить Queue slot read/catalog и typed readiness projection.
2. На backend типизировать Policy и Decision responses.
3. На backend добавить operator presentation catalog/resolver.
4. На backend исправить Policy projection round-trip и retry validation mismatch.
5. Для полного audit/version promise на backend добавить revision history/detail/restore-as-new-draft.
6. После стабилизации API на frontend актуализировать OpenAPI/generated client и удалить obsolete rollout/admission API.

### Frontend slices

1. Feature module, adapters, permissions, routes, shell navigation и shared server-state conventions.
2. Teams/Skills и operator presentation picker.
3. Workforce matrix, validation, draft/publish.
4. Queue catalog/rule editor/preview/publish/reorder.
5. Policy editor/validate/publish/version view.
6. Queue-slot binding, readiness и safe activation wizard.
7. Decisions explain drawer, audit/history.
8. Responsive/accessibility/motion pass, contract tests, component tests и end-to-end happy/failure paths.

Все mutations используют `Idempotency-Key`, `If-Match`/ETag там, где контракт требует, и reload authoritative state на 409/428/timeout; браузер не вычисляет readiness, ranking, capacity reservation или routing result самостоятельно ([slot command](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L135), [activation command](../../../Lola_backend/src/composition/support-workspace/support-routing-runtime.controller.ts#L102)).

## Definition of Done / acceptance criteria

1. Пользователь с read permissions видит весь routing topology и diagnostics, но не mutation controls; manage permissions открывают только разрешённые Teams/Queues/Routing действия ([backend permission catalog](../../../Lola_backend/src/modules/iam/authorization/permission-catalog.ts#L87)).
2. Из UI можно создать/изменить/архивировать Team и Skill, собрать Workforce, сохранить draft и publish без ручных API-вызовов.
3. Из UI можно создать Queue, построить nested rules и sort, выбрать primary/fallback teams и mode, выполнить server preview, publish и изменить order доступным не-drag способом.
4. Из UI можно создать и publish typed Routing Policy без редактирования JSON.
5. Queue slot можно прочитать, создать/изменить и увидеть после reload, включая DISABLED Queue.
6. Readiness показывает каждую server-owned prerequisite отдельным стабильным статусом и deep link; generic `CONFIGURATION_REQUIRED` больше не тупик.
7. OFFER/AUTO_ASSIGN activation невозможна при blocking readiness; успешная activation показывает pinned Queue generation, Policy revision и Workforce revision.
8. При 409/428/timeout UI не утверждает успех, сохраняет несохранённый ввод и предлагает reload/merge/retry с новым idempotency key по контракту.
9. Decision detail показывает Queue/Team/operator presentations, candidate order, exclusions, scores, fact versions и переход к Case; raw UUID используется только как secondary technical detail.
10. Version history показывает author/time/reason/diff; restore создаёт новый draft и требует отдельного publish.
11. Keyboard-only и reduced-motion сценарии покрывают rule editing, reorder, publish, readiness и activation; statuses доступны без цвета и объявляются assistive technology.
12. Staging E2E доказывает полный путь: configure → publish → bind → activate AUTO_ASSIGN → available operator receives Case → decision explain совпадает с assignment; отдельно проверяются no eligible operator, capacity gap, stale ETag и degraded worker.

## Не входит / не дублировать

Ticket 39 не переписывает существующие manual assignment/reassignment, OFFER accept/decline, operator availability control и Case result presentation: эти поверхности уже имеют отдельные frontend/backend seams ([offer API](../../src/shared/api/generated/retenive-backend.ts#L8725), [availability API](../../src/shared/api/generated/retenive-backend.ts#L8778), [workspace assignment presentation](../../src/features/support-workspace/api/support-workspace-source.ts#L232)). Ticket связывает их с новым configuration/activation/diagnostics control plane и даёт переходы, но не создаёт второй источник истины.

## Рекомендованный итог для issue #39

Оформить Ticket 39 как frontend epic с обязательным **Gate 0**. Формулировка «backend полностью готов, нужны только экраны» сейчас неточна из-за write-only Queue slots, отсутствующей readiness projection, open DTOs/operator presentation seam и дефекта Policy projection. Stale OpenAPI — отдельный frontend integration blocker. После закрытия Gate 0 backend domain/runtime можно считать достаточным, а Ticket 39 — полным продуктовым завершением маршрутизации, а не декоративной settings-страницей.
