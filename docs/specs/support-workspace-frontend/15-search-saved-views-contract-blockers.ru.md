# Contract blockers: Support search и Saved Views

Дата проверки: 7 августа 2026 года

Статус: normative implementation gate для frontend Tickets 10–11

Pinned contract:
`sha256:75b825f98afe9306678964691841029e36bb293a5846354b3e3651d5409c002b`.
Проверенный backend checkout:
`c8948779d9d5ef4fb1421a5ac416768782dd8647`.

Здесь зафиксирована причина, по которой Tickets 10 и 11 нельзя безопасно
реализовать поверх текущего transport contract. Канонический статус задач
меняется только в GitHub Issues. На момент проверки issues с такими названиями
в репозитории нет.

## Ticket 10 — server search, filters и sort

Pinned OpenAPI публикует только request grammar `SupportSearchQueryDto`.
Responses операций `SupportSearch_cases`, `SupportSearch_conversations` и
`SupportSearch_messages` не имеют schema; generated client возвращает `void`.
Текущий backend checkout по-прежнему использует description-only
`@ApiOkResponse` и не закрывает этот transport gap.

Для снятия блокировки backend должен опубликовать типизированную bounded result
page для каждого разрешённого scope: canonical target identity, cursor,
freshness/degraded state и validation/error responses. Затем frontend обновляет
pinned OpenAPI и generated client. До этого нельзя создавать локальные response
DTO, фильтровать неполную страницу или раскрывать hidden targets через fallback
owner reads.

## Ticket 11 — Saved Views

Pinned OpenAPI публикует requests и concurrency headers для catalog, query,
create, replace, publish и archive, но не публикует response schemas. Generated
client возвращает `void`; у frontend нет typed view identity, scope,
permission, revision/ETag, count, freshness или authoritative query result.
Текущий backend checkout также не прикрепляет response models к этим операциям.

Для снятия блокировки backend должен опубликовать типизированные результаты
catalog/query/mutation, закрытую Saved View draft grammar, server-owned
count/freshness, scope/permission metadata, revision/ETag и conflict/error
responses. После обновления pinned OpenAPI и generated client frontend сможет
подключить UI. До этого нельзя создавать фиктивные personal/team/system views
или хранить Project-scoped truth локально.
