# Notification Operations: отложенный P2 debt

Дата: 23 июля 2026 года. Backend contract revision:
`e383061fc2d5f35710aecde22329f93108e1ea30`.

Следующее замечание сознательно не блокирует Ticket 08 и должно быть выполнено отдельным follow-up:

- runtime-mapper `telegramProductAdmission.scope` должен принимать только generated enum
  `INSTALLATION | CHAT`; неизвестное значение следует сводить к безопасному `OTHER` или отбрасывать,
  не сохраняя его в domain state.

P1 correctness/security findings Ticket 08 закрыты. Этот файл фиксирует долг, а не разрешает
расширять backend contract или показывать неизвестное значение в UI.
