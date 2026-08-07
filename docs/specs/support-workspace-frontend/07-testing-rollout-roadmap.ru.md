# Support Workspace: тестирование, этапы и rollout

## 1. Стратегия поставки

Проект выпускается вертикалями. Каждая вертикаль включает contract fixtures,
repository, state machine, UI, permission cases, accessibility и e2e. Большой
одновременный rewrite `UserWorkspaceDialog` запрещён.

## 2. Этапы

### F0. Contract freeze и foundation

Зависимости:

- merged backend commit;
- pinned OpenAPI и examples;
- permission catalog/capabilities;
- message ordinal/author mapping.

Frontend:

- добавить route shell `/support/inbox` за flag;
- создать module boundaries и repository interfaces;
- перенести `ordinal` и `authorSnapshot` в domain/mappers;
- scoped project/selection/generation state;
- layout primitives и safe identity header;
- characterization tests текущего chat flow;
- извлечь общий Conversation Surface из `UserWorkspaceDialog`, сохранив
  существующий toggle `Оригинал / Перевод`, message renderer, translation
  progress, realtime reconcile, draft и composer;
- подключить Users/Profile и Support adapters к одному Surface и удалить
  `.message-row` chat renderer из `EndUserCaseDetail.vue`.
- заменить PrimeVue maximize отдельным full-tab presentation shell; сохранить
  тот же Surface/state при `На весь экран / Свернуть`, сделать один scroll-lock
  owner и добавить reduced-motion fallback.

Exit: новый route и user chat открывают read-only выбранную Conversation через
один Surface без регрессий старого dialog; shared behavior suite проходит для
обоих adapters, второго message renderer в production source нет. Full-tab
shell совпадает с viewport вкладки, не показывает CMS background и не меняет
selection/draft/translation/message anchor.

### F1. Project inbox и рабочая selection

- Cases/All Conversations modes;
- cursor, filters, sort, deep link;
- safe inbox row;
- selected workspace/messages;
- desktop/tablet/mobile navigation;
- existing translation и AI Suspension composition;
- переходы из `/live`, `/users`, `/cases`.

Exit: оператор находит Conversation на уровне project и читает её в новом route.

### F2. Durable messaging, unread и delivery

Зависит от chat contract milestones identity/read/delivery.

- ordinal history/gap reconcile;
- first unread и viewport ACK;
- per-message delivery;
- durable offline send;
- idempotency lookup/retry;
- draft recovery на `409`/unknown outcome;
- публичный responder mode.

Exit: reload/reconnect/offline delivery не создаёт дублей и не теряет draft.

### F3. Case context, assignment, availability и SLA

- Case/User/Data/Activity inspector;
- claim/transfer/assignment offers;
- availability/capacity;
- SLA clocks и waiting side;
- server allowed actions и version conflicts;
- target authority/revoke purge.

Exit: оператор понимает ownership и выполняет разрешённый Case lifecycle.

### F4. Collaboration presence

- watch lifecycle;
- viewers/typing TTL/generation;
- collision warning;
- Lola AssistantTurn typing;
- no draft leakage.

Exit: hints устойчивы к reconnect и не меняют assignment/availability.

### F5. Attachments

- capabilities/limits;
- upload tray и scan states;
- public/note isolation;
- image/document cards;
- grants, revoke/tombstone;
- accessibility и security telemetry.

Exit: image, document, multi-file и attachment-only Message проходят full flow.

### F6. Internal collaboration и content

- Internal Notes;
- macros;
- Knowledge search/open/link/quote;
- content revisions/rollout;
- permission-sensitive history/redaction.

Exit: note невозможно отправить публично, macro/knowledge сохраняют provenance.

### F7. Lead Control и alerts

- `/support/control`;
- live KPI/freshness/drill-down;
- action tables и causal timeline;
- alert acknowledge/assign/close;
- override commands с reason/version.

Exit: lead от риска переходит к точному Case и выполняет audited action.

### F8. QA и analytics

Начинается только после отдельных backend/IAM contracts.

- `/support/quality`, review snapshots и scorecards;
- feedback/dispute/calibration;
- `/support/analytics`, metric catalog, reports и secure drill-down;
- export/share permissions.

Exit: браузер не считает project metrics и review score из raw chat pages.

### F9. Hardening и cutover

- нагрузочные/reconnect/revoke/security тесты;
- accessibility audit;
- pilot projects и операторское наблюдение;
- performance budgets;
- legacy dialog launcher → deep link;
- удаление старого CHAT orchestration после adoption gate.

## 3. Test pyramid

### Unit: state machines и pure logic

- ordinal merge, duplicate и gap;
- cursor/view/query serialization;
- first unread и monotonic read high-water;
- delivery transitions и запрет downgrade;
- draft keys public/note/project/actor;
- idempotency/unknown outcome reducer;
- typing TTL/generation;
- translation preview invalidation;
- attachment transitions/limits;
- access/availability field rendering;
- metric formatter freshness/no-data.

Использовать fake clock для TTL/debounce/deadline. Не привязывать тесты к
внутренним refs компонента, если можно проверить public state/use case.

### Contract/repository

Для каждой операции fixtures:

- минимальный success;
- полный success;
- cursor next/empty;
- stale revision;
- forbidden/target hidden;
- `409` conflict;
- partial bulk result;
- unknown outcome/lookup;
- forward-compatible unknown enum;
- sensitive fields absent/redacted.

Contract tests проверяют, что mapper не теряет ordinal, author, delivery,
allowedActions и provenance.

### Component/integration

- Inbox row variants и selected state;
- Message roles/notes/system/tombstone/attachments;
- header independent state chips;
- public/note composer recovery;
- inspector permission mount/unmount;
- drawers/focus return;
- table bulk partial outcomes;
- dashboard stale/fresh states;
- scorecard schema/validation.

Network мокается на repository boundary или MSW equivalent, не через подмену
внутренностей composable.

### E2E

Обязательные сценарии:

1. Operator: inbox → first unread → claim → reply → delivered/read → close.
2. Translation: preview → edit → stale → refresh → send; provider failure/bypass.
3. Note: написать note с attachment и убедиться, что End User его не видит.
4. Conflict: два оператора, watcher warning, assignment `409`, draft сохранён.
5. Reconnect: send timeout → lookup → один Message.
6. Permission revoke: открытый profile/note очищается, watch прекращается.
7. Project switch: никакой selection/draft/PII leakage между project.
8. Attachment: upload/scan/reject/retry/revoke/download grant.
9. Lead: stale KPI → refresh → drill-down → override partial result.
10. QA: snapshot → evidence → submit → received feedback по scope.
11. Mobile route stack и browser Back с draft.
12. Keyboard-only основной operator flow.
13. Windowed → full-tab → windowed: exact viewport geometry, draft/selection/
    translation/scroll anchor сохранены, background не scrollится.
14. Full-tab + nested dialog/menu: focus/Escape stack и reference-counted
    scroll lock не ломаются после закрытия вложенного overlay.

Тестировать реальный backend API отдельно от mock mode; mock не является
доказательством idempotency, permission или realtime ordering.

## 4. Realtime и race matrix

| Race                                         | Ожидаемый результат                       |
| -------------------------------------------- | ----------------------------------------- |
| Message event раньше POST receipt            | Один Message после merge по identity      |
| Старый selection response после переключения | Игнорируется generation guard             |
| Reconnect с пропуском events                 | Checkpoint gap → REST snapshot            |
| Assignment изменился во время набора         | Draft сохранён, allowed actions refreshed |
| Permission revoke во время inspector load    | Response не commit-ится, cache очищен     |
| Translation preview и source edit            | Preview stale, send заблокирован          |
| Attachment READY после ухода                 | Возвращается в правильный draft key       |
| Retry после timeout, original уже accepted   | Lookup возвращает original receipt        |
| Read ACK out of order                        | High-water не уменьшается                 |
| Typing stop старой generation                | Новый typing state не сбрасывается        |

## 5. Accessibility checklist

- полный flow без мыши;
- visible focus и focus not obscured;
- 200% zoom/reflow;
- `role="log"` с polite announcements;
- author, visibility и delivery имеют accessible text;
- status/error announcements не дублируются;
- все drag actions имеют single-pointer alternative;
- target minimum 24×24 CSS px, product target touch 44×44;
- no color-only information;
- light/dark/high contrast/reduced motion;
- character shortcuts отключаемы;
- charts имеют table/summary alternative;
- focus возвращается после menu/dialog/drawer/lightbox;
- axe: нет critical/serious violations на ключевых routes.

## 6. Responsive и visual matrix

Минимальные размеры:

| Viewport  | Проверка                                 |
| --------- | ---------------------------------------- |
| 1440×1000 | 4-pane desktop, inspector open/collapsed |
| 1280×800  | Минимальный desktop center width         |
| 1024×768  | Tablet split + drawer                    |
| 768×1024  | Portrait tablet route behavior           |
| 390×844   | Mobile inbox/chat/keyboard               |
| 320×568   | Минимальный reflow, overflow и composer  |

Для каждого: light/dark, long names, long unbroken text, RTL-ready content,
translation, 10 attachments, error banners, 200% zoom. Screenshot tests не
заменяют interaction assertions.

Full-tab suite дополнительно проверяет `x/y = 0`, ширину
`documentElement.clientWidth`, высоту visual viewport, отсутствие document
horizontal overflow, сохранение `scrollY` до/после overlay и открытый mobile
keyboard. Набор размеров и motion/focus assertions зафиксирован в
[full-tab discovery](./10-full-tab-workspace-discovery.ru.md#9-проверки-и-acceptance-criteria).

## 7. Performance budgets

Начальные budgets уточняются профилированием, но release gate требует:

- route code split для lead/QA/analytics;
- no full project messages in initial inbox payload;
- bounded DOM/virtualized history без нарушения read semantics;
- coalesced realtime refresh;
- abort stale inspector/search requests;
- отсутствие layout shift при author avatar/attachment;
- telemetry для selection-to-readable, send-to-accepted, reconcile duration;
- деградационный тест на 100 inbox rows × 100 visible history Messages.

## 8. Security и privacy tests

- End User не может открыть CMS routes/API;
- operator без profile permission не получает PII даже в response/DOM;
- internal note не попадает в public projection/socket/attachment grant;
- signed URLs отсутствуют в router, logs и persistent storage;
- `403/404` не раскрывают existence;
- project switch/revoke очищают caches;
- HTML/Markdown, filenames, snippets и integration content безопасно рендерятся;
- exports и search проходят server authority;
- telemetry не содержит content/PII;
- direct deep link повторно проверяет project membership.

## 9. Rollout

1. Internal dogfood на read-only route.
2. Пилот P0 для одного project/небольшой команды.
3. Сравнение старого и нового projections через server IDs/revisions, без
   двойной отправки.
4. Включение write actions по одной vertical flag.
5. Наблюдение duplicate prevention, conflict, draft recovery, unread accuracy,
   frontend errors и operator task completion.
6. Расширение на projects после acceptance gate.
7. Перевод legacy entry points на deep link.
8. Удаление старого CHAT mode после периода rollback safety.

Rollback отключает route/write flags. Он не откатывает уже принятые backend
Messages, assignments или read positions.

## 10. Release gates

### Для каждой вертикали

- OpenAPI snapshot и fixtures зафиксированы;
- permission/allowed action matrix согласована;
- unit/contract/component/e2e зелёные;
- keyboard/axe/visual matrix пройдены;
- `409`, revoke, reconnect и unknown outcome проверены;
- shared Conversation Surface contract suite проходит одинаково через
  Users/Profile и Support adapters, включая translation toggle и original/
  translated rendering;
- full-tab behavioral suite проходит geometry, scroll ownership, nested
  overlays, focus return и reduced motion;
- telemetry/privacy review выполнен;
- support runbook и feature flag готовы.

### Для общего cutover

- основные операторы выполняют daily flow без legacy dialog;
- нет известных duplicate/lost draft/permission leakage defects;
- unread и delivery сверены с backend truth;
- P95 selection/render и command feedback укладываются в утверждённый budget;
- lead/QA/analytics не блокируют P0 операторский flow;
- rollback проверен на пилотном project.

## 11. Команды проверки frontend PR

Минимальный набор в `Lola_front`:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run api:check
```

Для PR без затронутого браузерного flow допускается обоснованно сократить e2e,
но state/contract tests изменённой vertical обязательны. Перед merge фиксируются
точные выполненные команды и известные ограничения окружения.
