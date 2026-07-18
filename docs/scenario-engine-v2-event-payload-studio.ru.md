# FE-V2-02: Event Payload Studio

## Реализованный контракт

- `features/event-schema/model` владеет lossless parse/edit/serialize JSON Schema, sample payload и semantic diff.
- Визуальный editor сохраняет `title`, `description`, `type`, `required`, `enum`, `minimum`, `maximum`, `additionalProperties`, неизвестные JSON Schema keywords и Lola annotations.
- Новый field получает отдельный stable `x-lola-field-key`; изменение wire key не меняет его автоматически.
- Event editor ведёт по четырём шагам: смысл, данные, пример, изменения. Обычная настройка не требует писать JSON.
- Advanced JSON Schema проходит parse, backend-compatible normalization и Ajv compile, затем показывает semantic diff. Применение доступно только после успешной проверки. Неподдерживаемые визуальным editor конструкции остаются opaque.
- Studio строит generated sample для понятной проверки формы данных. Реальный sample можно проверить отдельно через Ajv с backend-compatible `allErrors`/non-strict JSON Schema semantics; ошибки объясняют, что неверно и как это исправить. Проверка примера не блокирует lossless schema с opaque constraints, для которых frontend не умеет синтезировать гарантированно подходящие данные.
- Semantic diff включает rename/type/stable identity, required, enum, min/max, semantic metadata, sensitivity и политику дополнительных полей. Финальный шаг также показывает business-настройки события.
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

## UX, accessibility и responsive

- Типы, enum, semantic type и unit настраиваются обычными controls; stable field key нельзя случайно изменить.
- Ошибки первого шага и schema fields имеют программную связь с controls и focus summary.
- Add/delete восстанавливают focus, details button сообщает `aria-expanded`/`aria-controls`.
- На 320×700 и 390×844 dialog занимает viewport, горизонтальный scroll отсутствует. Validation table превращается в читаемые карточки.
- Browser smoke не обнаружил console warnings/errors.

## Точные ограничения backend

### BE-FE-03 — current head и provenance

`EventDefinitionResponseDto` всё ещё не содержит `definitionKeyId`, `currentRevisionId`, `isCurrent`, `origin` и managed/read-only marker. List endpoint возвращает revisions без надёжной current-head identity. Поэтому frontend не группирует их по `code`/максимальной версии и не объявляет `lola.*` read-only только на основании кода.

### BE-FE-04 — history и compatibility impact

PATCH сразу публикует successor revision, но публичных revision list/detail и compatibility/impact metadata нет. Studio показывает только локальный semantic diff и прямо предупреждает, что он не доказывает совместимость внешних producers или опубликованных Scenario revisions. Полный history/head UX не реализован.
