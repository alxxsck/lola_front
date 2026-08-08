# 22 — Встроить internal-note composer mode

**What to build:** Оператор переключается между публичным ответом и внутренней заметкой в общем composer, не рискуя отправить note пользователю.

**Blocked by:** 03 — Синхронизировать content, Lead Control и notification-контракты; 06 — Перевести Support chat на Conversation Surface.

**Status:** completed

**Backend gate:** разблокирован backend `4a33805`, handoff `255b509`.
Frontend закрепляет exact Case scope, закрытые reason catalogs, OCC/reconcile и content-free realtime lease.

- [x] `Публичный ответ` и `Внутренняя заметка` имеют разные визуальные состояния и Case-scoped draft keys.
- [x] Note endpoint нельзя вызвать из public mode и наоборот.
- [x] Note permissions/allowed actions приходят из текущей Case projection.
- [x] Создание/correction/tombstone отображаются в разрешённой internal timeline.
- [x] Revoke немедленно очищает note text, history и draft из UI/cache.
- [x] End User projection/e2e не содержит note body, metadata или attachment grants.
