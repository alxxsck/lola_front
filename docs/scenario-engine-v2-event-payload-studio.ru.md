# FE-V2-02: Event Payload Studio

## Реализованный контракт

- `features/event-schema/model` владеет lossless parse/edit/serialize JSON Schema, sample payload и semantic diff.
- Визуальный editor сохраняет `title`, `description`, `type`, `required`, `enum`, `minimum`, `maximum`, `additionalProperties`, неизвестные JSON Schema keywords и Lola annotations.
- Новый field получает отдельный stable `x-lola-field-key`; изменение wire key не меняет его автоматически.
- Advanced JSON Schema проходит parse перед применением. Неподдерживаемые визуальным editor конструкции остаются opaque и не перезаписываются fallback-схемой.
- Generated и вставленный реальный sample payload проверяются Ajv с backend-compatible `allErrors`/non-strict JSON Schema semantics; ошибки показывают path и причину.
- Field capabilities берутся только из нормализованного Scenario Authoring contract adapter и связываются с редактируемой revision по точному `definitionId`. UI не содержит собственной operator/measure matrix и не переносит capabilities между revisions с одинаковым `code`.
- Event Definition create больше не отправляет `version`; `countsAsActivity` поддерживается в create/update и объясняется отдельно от session/Visit.

## Проверка с реальным backend

На текущей ветке backend выполнен проход `create → update → catalog → delete` через публичный API:

- create без `version` создал revision 1;
- update создал successor revision 2;
- `countsAsActivity`, enum, stable field key, semantic type, unit и неизвестный root keyword сохранились;
- Scenario Authoring catalog вернул сохранённые field metadata;
- проверочный Event выключен штатным DELETE endpoint.

Backend-файлы не изменялись.

## Точные ограничения backend

### BE-FE-03 — current head и provenance

`EventDefinitionResponseDto` всё ещё не содержит `definitionKeyId`, `currentRevisionId`, `isCurrent`, `origin` и managed/read-only marker. List endpoint возвращает revisions без надёжной current-head identity. Поэтому frontend не группирует их по `code`/максимальной версии и не объявляет `lola.*` read-only только на основании кода.

### BE-FE-04 — history и compatibility impact

PATCH сразу публикует successor revision, но публичных revision list/detail и compatibility/impact metadata нет. Studio показывает только локальный semantic diff и прямо предупреждает, что он не доказывает совместимость внешних producers или опубликованных Scenario revisions. Полный history/head UX не реализован.
