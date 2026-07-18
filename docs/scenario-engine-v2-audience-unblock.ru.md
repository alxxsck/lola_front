# FE-V2-12/13: typed Audience и завершение Scenario Engine V2

Дата актуализации: 18 июля 2026 года.

Backend-блокер FE-V2-12 снят. OpenAPI теперь содержит отдельный `AudienceRuleDto` v1, project-scoped каталог Audience, immutable Segment Definition и данные Audience в validate, preview, publish и Run Explain. Frontend использует эти контракты напрямую; legacy `user.*` paths не считаются Audience и не мигрируют автоматически.

## Граница домена

Audience отвечает на вопрос "какой пользователь подходит". Eligibility отвечает на вопрос "какое поведение или событие произошло". Поэтому в коде у них разные draft-модели, serializers и issue paths. `AudienceRuleDto` не вкладывается в `ScenarioRuleDto` и отправляется в API отдельным полем.

Поддержаны восемь discriminated nodes:

- группы `all`, `any` и `not`;
- `locale`, `language` и `country`;
- typed `userAttribute`;
- `segmentMembership` с точным `segmentRevisionId`.

Builder ограничивает глубину и размер дерева теми же значениями, которые публикует backend: depth 4, 100 nodes, 50 leaves, 20 children в группе и не больше 100 элементов в массиве. Неизвестный node сохраняется как opaque read-only блок. Это позволяет открыть будущую версию правила без потери данных.

## Что видит администратор

В Scenario Studio этап "Аудитория" теперь рабочий. В нём можно собрать вложенное правило, выбрать типизированный атрибут, страну, язык, locale или опубликованный сегмент. UI показывает операторы из catalog, формат значения и подсказку для чувствительных полей. Для страны принимается двухбуквенный ISO 3166-1 alpha-2 код.

Сегменты находятся в том же этапе. Доступны поиск с cursor pagination, detail, история версий, создание первой версии, публикация successor revision и archive. Внутри Segment Rule нельзя выбрать другой Segment: это исключает циклы и неявную рекурсию.

Выбор Segment всегда закрепляет текущую опубликованную revision. Новая версия Segment не меняет уже опубликованный Scenario. Архивирование также не ломает существующие pinned зависимости, но убирает Segment из выбора для новых правил.

## Validate, preview и publish

Frontend сериализует Audience отдельно и передаёт его в strict endpoints. Пустая Audience не отправляется: так сохраняется совместимость сценариев, опубликованных до FE-V2-12.

Backend issues связываются с локальными node id. По клику на ошибку Studio открывает нужный этап и редактор конкретного условия. Preview показывает дерево решения, dependency ids, стоимость и warnings. Фактическое значение чувствительного атрибута выводится только как redacted; frontend не пытается восстановить его из других ответов.

Publish review фиксирует:

- `catalogRevision`;
- отдельные Eligibility и Audience payloads;
- pinned attribute и segment revisions;
- Delivery Policy и actions;
- optimistic `expectedCurrentRevisionId`.

Если catalog или current head устарел, редактор не повторяет publish молча. Пользователь получает понятное сообщение, обновляет данные и проверяет выбор заново.

## Run Explain

Run Explain показывает два разных факта:

1. Audience decision и snapshot при старте Run;
2. `lastRecheck` перед доставкой, если policy потребовала повторную проверку.

Recheck не заменяет первоначальный snapshot. В интерфейсе у него отдельный timestamp и дерево объяснения. Состояние `UNAVAILABLE` означает, что доказательство недоступно; оно не отображается как обычный mismatch.

Explain также выводит закреплённые segment/attribute revisions. Значения с visibility `REDACTED` остаются скрытыми и в адаптере, и в UI-тестах.

## Контрактный gate

`npm run api:check` проверяет наличие:

- всех шести Segment operations;
- Audience catalog в `ConditionCatalogResponseDto`;
- optional Audience в validate, preview и publish;
- discriminator и восемь nodes `AudienceRuleDto`;
- optimistic поля Segment publish;
- Audience snapshot, dependencies и `lastRecheck` в Run Explain.

После проверки Orval заново генерирует клиент и сравнивает результат с рабочим деревом. Изменение backend-контракта поэтому не пройдёт незаметно.

## Проверки frontend

Основные контуры покрыты Vitest:

- команды дерева, limits, serializer/deserializer и opaque nodes;
- repository adapter и полный lifecycle Segment;
- операции Audience Builder, отдельные NOT/delete действия и backend focus;
- Segment search, history, publish и archive;
- validate, preview и publish с отдельным Audience payload;
- Scenario Studio, dirty guard и переход к ошибочному Audience node;
- Run Explain snapshot, delivery recheck, unavailable state и redaction;
- legacy publish без Audience.

Перед выпуском запускаются `npm run api:check`, `npm run typecheck`, `npm run lint`, `npm test` и `npm run build`.
