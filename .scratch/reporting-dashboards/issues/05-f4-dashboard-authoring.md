Part of #24. Blocked by: Dashboard viewer.

## Пользовательский результат

Автор создаёт Dashboard Draft, добавляет опубликованные Saved Reports как Widgets, задаёт понятную
композицию и публикует новую immutable revision без копирования query/result data.

## Scope

- Реализовать create/edit Dashboard Draft routes и feature actions.
- Добавлять Widget через permission-filtered search опубликованных Saved Reports.
- Поддержать title override, reorder и width presets `1/3`, `1/2`, `2/3`, `full`.
- Хранить один обязательный page/tab `Обзор` в массивной backend model; не hard-code singleton renderer.
- Реализовать Draft save/OCC, preview, publish и archive.
- Разделить layout changes и data-definition changes; Query редактируется только в Saved Report.
- Не запускать analytical query от reorder/width change.

## Acceptance criteria

- [ ] Widget pin-ит published Saved Report/Query/Chart Revision и не хранит result/raw rows.
- [ ] Authoring controls зависят от exact Permissions/allowed actions, не role name.
- [ ] Reorder/width/title changes не запускают analytical runs.
- [ ] Published revision immutable; edit создаёт или продолжает Draft.
- [ ] OCC conflict сохраняет local Draft и даёт reload/duplicate path.
- [ ] Read-only viewer не получает hidden edit controls в DOM.
- [ ] Mobile может читать Draft preview; authoring не требует drag и не создаёт horizontal overflow.
- [ ] Tests доказывают, что layout mutation не меняет pinned Query Definition byte-for-byte.

## Blocked by

- #28

## Verification

```bash
npm run typecheck
npx vitest run src/features/reporting
npm run test:e2e -- --grep "dashboard authoring"
```
