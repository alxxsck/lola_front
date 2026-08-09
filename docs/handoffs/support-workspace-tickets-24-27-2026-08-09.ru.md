# Handoff: Support Workspace, Tickets 24–27

Дата: 9 августа 2026 года
Frontend repo: `/Users/alxxsck/Documents/Lola_front`
Backend repo: `/Users/alxxsck/Documents/Lola_backend`

## 1. Цель текущей серии

Последовательно завершить frontend Tickets 24, 25, 26 и 27 по общей Support Platform
документации и локальным frontend tickets. Для каждого пункта требуется отдельный commit в
локальном `main`, тесты, живая проверка, desktop/mobile screenshots и независимый review по
двум осям: Standards/architecture/security и Spec/acceptance.

P0 и P1 исправляются до commit. P2 сознательно откладываются. Push не выполняется.

## 2. Git-состояние

Текущая frontend ветка: `main`.

Последний committed HEAD:

```text
20cf9091 Support Workspace: complete Lead Control center
```

Локальный `main`: `0 behind / 3 ahead` относительно `origin/main`.

Готовые отдельные commits:

```text
8793915e Support Workspace: add versioned support macros       # Ticket 24
531c4b38 Support Workspace: add internal knowledge citations  # Ticket 25
20cf9091 Support Workspace: complete Lead Control center      # Ticket 26
```

Ticket 27 полностью реализован, прошёл финальный gate и зафиксирован отдельным local `main`
commit с сообщением `Support Workspace: add personal browser notifications`. Push не выполнялся.

Backend commit Ticket 27: `8758358e SP-27 Complete personal browser notification frontend contract`.
Он является предком локального backend `main`. Backend working tree сильно загрязнён чужой
последующей работой по external work; его нельзя чистить, переписывать или использовать для
повторной генерации контракта. Если потребуется новая генерация, брать exact committed tree
`8758358e` через чистый worktree.

Pinned OpenAPI уже синхронизирован с Ticket 27:

```text
sha256:0dd3e0813d772df946354c2a64ecbffbb07e6ef2eff8b9a0b977ca4696718c8c
```

## 3. Что завершено

### Ticket 24 — Support Macros

Commit: `8793915e`.

Реализованы operator catalog, category/scope/locale context, slash/templates flow, versioned
Macro Draft для public reply и internal note, перевод Macro source, immutable provenance,
pagination, authoring/history/rollback, OCC, revoke/stale recovery и fail-closed mode switch.
Общий Conversation Surface сохранён; отдельный composer не создавался.

Финальный review Ticket 24: P0/P1 PASS.

### Ticket 25 — Support Internal Knowledge

Commit: `531c4b38`.

Реализованы operator search/open, TEXT/FILE flow, one-shot download grant, problem report,
server-owned citation draft, quote/link insert, translation/send provenance, source-change/revoke
recovery, Case/actor/project fencing и public-draft purge только для действительно привязанного
Knowledge content.

Финальный review operator scope: P0/P1 PASS. Известный отдельный backend limitation полного admin
manage scope: direct mutations `setCapabilities`, `setRetentionPolicy`, `resolveProblemReport`
пока не имеют actor-bound unknown-outcome command recovery. Это не блокировало operator Ticket 25.

### Ticket 26 — Lead Control

Commit: `20cf9091`.

Реализованы admission-first gate, summary/KPI freshness, Case risks, routing capacity, canonical
filtered drill-down, causal investigation, отдельная protected Activity, operational alerts,
owner catalog/change-owner, assignment desk reuse, degraded states, cursor windows, revoke purge
и independent pagination lanes.

Финальные проверки Ticket 26:

```text
Vitest full suite: 392 files / 2544 tests PASS
build PASS
typecheck PASS
lint + architecture PASS
api:check PASS, 114 operations
Playwright Support Control: 6/6 desktop + mobile PASS
final independent reviews: no P0/P1
```

## 4. Ticket 27 — что уже реализовано в dirty tree

Назначение: персональные browser Push notifications для Support operator.

Backend публикует только два текущих topics:

```text
SUPPORT_CASE_ATTENTION
SUPPORT_CASE_ASSIGNED_TO_ME
```

`SUPPORT_CASE_CREATED` и Project-wide editor намеренно НЕ входят в Ticket 27. Это backend 35 /
frontend 38. Не добавлять fake toggle «Все новые обращения».

Реализовано:

- отдельная страница `/support/settings/notifications` и nav item;
- точный IAM gate через опубликованные Support permissions, без role inference;
- admission/rollout `DISABLED / ASSIGNMENT_ONLY / ATTENTION_ENABLED`;
- три независимых состояния UI: browser permission, local Push subscription, backend device;
- честный delivery status: preference не равна фактической доставке;
- two-topic preferences с version/OCC/idempotency и partial-receipt merge;
- device list ACTIVE/REVOKED и versioned revoke;
- явный user gesture для первого `Notification.requestPermission()`;
- iOS/iPadOS installed-app recovery, включая desktop-mode iPad UA;
- VAPID revision + endpoint association, automatic rotation recovery, old endpoint retirement;
- `pushsubscriptionchange` и page reconcile даже при неудачном auto-resubscribe;
- serialized connect/revoke;
- reused idempotency attempts при ambiguous preference/register/revoke outcome;
- actor/project/generation fences после каждого async boundary;
- logout lifecycle: captured-token server revoke, затем local unsubscribe/storage purge, затем remote
  auth logout; локальная auth authority очищается немедленно;
- Service Worker принимает closed version/topics, показывает только generic no-PII copy;
- capability передаётся только во fragment:
  `/support/notifications/open#capability=...`;
- router забирает и очищает fragment ДО auth restore/login redirect;
- capability хранится только in-memory, не попадает в path/query/storage;
- после login backend одноразово re-authorizes actor/membership/Case и открывается canonical
  `support-inbox-case` exact Project;
- denied, expired, concealed 403/404 и invalid capability имеют безопасный recovery UI;
- desktop/mobile компоновка, responsive cards, reduced-motion и accessible labels;
- issue, blocker audit и capability matrix обновлены со stale `blocked` на фактический статус.

Основные новые файлы:

```text
src/features/support-notifications/api/support-notifications-source.ts
src/features/support-notifications/model/browser-push-adapter.ts
src/features/support-notifications/model/browser-push-registration-store.ts
src/features/support-notifications/model/support-notification-capability.ts
src/features/support-notifications/model/support-notification-logout.ts
src/features/support-notifications/model/use-support-notifications.ts
src/features/auth/logout-cleanup.ts
src/pages/SupportNotificationSettingsPage.vue
src/pages/SupportNotificationOpenPage.vue
public/support-push-sw.js
e2e/support-notifications.spec.ts
scripts/support-push-sw.test-node.mjs
```

Контракт и generated client изменены ожидаемо:

```text
openapi/retenive-backend.json
openapi/retenive-backend.contract.json
src/shared/api/generated/retenive-backend.ts
src/shared/api/generated/models/*PersonalSupportNotification*
```

## 5. Закрытая критическая точка

Live mismatch после connect исправлен без отдельного UI boolean. Причиной был закэшированный
negative `computed`: actor-scoped association записывалась в `localStorage`, но эта запись не была
реактивной для текущего controller. Association теперь хранится в actor-scoped reactive state и
сопоставляется с точными browser endpoint/key revision и ACTIVE server device.

Дополнительно mock subscription/preferences/devices сохраняются через reload, поэтому regression
проверяет `Подтверждена` и `Этот браузер` сразу после connect и после нового controller/page load.

Во время независимых reviews закрыты P0/P1 вокруг actor/project fencing, remote REVOKED authority,
same-endpoint reconnect, deep-link auth race и logout/connect lifecycle. Последняя использует общую
serialized browser queue, actor/idempotency receipt recovery и deadline-bounded logout; зависший
browser prompt не блокирует logout, а финальный unsubscribe остаётся в очереди best effort.

## 6. Финальный результат Ticket 27

Ручная проверка desktop и mobile выполнена для initial state, connect, обоих topic toggles,
refresh, revoke, reconnect и reload. Deep link проверен в authenticated и expired/login flows;
denied/unsupported/iOS installed-app recovery покрыты component/adapter tests. На mobile 390×844
horizontal overflow отсутствует.

Финальный gate:

```text
focused support-notifications tests PASS
Node contract / Service Worker tests PASS
api:check PASS, 114 operations + pinned OpenAPI hash
typecheck PASS
lint + architecture PASS
test:scripts PASS, 53 tests
Vitest full suite PASS, 398 files / 2576 tests
build PASS
Playwright desktop + mobile PASS, 6/6
git diff --check PASS
final independent Standards/architecture/security review: P0/P1 PASS
final independent Spec/acceptance review: P0/P1 PASS
```

Screenshots визуально проверены:

```text
test-results/support-notifications-conn-3af5e-preference-and-device-state-chromium/support-notifications-desktop.png
test-results/support-notifications-conn-3af5e-preference-and-device-state-mobile-chromium/support-notifications-mobile.png
```

Отложенный P2: привести notification settings panels к общему Support Workspace visual system
(`14px` radius, quiet borders/tonal shifts, без декоративного `shadow-sm`). Текущая responsive
компоновка и доступность зелёные; scope Ticket 27 это не блокирует.

Ticket 27 зафиксирован отдельным local `main` commit:

```text
Support Workspace: add personal browser notifications
```

После commit frontend `main` clean. Push не выполнялся. Текущая серия 24–27 закончена;
Ticket 28 не начат.

## 7. Обязательные проверки перед commit

Сначала tight loop:

```bash
npx vitest run \
  src/features/support-notifications \
  src/pages/SupportNotificationSettingsPage.test.ts \
  src/app/router.test.ts \
  src/widgets/layout/AppShell.test.ts \
  src/features/auth/auth.store.test.ts \
  src/shared/api/http/axios-instance.test.ts

node --test \
  scripts/support-push-sw.test-node.mjs \
  scripts/support-content-lead-notification-contract.test-node.mjs

npx playwright test e2e/support-notifications.spec.ts --project=chromium
```

Финальный gate только последовательно, чтобы generation не конфликтовала с test import:

```bash
npm run api:check
npm run typecheck
npm run lint
npm run test:scripts
npm test
npm run build
git diff --check
```

Известный глобальный шум: Orval может печатать существующий `MissingPointer` по шести dangling
backend refs. Ticket 27 API gate при этом проверяет 114 operations и immutable pinned hash. Не
маскировать новый warning этим известным шумом, но и не расширять Ticket 27 на external-work DTO
без отдельного решения.

## 8. Документация, с которой обязательно сверяться

Frontend:

```text
AGENTS.md
.interface-design/system.md
.scratch/support-workspace/issues/24-add-support-macros.md
.scratch/support-workspace/issues/25-add-support-internal-knowledge.md
.scratch/support-workspace/issues/26-complete-lead-control.md
.scratch/support-workspace/issues/27-add-browser-notification-settings.md
docs/specs/support-workspace-frontend/08-remediation-plan.ru.md
docs/specs/support-workspace-frontend/09-ui-ux-remediation.ru.md
docs/specs/support-workspace-frontend/11-remaining-implementation-backlog.ru.md
docs/specs/support-workspace-frontend/15-content-lead-notification-capability-matrix.ru.md
docs/research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md
docs/research/support-platform-operator-workspace-primary-sources-2026-08-07.ru.md
```

Backend exact normative sources:

```text
docs/specs/support-platform/20-personal-browser-notifications.ru.md
src/modules/notifications/personal/personal-support-notification*.controller.ts
src/modules/notifications/personal/personal-browser-push-subscription.service.ts
src/modules/notifications/personal/personal-support-notification-deep-link.service.ts
src/modules/notifications/personal/personal-support-notification.dto.ts
```

Для уже завершённых соседних verticals:

```text
docs/specs/support-platform/15-macros-internal-notes.ru.md
docs/specs/support-platform/16-internal-knowledge.ru.md
docs/specs/support-platform/09-team-lead-control-center.ru.md
docs/specs/support-platform/10-operational-alerts.ru.md
```

## 9. Правила продолжения

- Использовать `ask-matt` как router: эта работа находится на последнем шаге `/implement`;
  внутри — tight-loop TDD, затем `/code-review`, затем commit.
- Для UI использовать `interface-design`; проверять hierarchy, grid, typography, spacing, colors,
  transitions, focus, reduced motion, empty/loading/error/degraded/revoke states.
- Работать в текущем frontend `main`, без нового worktree и без новой feature branch — это явное
  правило пользователя для этой серии.
- Один ticket = один commit. Ticket 27 нельзя смешивать с Ticket 28.
- Не push. Если позже пользователь попросит push, сначала выполнить правило `AGENTS.md`: fetch
  origin, rebase local commits onto свежий `origin/main`, повторно проверить, затем push.
- Не трогать чужой dirty backend working tree.
- Не принимать роль или label за authority. UI использует exact server permissions,
  admission/capabilities и allowed state.
- Любой 401/403/concealed 404/revoke должен немедленно очищать sensitive DOM/cache/watch.
- Любой async result fenced по actor + Project + generation; Project/actor switch очищает старую
  projection до нового read.
- OCC/idempotency: тот же intent после ambiguous outcome повторяется с тем же key/body; changed
  intent получает новый key. Server receipt валидируется до UI success.
- Push secrets (`endpoint`, `p256dh`, `auth`, capability) не логировать и не рендерить.
- Capability не хранить в local/session storage и не помещать в path/query.
- Browser permission, local subscription, backend registration и effective delivery — разные
  состояния; не сводить их к одному toggle.
- `SUPPORT_CASE_CREATED` не выдумывать.
- Не создавать второй Conversation Surface/composer.
- Каждый UI change проверять desktop + mobile + keyboard/axe; screenshots после финального зелёного
  прогона обязательно приложить пользователю.
- Review фиксирует P0/P1. P2 не превращать в scope creep текущей серии.

## 10. Состояние review на момент handoff

До последней итерации два независимых агента нашли и помогли закрыть:

- path/query leakage deep-link capability;
- logout без revoke/unsubscribe;
- VAPID/endpoint rotation и stale ACTIVE device;
- actor/project async races;
- allowed-to-allowed IAM transition;
- stale projection при Project switch;
- connect/revoke race;
- iPadOS desktop UA;
- idempotency/receipt gaps;
- missing Service Worker push/click/rotation tests;
- stale blocker documentation.

Окончательный re-review после всех последних правок был запущен, но текущий чат был остановлен до
финального ответа агентов. Поэтому новый чат обязан запустить review заново, а не считать прежний
PASS автоматически действительным.
