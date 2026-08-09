# Support Workspace: локальные agent-ready задачи

Здесь собраны ссылки на 38 локальных задач. Исходные issue-файлы лежат в
`.scratch/support-workspace/issues`: папка доступна в репозитории, но Finder и
некоторые IDE могут скрывать её из-за точки в имени. Этот индекс находится в
обычной папке `docs`, поэтому задачи можно открыть без настройки показа скрытых
файлов.

Каждый issue рассчитан на отдельный implementation-сеанс, содержит acceptance
criteria и прямые блокирующие зависимости. После восстановления GitHub-доступа
эти же файлы можно опубликовать как Issues с native blocking links.

## Актуальные backend execution gates

Источник истины: [аудит backend-блокеров 01–33](../../research/support-workspace-backend-blockers-01-33-2026-08-07.ru.md),
backend `main` `442d185dfb6cd6c9ac9902b7cfbb167291d249b6`, OpenAPI SHA-256
`947ab0cb385be59df088076579d339d236cdc4c8bf4888fcebf7677915921d01`.

- **Нет прямого backend-блокера:** 01–20.
- **Можно делать только незаблокированную часть:** 22, 24–26.
- **Полный backend blocker:** 21, 23, 27, 30–38.
- **Транзитивный blocker через core:** 28–29.

Статус и точное условие снятия gate продублированы в каждом соответствующем
issue-файле. В частности, 12 не заблокирован backend, а 30 больше не считается
свободным: в backend `main` External Work/JSM/HelpDesk API отсутствует. Задача
20 не имеет собственного backend gap, но остаётся dependency-blocked до
завершения доступной части 16.

Case Intelligence задачи 34–38 добавлены после отдельного code/spec и
primary-source discovery 8 августа 2026 года. Их backend gates — новые задачи
backend 31–35; legacy Case policy и raw JSON editor эти gates не снимают.

## Все задачи

| №   | Задача                                                   | Блокеры                          | Файл                                                                                                     |
| --- | -------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 01  | Workspace и messaging-контракты                          | нет                              | [Открыть](../../../.scratch/support-workspace/issues/01-sync-workspace-messaging-contracts.md)           |
| 02  | Inbox, Case и workforce-контракты                        | нет                              | [Открыть](../../../.scratch/support-workspace/issues/02-sync-inbox-case-workforce-contracts.md)          |
| 03  | Content, Lead Control и notification-контракты           | нет                              | [Открыть](../../../.scratch/support-workspace/issues/03-sync-content-lead-notification-contracts.md)     |
| 04  | Общий Conversation Surface                               | нет                              | [Открыть](../../../.scratch/support-workspace/issues/04-expand-shared-conversation-surface.md)           |
| 05  | Users chat на Conversation Surface                       | 04                               | [Открыть](../../../.scratch/support-workspace/issues/05-migrate-users-chat-to-conversation-surface.md)   |
| 06  | Support chat на Conversation Surface                     | 04                               | [Открыть](../../../.scratch/support-workspace/issues/06-migrate-support-chat-to-conversation-surface.md) |
| 07  | Удаление legacy chat-дублей                              | 05, 06                           | [Открыть](../../../.scratch/support-workspace/issues/07-remove-legacy-chat-duplicates.md)                |
| 08  | Full-tab presentation shell                              | 05, 06                           | [Открыть](../../../.scratch/support-workspace/issues/08-build-full-tab-presentation-shell.md)            |
| 09  | Единый Case/Conversation inbox                           | 02, 06                           | [Открыть](../../../.scratch/support-workspace/issues/09-unify-case-conversation-inbox.md)                |
| 10  | Server search, filters и sort                            | 02, 09                           | [Открыть](../../../.scratch/support-workspace/issues/10-add-server-inbox-search-filters-sort.md)         |
| 11  | Saved Views                                              | 02, 09                           | [Открыть](../../../.scratch/support-workspace/issues/11-add-saved-support-views.md)                      |
| 12  | Tablet/mobile route stack                                | 08, 09                           | [Открыть](../../../.scratch/support-workspace/issues/12-finish-responsive-route-stack.md)                |
| 13  | Durable send и idempotency recovery — выполнено          | 01, 06                           | [Открыть](../../../.scratch/support-workspace/issues/13-add-durable-send-idempotency-recovery.md)        |
| 14  | Read/unread и first-unread — backend ready               | 01, 06                           | [Открыть](../../../.scratch/support-workspace/issues/14-add-read-unread-first-unread.md)                 |
| 15  | Delivery и reconnect reconciliation — backend ready      | 01, 13                           | [Открыть](../../../.scratch/support-workspace/issues/15-add-delivery-reconnect-reconciliation.md)        |
| 16  | Case workflow и классификация — backend ready            | 02, 09                           | [Открыть](../../../.scratch/support-workspace/issues/16-complete-case-workflow-classification.md)        |
| 17  | Действия оператора с назначением — backend ready         | 02, 16                           | [Открыть](../../../.scratch/support-workspace/issues/17-complete-operator-assignment-actions.md)         |
| 18  | Назначение и override для лида — backend ready `9a93282` | 02, 16, 17                       | [Открыть](../../../.scratch/support-workspace/issues/18-add-lead-assignment-overrides.md)                |
| 19  | SLA, routing и availability — backend ready `442d185`    | 02, 16                           | [Открыть](../../../.scratch/support-workspace/issues/19-add-sla-routing-availability-context.md)         |
| 20  | Permission-gated inspector tabs                          | 02, 16; direct API ready         | [Открыть](../../../.scratch/support-workspace/issues/20-add-sensitive-inspector-tabs.md)                 |
| 21  | Viewers, typing и collision warning                      | 01, 06 + backend full            | [Открыть](../../../.scratch/support-workspace/issues/21-add-viewers-typing-collision-warning.md)         |
| 22  | Internal-note composer mode                              | 03, 06 + backend partial         | [Открыть](../../../.scratch/support-workspace/issues/22-integrate-internal-note-composer-mode.md)        |
| 23  | Attachments в reply и note                               | 01, 13, 22 + backend full        | [Открыть](../../../.scratch/support-workspace/issues/23-add-public-note-attachments.md)                  |
| 24  | Support Macros                                           | 03, 22 + backend partial         | [Открыть](../../../.scratch/support-workspace/issues/24-add-support-macros.md)                           |
| 25  | Support Internal Knowledge                               | 03, 20 + backend partial         | [Открыть](../../../.scratch/support-workspace/issues/25-add-support-internal-knowledge.md)               |
| 26  | Lead Control                                             | 03, 10, 18, 19 + backend partial | [Открыть](../../../.scratch/support-workspace/issues/26-finish-lead-control.md)                          |
| 27  | Browser notification settings                            | 03, 09                           | [Открыть](../../../.scratch/support-workspace/issues/27-add-browser-notification-settings.md)            |
| 28  | Cutover legacy entry points — frontend complete          | 07–20 + backend `4d82b6bd`       | [Открыть](../../../.scratch/support-workspace/issues/28-cut-over-legacy-entry-points.md)                 |
| 29  | Hardening, pilot и rollback — frontend complete          | 28 + backend `9f36796b`          | [Открыть](../../../.scratch/support-workspace/issues/29-harden-pilot-rollback-core-support.md)           |
| 30  | JSM/HelpDesk-контракты                                   | backend full                     | [Открыть](../../../.scratch/support-workspace/issues/30-sync-jsm-helpdesk-contracts.md)                  |
| 31  | Integration Settings и External Work                     | 30 + backend full                | [Открыть](../../../.scratch/support-workspace/issues/31-add-integration-settings-external-work.md)       |
| 32  | JSM/HelpDesk actions в Case inspector                    | 16, 30, 31 + backend full        | [Открыть](../../../.scratch/support-workspace/issues/32-add-case-external-work-actions.md)               |
| 33  | Support Quality и Analytics                              | 29 + backend/IAM full            | [Открыть](../../../.scratch/support-workspace/issues/33-add-support-quality-analytics.md)                |
| 34  | Case Intelligence contracts и settings foundation        | backend 31                       | [Открыть](../../../.scratch/support-workspace/issues/34-sync-case-intelligence-contracts.md)             |
| 35  | Detection Policy editor и test console                   | 34 + backend 31–32               | [Открыть](../../../.scratch/support-workspace/issues/35-build-case-detection-policy-editor.md)           |
| 36  | Escalation/Safety editor и simulator                     | 34 + backend 31–33               | [Открыть](../../../.scratch/support-workspace/issues/36-build-human-escalation-policy-editor.md)         |
| 37  | Evaluation, decision log, cost и rollout                 | 34–36 + backend 34               | [Открыть](../../../.scratch/support-workspace/issues/37-add-case-intelligence-evaluation-rollout.md)     |
| 38  | Project notifications о новых Cases                      | 27, 34 + backend 35              | [Открыть](../../../.scratch/support-workspace/issues/38-add-new-case-notification-policy.md)             |

Core cutover 28–29 намеренно не зависит от задач 21–27 и 30–38. Presence,
notes, attachments, macros, Internal Knowledge, Lead Control, notifications,
JSM/HelpDesk, QA, analytics и Case Intelligence settings поставляются
отдельными вертикалями после P0.
