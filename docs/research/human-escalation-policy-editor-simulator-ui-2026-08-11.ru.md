# Передача диалога человеку: UI редактора и симулятора

Дата исследования: 2026-08-11

Дата доступа к источникам: 2026-08-11

Область: Ticket 36, Human Escalation Policy, неизменяемая Platform Safety,
безопасный multi-turn simulator.

Использованы только официальные справки производителей и стандарты W3C. Выводы
ниже — продуктовая интерпретация для Lola, а не копирование чужого интерфейса.

## Короткий вывод

Редактор должен отвечать на три разных вопроса и не смешивать их в одной форме:

1. **Когда нужен человек:** подтверждённая просьба, неоднозначная фраза,
   продуктовый сценарий или повторные неудачи Lola.
2. **Что сделать сейчас:** предложить передачу, один раз уточнить причину или
   немедленно создать эскалацию.
3. **Что произойдёт после решения:** какие сведения собрать и какая политика
   маршрутизации примет обращение.

Platform Safety показывается рядом как отдельный неизменяемый контур: классы риска,
последствия, языки, каналы и версия видны, но у Project Lead нет ложных выключателей.

Симулятор — отдельная рабочая поверхность, а не маленькая тёмная карточка рядом с
редактором. Пользователь собирает последовательность событий, запускает серверный
`NON_DISPATCHING` dry-run и читает хронологию: входное событие → счётчики до/после →
действие → Safety → допуск маршрута. Он всегда видит сообщение «реальные обращения
и уведомления не создаются».

## Что подтверждают официальные продукты

### 1. Явная просьба и неоднозначный сигнал — разные случаи

Intercom Fin немедленно передаёт диалог, когда пользователь ясно просит человека.
Слова `agent` или `support` без ясной просьбы, раздражение, первый запрос на передачу
и повторяющийся диалог сначала могут вызвать предложение связаться с сотрудником.
Если предложение снова потребовалось сразу после предыдущего, Fin передаёт диалог,
чтобы не зациклиться. Источник: [Intercom — Manage Fin AI Agent's escalation
guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules).

Microsoft Copilot Studio аналогично разделяет implicit trigger и explicit trigger.
Явное действие задаётся узлом `Transfer conversation`, а неявная невозможность
продолжить приводит в системную тему Escalate. Источник:
[Microsoft — Hand off to a live agent](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-hand-off).

Genesys позволяет отдельно включить распознавание просьбы об операторе, задать
подтверждение и текст перед передачей; пустое подтверждение означает немедленную
передачу. Источник: [Genesys Cloud — Set default event handling
behavior](https://help.mypurecloud.com/articles/set-default-error-handling-behavior/).

**Применение в Lola:**

- подтверждённые фразы живут в отдельном списке, их действие всегда
  `ESCALATE` и не выводится редактируемым полем;
- неоднозначные фразы живут в другом списке и явно выбирают `OFFER`,
  `ASK_REASON_ONCE` или `ESCALATE`;
- объяснение над списками должно говорить о различии на примерах, а не показывать
  два почти одинаковых технических массива;
- цитата или отрицание вроде «не хочу оператора» не должна выглядеть как
  гарантированная передача только из-за найденного слова.

### 2. Условие передачи и последующий маршрут — разные сущности

Intercom разделяет:

- Escalation Rules по структурированным данным;
- Escalation Guidance по смыслу и поведению пользователя;
- Workflow, который после решения собирает данные и выбирает команду.

Guidance не может назначить конкретную команду; адресат выбирается workflow.
Источник: [Intercom — Manage Fin AI Agent's escalation guidance and
rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules).

Zendesk рекомендует сначала определить стратегию передачи с учётом сложности,
срочности, рабочих часов и доступности команды. До передачи AI может собрать имя,
контакт или номер заказа; отдельный escalation block задаёт сообщение клиенту и
метод передачи. Источник: [Zendesk — Configuring escalation strategies and flows
for AI agents](https://support.zendesk.com/hc/en-us/articles/8357756604186-Configuring-escalation-strategies-and-flows-for-AI-agents).

Salesforce Agentforce использует отдельный Escalation subagent и outbound
Omni-Channel flow. Справка отдельно отмечает необходимость настраиваемого поведения,
когда transfer невозможен. Источник: [Salesforce — Transfer Conversations from an
Agent with an Omni-Channel Flow](https://help.salesforce.com/s/articleView?id=service.service_agent_escalation.htm&language=en_US&type=5).

**Применение в Lola:** карточка сценария содержит stable code, понятное название,
действие, срочность, reason и сведения для сбора. Ни фраза, ни scenario guidance не
получают свободное поле «кому назначить». Рядом показывается ссылка на действующую
Routing Policy revision и объяснение, что именно она выбирает команду.

### 3. Повторы, неудачи и отсутствие ответа — состояние, а не список слов

Copilot Studio после двух нераспознанных запросов может перейти из системной темы
Fallback в Escalate. Источник: [Microsoft — Configure the system fallback
topic](https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-system-fallback-topic).

Genesys отдельно моделирует recognition failure, повторное достижение retry limit,
ошибку и просьбу пользователя об операторе. Для каждого исхода задаются собственные
handover и handling. Источник: [Genesys Cloud — Set default event handling
behavior](https://help.mypurecloud.com/articles/set-default-error-handling-behavior/).

**Применение в Lola:** блок «Повторные неудачи Lola» показывает четыре доверенных
исхода (`Нет ответа`, `Не хватает знаний`, `Ошибка инструмента`, `Проблема не решена`)
и их пороги. Отдельно показываются пределы уточнений, отсутствия совпадения и
повторов. Copy должен прямо сказать: эти значения присылает сервер; браузер не
пересчитывает их по числу видимых сообщений.

### 4. Передача должна сохранять контекст и честно сообщать результат

Microsoft передаёт engagement hub полную историю и релевантные переменные; explicit
transfer может включать private message для сотрудника. Источник:
[Microsoft — Hand off to a live agent](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-hand-off).

Zendesk рекомендует заранее собрать сведения и сообщить клиенту, что происходит,
прежде чем активировать escalation block. Источник: [Zendesk — Configuring
escalation strategies and flows for AI agents](https://support.zendesk.com/hc/en-us/articles/8357756604186-Configuring-escalation-strategies-and-flows-for-AI-agents).

Genesys разделяет pre-transfer communication и failed-transfer communication.
Источник: [Genesys Cloud — Transfer to ACD
action](https://help.mypurecloud.com/articles/transfer-acd-action/).

**Применение в Lola:** UI не обещает «оператор подключается» до `ROUTABLE`.
Рекомендуемые тексты:

| Допуск маршрута | Текст для клиента или preview |
| --- | --- |
| `ROUTABLE` | «Передаём обращение команде поддержки.» |
| `OUT_OF_HOURS` | «Обращение сохранено. Команда ответит в рабочее время.» |
| `NO_ELIGIBLE_TEAM` | «Обращение сохранено, но команда пока не определена.» |
| `DELIVERY_DEGRADED` | «Обращение сохранено. Передача команде временно задерживается.» |

Это намеренно спокойные тексты: факт создания эскалации не равен факту принятия её
оператором.

### 5. Симулятор должен отделять клиентский опыт от технической трассировки

Intercom Preview имеет две вкладки: Customer view и Event log. Можно тестировать
разных пользователей, аудитории и языки; preview показывает, какие настройки
применились. Источник: [Intercom — Use Fin
previews](https://www.intercom.com/help/en/articles/12599471-use-fin-previews).

Intercom Simulations запускают полный сценарий без клиентского вывода и без обращения
к live APIs, показывают `Passed/Failed`, полный диалог и события, позволяют повторно
запустить тот же тест. Intercom рекомендует отдельно покрывать happy path, risk path
и edge cases. Источник: [Intercom — Run Simulations for Fin
Procedures](https://www.intercom.com/help/en/articles/12599517-run-simulations-for-fin-procedures).

Batch Test также не совершает записи и только показывает, какие автоматизации
сработали бы. Источник: [Intercom — Batch test Fin AI
Agent](https://www.intercom.com/help/en/articles/10521711-batch-test-fin-ai-agent).

Microsoft Activity map показывает входы, действия, результаты и использованные
источники в последовательности выполнения. Источники:
[Microsoft — Review agent activity](https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-review-activity),
[Microsoft — Run evaluations and view results](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-results).

Genesys replay mode разделяет read-only исполнение, редактор и временную шкалу; по
шагам можно двигаться вперёд и назад, в том числе с клавиатуры. Источник:
[Genesys Cloud — Use replay mode to troubleshoot an Architect
flow](https://help.mypurecloud.com/articles/use-replay-mode-to-troubleshoot-an-architect-flow/).

**Применение в Lola:** `POST escalation/dry-run` заслуживает отдельного большого
экрана. Ввод и результат не должны делить узкую боковую карточку.

## Рекомендуемая IA Ticket 36

```text
Передача человеку
├─ Обзор
├─ Просьба позвать человека
│  ├─ Явные просьбы
│  └─ Неоднозначные фразы
├─ Сценарии обращения
├─ Повторные неудачи Lola
├─ Маршрутизация и сведения для передачи
├─ Безопасность · только просмотр
└─ Проверка сценария
```

### Обзор

- опубликованная версия и наличие черновика;
- четыре компактных счётчика: явные правила, неоднозначные правила, сценарии,
  настроенные пороги;
- схема простым языком: `сигнал → действие → сбор сведений → Routing Policy`;
- отдельная карточка «Безопасность контролирует платформа» с версией, языками,
  каналами и числом классов риска;
- actions: `Проверить сценарий`, `Создать/редактировать черновик`.

### Списки и редактирование

На desktop списки занимают основную ширину. Строка показывает название/код,
локали, действие и краткое объяснение. Создание и редактирование открываются
focused modal; на mobile — full-screen route. Постоянная форма справа не нужна:
она сжимает обзор и одновременно показывает объект и незавершённый ввод.

Список явных просьб не показывает селектор действия: рядом стоит неизменяемая метка
`Немедленно передать`. Неоднозначная фраза показывает один из трёх понятных исходов:
`Предложить оператора`, `Один раз спросить причину`, `Передать сразу`.

Сценарий редактируется блоками:

1. понятное название и стабильный код;
2. действие и срочность;
3. причина для истории/аналитики;
4. сведения, которые Lola должна собрать;
5. ссылка на Routing Policy без выбора конкретного сотрудника.

### Platform Safety

Не использовать disabled toggles: они создают впечатление, что настройку можно
разблокировать. Вместо этого — полноценная read-only карточка с замком и текстом
`Обязательные правила платформы`. Внутри:

- revision и authority `PLATFORM`;
- четыре закрытых класса риска и severity;
- последствия каждого класса;
- поддерживаемые языки и каналы;
- пояснение: Project может настраивать разрешённый маршрут, но не выключать
  распознавание риска или safe fallback.

## Композиция симулятора

### Desktop

```text
Проверка сценария                     Реальные действия не выполняются

События сценария                      Результат
1. Явная просьба                      Итог: эскалация создана на шаге 3
2. Предложение принято                Safety: CLEAR
3. Эскалация зафиксирована            Маршрут: OUT_OF_HOURS
[+ Событие] [Запустить проверку]       [Хронология 1 … 3]
```

- слева — упорядоченный список input steps;
- справа — summary и вертикальная timeline результата;
- событие добавляется через понятный каталог, а не enum select с английскими
  значениями;
- каждый результат шага показывает `до → после`: статус, изменившиеся счётчики,
  действие, reason, Safety, routing admission, replay/conflict;
- неизменившиеся счётчики свернуты под `Остальные значения`;
- committed escalation отмечена заметным текстовым milestone, но не только цветом;
- шапка результата всегда показывает `NON_DISPATCHING` и
  `sideEffectsCommitted: false` человеческим текстом.

### Mobile

Использовать route stack: `События → событие → результат`, а не две сжатые колонки.
В результате сначала показываются итог и первый проблемный шаг, затем timeline
карточками. Таблица переходов превращается в карточки `До / После`; горизонтальный
scroll для обычного текста не нужен.

### Обязательные готовые проверки

Интерфейс должен помогать быстро добавить минимум следующие последовательности:

- подтверждённая просьба человека → немедленная эскалация;
- неоднозначная фраза → предложение → accept/decline/timeout;
- повторные `NO_ANSWER` до порога;
- повторное событие с тем же attempt/outcome → replay без второго increment;
- verified resolution, new topic и terminal Case → reset/freeze;
- смена policy посередине последовательности;
- Safety `PENDING`, `FAILED`, `SUSPECTED`, `URGENT`;
- `ROUTABLE`, `OUT_OF_HOURS`, `NO_ELIGIBLE_TEAM`, `DELIVERY_DEGRADED`;
- conflict и неизвестный/неразрешённый маршрут.

## Accessibility и motion

- Modal следует WAI-ARIA Dialog Pattern: focus входит внутрь, `Tab` остаётся в
  modal, `Escape` закрывает, после закрытия focus возвращается к trigger.
  Источник: [W3C WAI — Modal Dialog
  Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- Sticky footer редактора и simulator controls не перекрывают сфокусированное поле.
  Источник: [W3C WCAG 2.2 — Focus Not Obscured
  (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).
- `Проверяем…`, `Проверка завершена`, число ошибок и итог должны объявляться как
  status messages без принудительного переноса focus. Источник:
  [W3C WCAG 2.2 — Status
  Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
- На ширине 320 CSS px сохраняются содержание и действия без двухмерной прокрутки;
  исключение допустимо только для действительно двухмерной таблицы, но mobile
  timeline лучше перевести в карточки. Источник: [W3C WCAG —
  Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html).
- Анимация используется только для раскрытия detail, появления результата и
  подсветки изменившихся счётчиков. При `prefers-reduced-motion` эти переходы
  отключаются. Источник: [W3C WCAG — Animation from
  Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).

## Что применять, а что не переносить

| Паттерн | Решение для Lola |
| --- | --- |
| Разделение rules/guidance и routing workflow у Intercom | Применить напрямую как границу policy и Routing Policy reference |
| Немедленная передача при подтверждённой просьбе | Применить как неизменяемую семантику explicit rule |
| Предложение/уточнение при неоднозначном запросе | Применить только к ambiguous rule и Project scenario |
| Customer view + event/timeline | Применить в simulator как результат одного server dry-run |
| Side-effect-free simulations и replay | Применить; явно показывать отсутствие реальных записей |
| Большой node/graph builder | Не применять: DTO Ticket 36 ограничен списками правил, сценариями и переходами |
| Свободный prompt «передать команде X» | Не применять: адресат принадлежит Routing Policy |
| Показ chain-of-thought или скрытого prompt | Не применять; показывать только server-owned reason/effects/counters |
| Выключатель Platform Safety | Не применять; Safety показывается read-only как обязательная политика |
| Постоянная форма рядом со списком | Не применять; использовать list → focused edit → list |
| Обещание мгновенного соединения после escalation | Не применять до `ROUTABLE` |

## Проверочный критерий дизайна

Новый сотрудник должен суметь без знания enum ответить на пять вопросов:

1. Чем явная просьба отличается от неоднозначной фразы?
2. Когда Lola предлагает оператора, уточняет причину или передаёт сразу?
3. Какие неудачи накапливаются и когда счётчик сбрасывается?
4. Какие сведения соберёт Lola и почему адресат настраивается в другом месте?
5. На каком шаге симуляции возникла эскалация и была ли команда реально доступна?

Если ответ требует читать коды DTO, открывать «Дополнительно» или угадывать смысл
цвета, IA Ticket 36 ещё не готова.
