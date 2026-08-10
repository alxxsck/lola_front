# Support Workspace core pilot: frontend release proof

> Historical evidence. Решение superseded by ADR-0047 и не является действующим runbook.

Статус: frontend implementation/rehearsal complete; production pilot не запускался

Дата: 9 августа 2026 года

Backend candidate: `9f36796b477d34fcac2a9a46844bbd78863df6e1`
Pinned OpenAPI: `sha256:2f4da7559279192a20fd77bf07e72c377d9a031724a0d77a21a81aecd521ee44`

Этот документ закрывает frontend-часть Ticket 29. Он дополняет authoritative
backend runbooks `docs/setup/support-core-pilot.ru.md` и
`docs/setup/support-workspace-shell-cutover.ru.md`, но не подменяет immutable
backend phase manifests и общий Issue 19 chaos/restart/migration proof.

## 1. Владельцы и change ticket

До production окна change ticket обязан назначить четыре роли:

1. Release owner — единственный владелец `GO/ABORT` и Project shell command.
2. Support operations owner — Assignment/SLA и операторский P0 flow.
3. Conversation owner — accepted Message, unread и delivery recovery.
4. Incident commander — отдельный человек для emergency rollback.

В change ticket фиксируются pilot Project, UTC window, immutable candidate и
hashes evidence. Имена людей, End User IDs, message/draft content и PII в repo
или telemetry не записываются.

## 2. Frontend operational surface

Route `/support/settings/audit-rollout` code-split и закрыт exact Permission
`project.support.workspace.rollout.manage`. Он не зависит от canonical shell и
не встроен в Lead Control. UI показывает current Project, authoritative root,
version и отдельно admission, если actor имеет Cases/Conversations read.
Manage-only actor не получает синтетический admission.

Доступны только четыре preset:

- enable pilot: сохраняет `enabled=true`, ставит `shellEnabled=true`, `hardOff=false`;
- normal rollback: сохраняет `enabled/hardOff`, ставит `shellEnabled=false`;
- emergency hard-off: сохраняет `enabled`, ставит `shellEnabled=false`, `hardOff=true`;
- clear hard-off: сохраняет `enabled`, оставляет shell выключенным и снимает hard-off.

No-op, enable при `enabled=false` и enable до отдельного clear hard-off
отклоняются локально. PUT отправляет все поля,
exact quoted opaque `If-Match` и stable `Idempotency-Key`. Receipt проверяется
против exact intent, затем root перечитывается. При transport timeout разрешён
только exact replay. Actor+Project session coordinator сохраняет неизвестную
или незавершённую попытку при Project switch/unmount и блокирует новый intent;
Refresh во время mutation/recovery недоступен. Version conflict перечитывает root, сохраняет reason и
требует нового подтверждения/ключа. Reuse/unavailable quarantine не объявляет
успех. `401/428` не replay-ится; `403/404` очищает protected DOM и cache.

## 3. Pilot protocol

READ_ONLY выполняется при `shellEnabled=false`: admission обязан быть
`LEGACY_LAUNCHER/LAUNCHER_ONLY`. Сверяются только server IDs/revisions без
content. Project switch, reconnect, revoke и Back fail closed; любой stale или
cross-Project result означает abort.

WRITE — один audited OCC enable для одного Project, затем first unread →
monotonic ACK → claim/Assignment → accepted reply → delivered/read → SLA.
Legacy launcher не пишет, dual-write запрещён. Unknown send использует только
authoritative lookup/exact idempotency recovery.

ROLLBACK — exact OCC disable, проверка launcher-only, concealed direct route и
неизменности committed Message/read/delivery/Assignment/SLA. Re-entry требует
нового OCC и полного preflight; migration/domain records не откатываются.

## 4. SLO, success и abort

До окна фиксируются: inbox/detail p95 `<500 ms`, message page p95 `<400 ms`,
accepted ADMIN reply p95 `<500 ms`, outbox p99 age `<5 s`.

Success: loss/duplicates/disclosure/revoke leaks/unread-delivery mismatch/
double-current-assignment/SLA drift = `0`, unknown outcome полностью reconciled,
SLO выдержаны всё окно, P0 flow завершён без legacy write.

Abort: любая перечисленная correctness/privacy ошибка, unrecoverable timeout,
unbounded DB pool wait или два последовательных SLO-breach окна. Attachments,
Macros, Knowledge, personal notifications и External Work не блокируют core
rollback.

## 5. Frontend evidence

- Source/controller/component/router unit tests: exact headers, receipt shape,
  same-key replay, conflict, scope fencing, duplicate suppression, permission
  purge, manage-only admission и safe copy.
- Contract mutations: обе published permissions, required headers/body,
  quoted ETag, reason bounds, typed `409`/error enums.
- Playwright: enable → canonical → rollback → launcher; reconnect, live revoke,
  Project switch/Back, reply/draft preservation; существующий core suite
  покрывает translation, Assignment, classification, conflict, unread и delivery.
- Undisabled axe: critical/serious = `0` на rollout и canonical core route.
- Visual evidence: `1440×1000`, `1280×800`, `1024×768`, `768×1024`,
  `390×844`, `320×568`, light/dark, 200% и mobile keyboard находятся в
  `docs/evidence/support-workspace/ticket-29-*`.
- Telemetry `retenive:analytics` использует allowlist: operation/outcome,
  duration, duplicate/recovered booleans, bounded mismatch count и coarse
  viewport. Content, draft, filenames, names, IDs, signed URLs и raw errors
  отбрасываются. События вызываются реальными reply, realtime/draft,
  unread-ACK и delivery-reconcile controllers; browser отдаёт duration для
  aggregate P95, но KPI truth и фактический production P95 остаются evidence
  pilot window у Release owner.

Production release owner отдельно запускает exact backend
`READ_ONLY → WRITE → ROLLBACK` preflight chain с create-only manifests. Локальные
mock screenshots и frontend E2E не являются production `GO`.
