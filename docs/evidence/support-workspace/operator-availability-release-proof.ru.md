# Доступность оператора — проверка границы frontend/backend

Дата проверки: 11 августа 2026 года.

## Неизменяемые исходные данные

- Backend: `bb00a871eea8b446b2043da6ecc3b7fb9ac18a0d`.
- Составной OpenAPI frontend: `sha256:f350e8a6c622f12dadab71b07fda4c1df233e9bdbb952e2cc1760a88c5a5a67c`.
- Handoff: `docs/specs/support-platform/operator-availability-frontend-handoff.ru.md` из указанного backend commit.

## Что проверяется на каждой стороне

| Граница | Проверка | Результат |
| --- | --- | --- |
| Backend, ручное назначение | Assignment и `SUPPORT_CASE_ASSIGNED_TO_ME` intent фиксируются одной транзакцией; повтор команды не создаёт дубль | `support-case-assignment.postgres.test.ts` — PASS |
| Backend, автоматическое назначение | Завершённый `AUTO_ASSIGN` создаёт replay-safe personal notification intent | `support-routing-auto-assignment-notification-contract.test.ts` — PASS |
| Backend, минимальный intent | Intent не содержит текст обращения и не зависит от открытой вкладки или сетевого вызова | `personal-support-notification-intent-writer.test.ts` — PASS |
| Frontend, закрытая вкладка | Service Worker принимает `SUPPORT_CASE_ASSIGNED_TO_ME` без открытых clients, показывает нейтральное уведомление и открывает capability deep link | `support-push-sw.test-node.mjs` — PASS для manual и `AUTO_ASSIGN` |
| Frontend, reconnect | Реальный экран Workspace теряет и восстанавливает соединение, сохраняя `AVAILABLE` и не вызывая state command | Playwright `support-workspace-foundation.spec.ts` — PASS на desktop и mobile |

## Выполненные команды

```text
node --import tsx --test \
  test/support-routing-auto-assignment-notification-contract.test.ts \
  test/personal-support-notification-intent-writer.test.ts

node --env-file=.env scripts/run-support-case-assignment-postgres-tests.mjs

node --test scripts/support-push-sw.test-node.mjs
```

Результат backend unit/contract: 5 из 5 тестов прошли. PostgreSQL gate ручного назначения и связанные batch/candidate gates прошли. Frontend Service Worker: 5 из 5 тестов прошли.

Эта проверка намеренно разделена по владельцам данных: браузер не создаёт Assignment и не имитирует серверную транзакцию, а backend не подменяет поведение установленного Service Worker.
