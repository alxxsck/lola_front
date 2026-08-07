# 22 — Встроить internal-note composer mode

**What to build:** Оператор переключается между публичным ответом и внутренней заметкой в общем composer, не рискуя отправить note пользователю.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** ready-for-agent

- [ ] `Публичный ответ` и `Внутренняя заметка` имеют разные визуальные состояния и draft keys.
- [ ] Note endpoint нельзя вызвать из public mode и наоборот.
- [ ] Note permissions/allowed actions приходят из текущей Case projection.
- [ ] Создание/correction/tombstone отображаются в разрешённой internal timeline.
- [ ] Revoke немедленно очищает note text, history и draft из UI/cache.
- [ ] End User projection/e2e не содержит note body, metadata или attachment grants.
