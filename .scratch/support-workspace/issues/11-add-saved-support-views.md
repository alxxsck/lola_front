# 11 — Подключить Saved Views

**What to build:** Оператор сохраняет рабочие фильтры и возвращается к ним через список представлений с server-owned freshness/count semantics.

**Blocked by:** 02 — Синхронизировать inbox, Case и workforce-контракты; 09 — Объединить Cases и Conversations в одном inbox.

**Status:** ready-for-agent

- [ ] System Views и personal/team Saved Views различаются по scope и permissions.
- [ ] Create/replace/publish/archive используют revision contract и показывают conflict рядом с действием.
- [ ] Выбор view обновляет URL и authoritative inbox query.
- [ ] Count/freshness отображаются только когда их возвращает сервер.
- [ ] Удалённое или запрещённое view безопасно удаляется из navigation и выбирается допустимый fallback.
- [ ] Reload и project switch не смешивают views разных проектов.
