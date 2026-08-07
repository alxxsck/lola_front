# 11 — Подключить Saved Views

**What to build:** Оператор сохраняет рабочие фильтры и возвращается к ним через список представлений с server-owned freshness/count semantics.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** blocked-contract

**Contract audit (2026-08-07):** pinned OpenAPI
`sha256:75b825f98afe9306678964691841029e36bb293a5846354b3e3651d5409c002b`
publishes Saved View requests and concurrency headers, but catalog, query,
create, replace, publish and archive responses have no schemas. The generated
client returns `void`, so the frontend has no typed view identity, scope,
permission, revision/ETag, count, freshness or authoritative query result. The
current backend checkout (`c8948779d9d5ef4fb1421a5ac416768782dd8647`) still
does not attach response models to those operations.

**Unblock condition:** backend publishes typed catalog/query/mutation result
schemas, the closed Saved View draft grammar, server-owned count/freshness,
scope/permission metadata, revision/ETag and typed conflict/error responses;
frontend then repins OpenAPI and regenerates the client. Until that happens the
UI must not fabricate personal/team/system views or persist project-scoped
truth locally.

- [ ] System Views и personal/team Saved Views различаются по scope и permissions.
- [ ] Create/replace/publish/archive используют revision contract и показывают conflict рядом с действием.
- [ ] Выбор view обновляет URL и authoritative inbox query.
- [ ] Count/freshness отображаются только когда их возвращает сервер.
- [ ] Удалённое или запрещённое view безопасно удаляется из navigation и выбирается допустимый fallback.
- [ ] Reload и project switch не смешивают views разных проектов.
