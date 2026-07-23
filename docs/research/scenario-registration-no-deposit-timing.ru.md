# Сценарий «регистрация → 5 минут без депозита»

Дата исследования: 23 июля 2026 года.

## Краткий вывод

Условие со скриншота **не реализует** сценарий «пользователь зарегистрировался, прошло 5 минут, депозита нет».

При триггере `completed_registration` оно означает:

> В момент получения регистрации посчитать предыдущие события регистрации пользователя в интервале `[время триггера − 5 минут, время триггера)` и пропустить сценарий, только если таких событий не меньше одного.

Текущее событие регистрации намеренно не входит в интервал. Поэтому для обычной первой регистрации результат будет `0`, а не `1`.

Правильная модель уже поддержана backend и frontend:

1. Trigger: `completed_registration`.
2. Начальные условия: только то, что должно быть истинно **в момент регистрации**; проверку регистрации в истории сюда не добавлять.
3. Первое действие: `WAIT_FOR_GOAL`.
4. Goal Event: успешный депозит.
5. Расчёт: количество событий, `>= 1`.
6. Срок цели: 5 минут.
7. Ветка `При достижении цели`: завершить сценарий или перейти в ветку без сообщения.
8. Ветка `По истечении срока`: отправить нужное сообщение.

Online не должен быть триггером этого сценария. Presence относится к политике доставки уже выбранного действия и не создаёт гарантированную проверку ровно через 5 минут.

## Что означает настройка на скриншоте

| Поле               | Фактический смысл                                        |
| ------------------ | -------------------------------------------------------- |
| Событие из истории | Какой тип уже записанных событий считать                 |
| Количество событий | Посчитать число подходящих записей                       |
| Последние 5 минут  | Взять ограниченное историческое окно перед trigger Event |
| Не меньше 1        | Условие истинно, если найдено хотя бы одно событие       |

Frontend всегда сериализует такое условие как `window: { kind: "last", durationMs: 300000, boundary: "beforeTrigger" }`: [RuleLeafEditor.vue](../../src/features/scenario-rules/ui/RuleLeafEditor.vue#L240).

При обработке trigger Event backend передаёт в Rule Engine одинаковые `anchorReceivedAt` и `now`, равные `receivedAt` текущего события: [events.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/events/events.service.ts#L741).

Rule Engine строит окно от `now - durationMs` до `now`: [scenario-rule-engine.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/scenario-rule-engine.ts#L746). SQL использует полуоткрытый интервал `received_at >= from AND received_at < to`, поэтому событие с timestamp триггера исключено: [event-history-reader.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/event-history-reader.ts#L165).

### Пример

Регистрация пришла в `12:00:00`.

Текущее условие считает регистрации в:

```text
[11:55:00, 12:00:00)
```

Регистрация в `12:00:00` в этот интервал не попадает. Это проверка прошлого, а не таймер и не отложенная проверка будущего.

## Как запускается Scenario Run

Event ingestion сначала сохраняет Event Log, затем:

1. применяет событие к уже активным Goal waits;
2. выбирает активные сценарии, чей Trigger совпал с Event Definition;
3. сразу вычисляет Eligibility;
4. если Eligibility и Audience совпали, создаёт Scenario Run и запускает граф действий.

Последовательность видна в [events.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/events/events.service.ts#L586): существующие Goal waits получают событие до поиска новых trigger-сценариев; начальная Eligibility вычисляется в [events.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/events/events.service.ts#L729).

Следствие: Eligibility не «просыпается» через 5 минут. Она является входным фильтром Run в момент trigger Event.

## Почему `WAIT_FOR_GOAL` подходит

Backend-каталог объявляет `WAIT_FOR_GOAL` как серверное действие, которое агрегирует типизированные события до конечного срока и выбирает одну из двух веток: [action-definitions.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenarios/action-definitions.ts#L394).

При запуске узла runner:

- берёт anchor из `receivedAt` trigger Event;
- вычисляет `deadlineAt = anchor + timeoutMs`;
- создаёт подписку на точную/совместимую ревизию Goal Event;
- сохраняет `onGoal` и `onTimeout`.

См. [scenario-runner.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenarios/scenario-runner.service.ts#L581).

Активная цель учитывает события в интервале:

```text
[trigger.receivedAt, trigger.receivedAt + timeoutMs)
```

Это закреплено и при replay пропущенных событий ([scenario-runtime.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/scenario-runtime.service.ts#L506)), и при обработке новых событий ([scenario-runtime.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/scenario-runtime.service.ts#L870)).

Если депозит удовлетворил цели, backend атомарно выбирает `onGoal`: [scenario-runtime.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/scenario-runtime.service.ts#L917). Если срок истёк раньше, deadline worker выбирает `onTimeout`: [scenario-runtime.service.ts](/Users/alxxsck/Documents/Lola_backend/src/modules/scenario-runtime/scenario-runtime.service.ts#L1379).

Frontend уже имеет отдельный Goal editor с `eventCode`, `count/sum`, фильтрами, порогом, `timeoutMs`, `onGoal` и `onTimeout`: [goal-domain.ts](../../src/features/scenario-goals/model/goal-domain.ts#L13), [ScenarioGoalEditor.vue](../../src/features/scenario-goals/ui/ScenarioGoalEditor.vue#L204).

Deadline и continuation workers опрашивают БД раз в секунду, поэтому timeout-ветка запускается не математически в ту же миллисекунду, а вскоре после отметки `5:00`, обычно с технической задержкой порядка секунд.

## Рекомендуемый граф

```text
Trigger: Регистрация завершена
            |
            v
WAIT_FOR_GOAL: успешный депозит, count >= 1, timeout 5 минут
       |                                      |
       | депозит пришёл                       | 5 минут истекли
       v                                      v
COMPLETE_SCENARIO                        SAY / SHOW_ASSISTANT / другое сообщение
```

`WAIT_FOR` перед `WAIT_FOR_GOAL` добавлять не надо. Goal deadline всё равно якорится к исходному trigger Event, а `WAIT_FOR_GOAL` сам реализует и ожидание события, и timeout-ветку.

Связка `WAIT_FOR → CONDITION` тоже не эквивалентна: обычный `WAIT_FOR` только приостанавливает граф, а `CONDITION` работает с контекстом Run и не выполняет исторический aggregate по Event Log.

Если отправка сообщения должна дождаться присутствия пользователя online, это настраивается отдельно в Delivery Policy. Тогда бизнес-решение «депозита не было за 5 минут» уже принято timeout-веткой, а Presence лишь определяет момент доставки.

## Найденная проблема во frontend

Quick Start `Регистрация без депозита 5 минут` сейчас создаёт два backward-looking Eligibility-условия:

- регистраций за предыдущие 5 минут `>= 1`;
- депозитов за предыдущие 5 минут `= 0`.

См. [rule-recipes.ts](../../src/features/scenario-rules/model/rule-recipes.ts#L96).

Название обещает временной workflow, но создаваемая модель проверяет только прошлое до другого trigger Event. Если trigger — регистрация, рецепт не считает текущую регистрацию и не ждёт будущий депозит. Этот рецепт следует удалить из Eligibility Quick Start или заменить на мастер, который добавляет `WAIT_FOR_GOAL` в граф действий.

## История реализации

Backend-возможности были введены отдельными этапами:

- `850f600` — resolution Goal из событий;
- `ede0e75` — bounded Rule aggregates;
- `a605079` — Presence и Delivery runtime;
- `1aa1447` — strict publish/explain API.

Frontend-конструкторы Rule и Goal вошли в `478eacb` и `70f52b3`. Текущие контракты обеих сторон согласованы по `WAIT_FOR_GOAL`: событие цели, `count/sum`, фильтры, сравнение, конечный `timeoutMs` и две ветки.

## Проверки, на которые опирается вывод

- Backend unit test для durable `WAIT_FOR` и Goal subscription от trigger anchor: `/Users/alxxsck/Documents/Lola_backend/test/scenario-wait.test.ts`.
- Backend PostgreSQL race suite для единственного победителя Goal/Deadline: `/Users/alxxsck/Documents/Lola_backend/test/scenario-goal-race.integration.test.ts`.
- Frontend domain tests Goal DTO и timeout branches: `src/features/scenario-goals/model/goal-domain.test.ts`.
- Frontend UI tests Goal editor: `src/features/scenario-goals/ui/ScenarioGoalEditor.test.ts`.
- Frontend tests намеренно запрещают `sinceTrigger` в initial Eligibility: `src/features/scenario-rules/model/rule-tracer-use-cases.test.ts`.

В ходе исследования локально запущены целевые suites: backend — 12/12, frontend — 14/14.
