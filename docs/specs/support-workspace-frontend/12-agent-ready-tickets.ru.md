# Support Workspace: локальные agent-ready задачи

Здесь собраны ссылки на 33 локальные задачи. Исходные issue-файлы лежат в
`.scratch/support-workspace/issues`: папка доступна в репозитории, но Finder и
некоторые IDE могут скрывать её из-за точки в имени. Этот индекс находится в
обычной папке `docs`, поэтому задачи можно открыть без настройки показа скрытых
файлов.

Каждый issue рассчитан на отдельный implementation-сеанс, содержит acceptance
criteria и прямые блокирующие зависимости. После восстановления GitHub-доступа
эти же файлы можно опубликовать как Issues с native blocking links.

## Стартовый P0 frontier

Сейчас без блокеров можно брать задачи 01–04. Задача 30 тоже технически
свободна, но относится к отложенному JSM/HelpDesk-треку.

## Все задачи

| № | Задача | Блокеры | Файл |
| --- | --- | --- | --- |
| 01 | Workspace и messaging-контракты | нет | [Открыть](../../../.scratch/support-workspace/issues/01-sync-workspace-messaging-contracts.md) |
| 02 | Inbox, Case и workforce-контракты | нет | [Открыть](../../../.scratch/support-workspace/issues/02-sync-inbox-case-workforce-contracts.md) |
| 03 | Content, Lead Control и notification-контракты | нет | [Открыть](../../../.scratch/support-workspace/issues/03-sync-content-lead-notification-contracts.md) |
| 04 | Общий Conversation Surface | нет | [Открыть](../../../.scratch/support-workspace/issues/04-expand-shared-conversation-surface.md) |
| 05 | Users chat на Conversation Surface | 04 | [Открыть](../../../.scratch/support-workspace/issues/05-migrate-users-chat-to-conversation-surface.md) |
| 06 | Support chat на Conversation Surface | 04 | [Открыть](../../../.scratch/support-workspace/issues/06-migrate-support-chat-to-conversation-surface.md) |
| 07 | Удаление legacy chat-дублей | 05, 06 | [Открыть](../../../.scratch/support-workspace/issues/07-remove-legacy-chat-duplicates.md) |
| 08 | Full-tab presentation shell | 05, 06 | [Открыть](../../../.scratch/support-workspace/issues/08-build-full-tab-presentation-shell.md) |
| 09 | Единый Case/Conversation inbox | 02, 06 | [Открыть](../../../.scratch/support-workspace/issues/09-unify-case-conversation-inbox.md) |
| 10 | Server search, filters и sort | 02, 09 | [Открыть](../../../.scratch/support-workspace/issues/10-add-server-inbox-search-filters-sort.md) |
| 11 | Saved Views | 02, 09 | [Открыть](../../../.scratch/support-workspace/issues/11-add-saved-support-views.md) |
| 12 | Tablet/mobile route stack | 08, 09 | [Открыть](../../../.scratch/support-workspace/issues/12-finish-responsive-route-stack.md) |
| 13 | Durable send и idempotency recovery | 01, 06 | [Открыть](../../../.scratch/support-workspace/issues/13-add-durable-send-idempotency-recovery.md) |
| 14 | Read/unread и first-unread | 01, 06 | [Открыть](../../../.scratch/support-workspace/issues/14-add-read-unread-first-unread.md) |
| 15 | Delivery и reconnect reconciliation | 01, 13 | [Открыть](../../../.scratch/support-workspace/issues/15-add-delivery-reconnect-reconciliation.md) |
| 16 | Case workflow и классификация | 02, 09 | [Открыть](../../../.scratch/support-workspace/issues/16-complete-case-workflow-classification.md) |
| 17 | Действия оператора с назначением | 02, 16 | [Открыть](../../../.scratch/support-workspace/issues/17-complete-operator-assignment-actions.md) |
| 18 | Назначение и override для лида | 02, 16, 17 | [Открыть](../../../.scratch/support-workspace/issues/18-add-lead-assignment-overrides.md) |
| 19 | SLA, routing и availability | 02, 16 | [Открыть](../../../.scratch/support-workspace/issues/19-add-sla-routing-availability-context.md) |
| 20 | Permission-gated inspector tabs | 02, 16 | [Открыть](../../../.scratch/support-workspace/issues/20-add-sensitive-inspector-tabs.md) |
| 21 | Viewers, typing и collision warning | 01, 06 | [Открыть](../../../.scratch/support-workspace/issues/21-add-viewers-typing-collision-warning.md) |
| 22 | Internal-note composer mode | 03, 06 | [Открыть](../../../.scratch/support-workspace/issues/22-integrate-internal-note-composer-mode.md) |
| 23 | Attachments в reply и note | 01, 13, 22 | [Открыть](../../../.scratch/support-workspace/issues/23-add-public-note-attachments.md) |
| 24 | Support Macros | 03, 22 | [Открыть](../../../.scratch/support-workspace/issues/24-add-support-macros.md) |
| 25 | Support Internal Knowledge | 03, 20 | [Открыть](../../../.scratch/support-workspace/issues/25-add-support-internal-knowledge.md) |
| 26 | Lead Control | 03, 10, 18, 19 | [Открыть](../../../.scratch/support-workspace/issues/26-finish-lead-control.md) |
| 27 | Browser notification settings | 03, 09 | [Открыть](../../../.scratch/support-workspace/issues/27-add-browser-notification-settings.md) |
| 28 | Cutover legacy entry points | 07–20 | [Открыть](../../../.scratch/support-workspace/issues/28-cut-over-legacy-entry-points.md) |
| 29 | Hardening, pilot и rollback | 28 | [Открыть](../../../.scratch/support-workspace/issues/29-harden-pilot-rollback-core-support.md) |
| 30 | JSM/HelpDesk-контракты | нет | [Открыть](../../../.scratch/support-workspace/issues/30-sync-jsm-helpdesk-contracts.md) |
| 31 | Integration Settings и External Work | 30 | [Открыть](../../../.scratch/support-workspace/issues/31-add-integration-settings-external-work.md) |
| 32 | JSM/HelpDesk actions в Case inspector | 16, 30, 31 | [Открыть](../../../.scratch/support-workspace/issues/32-add-case-external-work-actions.md) |
| 33 | Support Quality и Analytics | 29 + IAM/API handoff | [Открыть](../../../.scratch/support-workspace/issues/33-add-support-quality-analytics.md) |

Core cutover 28–29 намеренно не зависит от задач 21–27 и 30–33. Presence,
notes, attachments, macros, Internal Knowledge, Lead Control, notifications,
JSM/HelpDesk, QA и analytics поставляются отдельными вертикалями после P0.
