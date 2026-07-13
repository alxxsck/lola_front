# Графовый редактор сценариев

CMS хранит редактируемый сценарий как ориентированный ациклический граф (DAG) и отправляет его в Lola Backend без промежуточного frontend-формата. Старый линейный сценарий открывается как `step_0 → step_1 → …`. При следующем сохранении у его шагов появляются явные ключи и переходы.

## Почему редактор — отдельная страница

Ветвящийся сценарий требует одновременно видеть библиотеку узлов, связи и параметры выбранного узла. Поэтому редактор расположен на маршрутах `/scenarios/new` и `/scenarios/:scenarioId`, а не в drawer:

- слева — backend-driven каталог доступных действий;
- в центре — масштабируемый canvas Vue Flow;
- справа — настройки сценария или инспектор выбранного узла;
- в верхней панели — состояние валидации и сохранение.

У workflow-редакторов обычно тот же layout: canvas занимает основное место, а выбранный элемент редактируется справа. Vue Flow даёт нам nodes, edges, viewport и controls. Формы и переходы при этом остаются в доменной модели CMS, а не во внутреннем state canvas. Полезные ссылки: [Vue Flow](https://vueflow.dev/), [React Flow: nodes, handles and edges](https://reactflow.dev/learn/concepts/terms-and-definitions), [Properties Sidebar pattern](https://www.workflowbuilder.io/docs/overview/features/properties-sidebar/).

## Контракт с backend

Каждый элемент `actions` отправляется в следующем виде:

```json
{
  "position": 0,
  "nodeKey": "confirm_bonus",
  "nextNodeKey": null,
  "type": "ASK_CHOICE",
  "config": {}
}
```

- `position` всегда нормализуется в непрерывный диапазон от `0`;
- `nodeKey` стабилен и соответствует `^[a-z][a-z0-9_-]{0,63}$`;
- `nextNodeKey` задаёт обычный переход и может быть `null`;
- для `ASK_CHOICE` и `CONDITION` переходы находятся внутри `config`;
- произвольный JavaScript не хранится и не исполняется: тип, JSON Schema и UI Schema приходят из каталога action definitions.

OpenAPI snapshot содержит `nodeKey` и `nextNodeKey`, поэтому Orval-клиент воспроизводимо генерирует актуальные DTO. `scenario-contract.ts` удаляет только domain-only `id`, сохраняет графовые поля и делает plain JSON copy конфигурации.

## Создание ветвления Yes/No

1. Создайте узел «Задать вопрос с вариантами».
2. Добавьте будущие узлы для веток «Да» и «Нет». Backend разрешает переходы только в узлы с большей `position`.
3. Вернитесь к вопросу, заполните сообщение и добавьте минимум два варианта.
4. Для каждого варианта задайте уникальный `id`, подпись и целевой узел.
5. Укажите timeout не меньше 1000 мс и обязательную ветку `onTimeout`.
6. При необходимости добавьте reminders. В напоминаниях доступны `SAY` и enabled frontend actions из каталога.

На canvas варианты подписывают рёбра, а timeout выделяется отдельным переходом. Напоминания не создают графовые узлы: backend выполняет их только в `WAITING_INPUT` и отменяет после первого принятого ответа.

## Runtime CONDITION

Узел «Условие» содержит упорядоченные ветки. Каждая ветка состоит из набора условий и целевого узла. Движок выбирает первую совпавшую ветку, поэтому порядок имеет бизнес-смысл. `fallbackNodeKey` обязателен.

Инспектор предлагает пути из следующих областей:

- `event.payload.*` из JSON Schema выбранного event definition;
- известные поля `user`, `project` и `scenario`;
- `answers.<nodeKey>.*` и `results.<nodeKey>.*` для уже существующих узлов.

Условия запуска сценария остаются в общих настройках и не предлагают `answers`/`results`, потому что до старта run этих данных ещё нет.

## Валидация

До API-запроса CMS проверяет:

- наличие хотя бы одного узла;
- формат и уникальность `nodeKey`;
- непрерывность `position`;
- существование целей и направление переходов только вперёд;
- достижимость всех узлов от первого;
- минимум два варианта и уникальные option id у `ASK_CHOICE`;
- обязательные message, timeout и onTimeout;
- наличие веток и fallback у `CONDITION`;
- config каждого action по актуальной JSON Schema каталога.

Backend повторяет структурную и schema-валидацию и остаётся окончательным источником истины. Ошибка CMS показывается в верхней панели и на соответствующем узле.

## Архитектура frontend

- `ScenarioEditorPage.vue`: загрузка, сохранение, route lifecycle и композиция studio.
- `ScenarioNodeInspector.vue`: UI редактирования выбранного action.
- `ScenarioConditionRows.vue`: общий редактор условий.
- `ScenarioFlowNode.vue`: визуальное представление узла.
- `model/scenario-graph.ts`: legacy-нормализация, переходы, target options и бизнес-валидация без Vue/PrimeVue.
- `repository/scenario-contract.ts`: единственное место сериализации API DTO.

Граф на canvas является производным представлением `form.actions`. Пользователь не соединяет произвольные порты: целевые узлы выбираются в инспекторе, что не позволяет незаметно создать запрещённый backward edge. Положение узлов рассчитывается детерминированно по переходам и не попадает в backend.

## Проверка изменений

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run api:check
```

Тесты `scenario-graph.test.ts` покрывают legacy-конвертацию, подписанные переходы и ошибки графа. `scenario-contract.test.ts` фиксирует точный payload с `nodeKey`/`nextNodeKey` и сохранение расширяемых action config.

## Текущие ограничения

- Backend MVP запрещает циклы и переходы назад, поэтому canvas не предлагает свободное соединение узлов.
- Ручные координаты не сохраняются; layout перестраивается из графа.
- Глобальной остановки активного run в редакторе нет.
- Ответ пользователя (`scenario.choice` / `scenario_choice`) относится к SDK клиента, а не к CMS.
- Backend хранит `nodeKey`, `nextNodeKey`, `inputAnswer` и reminder state в `ScenarioRunStep`, но текущий `ScenarioRunStepResponseDto` их не отдаёт. Поэтому раздел «Операции» пока показывает action type и config, а не имя пройденного графового узла.
- В runtime есть статус `WAITING_INPUT`, но в backend Swagger enum он пока пропущен. Frontend OpenAPI snapshot уже учитывает статус, чтобы UI корректно показывал ожидающий вопрос; backend DTO стоит синхронизировать при следующем изменении API.
