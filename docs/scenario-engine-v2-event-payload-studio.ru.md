# FE-V2-02: Event Definition Workspace и Payload Studio

Статус: production flow реализован. Нормативный backend-контракт находится в
`Lola_backend/docs/specs/event-definition-authoring-production.ru.md`; этот документ фиксирует
frontend ownership и проверяемое поведение UI.

## 1. Границы редактирования

Workspace не смешивает независимые типы изменений:

- `name` и `description` сохраняются как metadata без повышения schema revision;
- ingestion policy (`enabled`, source, `countsAsActivity`) применяется prospectively и не повышает
  schema revision;
- payload JSON Schema и `x-lola-*` semantics меняются только через draft → impact → publish;
- stable `code` и business meaning не редактируются; semantic break создаёт новую Event Definition;
- archive/restore/delete остаются отдельными lifecycle-командами.

Номер schema revision не редактируется в UI: его назначает backend.

## 2. Реализованный schema-authoring flow

1. Workspace загружает current head, usage и server-backed draft. Typed
   `EVENT_SCHEMA_DRAFT_NOT_FOUND` означает чистое состояние, а не ошибку экрана.
2. Payload Studio выполняет lossless parse/edit/serialize JSON Schema. Визуальные controls сохраняют
   `title`, `description`, type, required, enum, min/max, `additionalProperties`, Lola annotations и
   неизвестные keywords; неподдерживаемые визуально конструкции остаются opaque.
3. Save отправляет canonical schema и OCC evidence. Reload восстанавливает draft; discard требует
   expected draft version и причины.
4. Impact всегда приходит с backend. UI показывает producer/consumer compatibility, Scenario/
   runtime dependencies, active waits и resolution actions; локальный diff используется только как
   объяснение редактирования и не решает publish eligibility.
5. Publish доступен только для актуального draft/base head и без unresolved blockers. Producer-
   breaking confirmation и reason передаются явно. Success показывает authoritative revision/evidence;
   неоднозначный network result не изображается как успех и переводится в recovery state.
6. Semantic break вызывает отдельную атомарную successor-команду. Backend повторно проверяет
   classification, lifecycle, managed status и OCC под lock; UI не собирает create+discard из двух
   независимых запросов.

Stable `x-lola-field-key` не меняется автоматически при rename wire key. Изменение meaning/type/unit
требует нового field key или новой Event Definition согласно backend classification.

## 3. Связи с Scenario и Event Logs

- Scenario catalog и impact связываются с точными `definitionKeyId`, `definitionId` и schema revision.
- `EXACT` dependency блокирует successor, пока Scenario не migrated/republished либо соответствующий
  Run/wait не завершён; UI показывает конкретного consumer и действие для разблокировки.
- Event Logs отображают stable definition key, фактически принятую schema revision, policy version/
  snapshot, source и processing evidence. Metadata/policy/lifecycle edits не переписывают историю.

## 4. Concurrency и recovery

- Stale draft/head/policy ответы не перезаписывают более новое server state.
- При конфликте local editor value сохраняется рядом с server value и доступен безопасный reload/retry.
- Policy confirmation использует immutable command snapshot: изменения формы во время usage lookup или
  dialog не могут подменить подтверждённую команду.
- Archived, Lola-managed и permission-denied definitions fail closed; mutation controls отключены с
  объяснением причины.

## 5. UX, accessibility и responsive

- Типы, enum, semantic type и unit настраиваются обычными controls; Advanced JSON Schema доступен как
  технический escape hatch с parse/compile validation.
- Generated sample объясняет форму payload; реальный producer sample можно проверить отдельно.
- Ошибки связаны с controls и JSON paths, add/delete восстанавливают focus, disclosure controls имеют
  корректные `aria-expanded`/`aria-controls`.
- Desktop и mobile используют один state machine. На узком viewport нет горизонтального scroll или
  перекрывающего sticky-header; blocked impact и published v2 проверяются реальным browser E2E.

## 6. Release evidence

Единый gate запускается из backend checkout:

```bash
EVENT_SCHEMA_E2E_FRONTEND_DIR=/path/to/frontend npm run test:event-definition:release
```

Gate требует реальную PostgreSQL URL и выполняет backend regressions дважды, migration/integration/race
suite, frontend regressions дважды, lint/format/type/build/OpenAPI checks и real-backend desktop/mobile
E2E дважды. Отсутствующий frontend checkout или Event Definition spec является ошибкой, а не причиной
понизить проверку до mock smoke.
