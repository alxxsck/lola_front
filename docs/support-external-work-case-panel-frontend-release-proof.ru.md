# Ticket 32 — Case External Work frontend release proof

## Candidate

- Backend contract: `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`.
- OpenAPI: `sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.
- Transport boundary: generated client вызывается только из
  `support-external-work-source.ts`; browser не хранит provider credentials и
  не вызывает vendor API.

## Проверенный сценарий

1. Permission-gated `Интеграции` в Case inspector и синхронный purge при
   actor/Project/Case/permission change.
2. Server-owned create options, pinned mapping/form revision, required
   requester и typed dynamic fields.
3. Редактируемый safe-context preview: история чата не копируется
   автоматически.
4. Отдельные internal/public comment permissions; PUBLIC требует явного
   подтверждения. Unlink требует destructive confirmation.
5. `202 QUEUED` остаётся pending до authoritative command read. UNKNOWN не
   превращается в success и блокирует новый intent; transport recovery
   повторяет exact body/key/ETag.
6. Retry, evidence refresh, audited UNKNOWN resolution и link-existing
   используют quoted numeric `If-Match` и stable `Idempotency-Key`.
7. Remote text копируется только в редактируемый public reply draft; отправка
   пользователю не выполняется.
8. Keyboard inspector tabs, `rel="noopener noreferrer"`, live status,
   reduced-motion, no horizontal overflow и undisabled axe critical/serious
   gate.
9. Create admission требует одновременно exact `external_work.create` и
   `external_work.read_linked`: pinned backend не позволяет create-only роли
   прочитать принятый `202`, поэтому UI не запускает необратимую команду без
   recovery-authority. Принятый receipt хранится только в
   actor+Project+Case session scope; чужие QUEUED/UNKNOWN команды Case не
   блокируют новые intents оператора.

## Visual evidence

В `docs/evidence/support-workspace/ticket-32/` находятся deterministic mock
screenshots:

- `case-inspector-1440x1000-light.png`;
- `case-inspector-1440x1000-dark.png`;
- `case-inspector-1024x768-light.png`;
- `case-inspector-1024x768-dark.png`;
- `case-inspector-390x844-light.png`;
- `case-inspector-390x844-dark.png`.
- `create-safe-context-390x844-light.png`.

Проверены desktop inline inspector, tablet drawer и mobile route-owned
inspector. Skeleton сохраняет четыре геометрических блока; touch targets
ключевых действий — 44 px, остальные controls не меньше 40 px. Long remote
summary/ID используют перенос, viewport horizontal overflow равен нулю.

Артефакты содержат только mock data: реальные End User, provider objects,
credentials, tokens и signed URLs отсутствуют.

## Release-owner checks вне локального frontend gate

- Выполнить provider smoke только в выделенном Project по backend runbook
  `docs/setup/support-external-work-release.ru.md` и immutable candidates.
- Проверить real `202 → CLAIMED/RETRYING → SUCCEEDED|FAILED|UNKNOWN`, exact
  replay после транспортного timeout и отсутствие duplicate remote object.
- Проверить PUBLIC audience и audit evidence на разрешённом тестовом объекте;
  production provider mutation не входит в mock frontend evidence.
