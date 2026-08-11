# Проверка качества и публикация Case Intelligence: UI для Ticket 37

Дата исследования: 2026-08-11
Дата доступа к источникам: 2026-08-11

Область: сравнение candidate policy с опубликованной версией, качество и
калибровка, Safety coverage, расходы, продуктовая воронка, журнал решений,
публикация и восстановление прежней версии.

Использованы только официальные справки производителей, документация открытых
проектов и стандарты W3C. Выводы ниже — продуктовая интерпретация для Lola, а не
копирование чужого интерфейса.

## Короткий вывод

Ticket 37 лучше собрать не как один длинный аналитический экран, а как пять
связанных рабочих поверхностей:

1. **Обзор:** что сейчас опубликовано, что проверяется и почему публикация
   разрешена или заблокирована.
2. **Качество:** candidate и published на одном dataset revision, метрики,
   калибровка, ошибки и обязательные срезы.
3. **Расходы и путь обращения:** серверные расходы, задержка, воронка и влияние
   на очередь без пересчёта в браузере.
4. **Журнал решений:** объяснение конкретного решения через правило, уверенность,
   ссылки на факты и закреплённые версии — без скрытых рассуждений модели и PII.
5. **Версии:** предварительная проверка, подтверждение публикации, история
   неизменяемых выпусков и создание новой версии из прежней.

Главный визуальный принцип: зелёный общий результат не должен скрывать красную
ячейку Safety или критический класс с нулевым покрытием. Сначала показывается
решение «можно / нельзя публиковать», затем точная причина и путь к проблемному
набору примеров.

## Что подтверждают официальные продукты

### 1. Сравнивать нужно закреплённые запуски, а не одиночные большие числа

Microsoft Foundry показывает у каждого evaluation run цель, dataset, статус,
агрегированные оценки и расход токенов, а в сравнении различает улучшение,
ухудшение и статистически неубедительный результат. Там же доступны результаты
по отдельным строкам набора данных. Источник: [Microsoft Foundry — View evaluation
results](https://learn.microsoft.com/en-us/azure/ai-studio/how-to/evaluate-results).

Vertex AI разрешает сравнивать разные модели, версии и evaluation jobs, но явно
ограничивает сравнение совместимыми типами моделей. Источник: [Google Cloud —
Evaluate models using Vertex AI](https://docs.cloud.google.com/vertex-ai/docs/evaluation/using-model-evaluation).

SageMaker Model Cards хранят назначение, риск, обучение, результаты оценки и
наблюдения; изменения создают новую версию карточки, сохраняя неизменяемую историю.
Источник: [AWS — SageMaker Model Cards](https://docs.aws.amazon.com/sagemaker/latest/dg/model-cards.html).

**Применение в Lola:**

- верхняя плашка сравнения всегда называет `candidate revision`, `published
revision`, `dataset revision`, `model revision`, `compiler revision` и время
  запуска;
- при несовместимых dataset/calibrator/model pins сравнение не маскируется пустым
  `—`, а получает состояние «Нельзя сравнить» с причиной;
- основная таблица показывает `Опубликовано / Кандидат / Разница / Допуск`;
- цвет сопровождается текстом `лучше`, `хуже`, `без убедимого изменения`,
  `недостаточно данных`;
- клик по метрике открывает ошибки и отдельные примеры, не новый несвязанный
  отчёт.

### 2. Агрегат не заменяет матрицу ошибок и срезы

Google напоминает, что accuracy может быть вводящей в заблуждение на
несбалансированных данных; при дорогих false negative важнее recall, а F1
уравновешивает precision и recall. Источник: [Google ML — Accuracy, recall,
precision and related metrics](https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall).

Microsoft Responsible AI Dashboard использует cohorts, heat map и error tree:
пользователь видит долю ошибок и их концентрацию в конкретном сегменте, а не
только итоговую оценку модели. Источник: [Microsoft — Responsible AI
dashboard](https://learn.microsoft.com/mt-mt/azure/machine-learning/how-to-responsible-ai-dashboard?view=azureml-api-2).

Vertex AI предоставляет отдельные evaluation slices по измерению. Источник:
[Google Cloud API — List model evaluation
slices](https://docs.cloud.google.com/vertex-ai/docs/reference/rest/v1/projects.locations.models.evaluations.slices/list).

**Применение в Lola:**

- сверху: precision, recall, F1, critical recall, attach accuracy, reopen accuracy
  и escalation accuracy;
- ниже: confusion matrix и error buckets (`ложно создано`, `пропущено`,
  `неверная категория`, `неверный приоритет`, `неверная передача`);
- любой показатель раскрывается по `risk class × locale × channel`, затем до
  примеров;
- у среза всегда видны `n`, доля dataset и interval/неопределённость: маленький
  срез не должен выглядеть столь же надёжным, как большой;
- фильтр среза остаётся видимым во всех графиках, чтобы пользователь не забыл,
  какой поднабор рассматривает.

### 3. Safety — самостоятельный publish gate, а не ещё одна средняя оценка

Microsoft разделяет safety evaluators по отдельным категориям риска, использует
уровни тяжести и возвращает для каждой проверки threshold, pass/fail и reason.
Источник: [Microsoft Foundry — Risk and Safety
Evaluators](https://learn.microsoft.com/en-in/azure/ai-foundry/concepts/evaluation-evaluators/risk-safety-evaluators?view=foundry-classic).

В официальной инструкции Microsoft по operational safety evaluations предлагается
помечать тестовые примеры метаданными, чтобы получать более детальные отчёты по
категориям и целям атак, а не один общий процент. Источник: [Microsoft —
Operationalize security and safety
evaluations](https://learn.microsoft.com/en-us/ai/playbook/technology-guidance/generative-ai/mlops-in-openai/security/operationalize-security-safety-evaluations).

SageMaker Model Dashboard выделяет нарушения порогов и также показывает отсутствие
настроенного мониторинга, а не приравнивает его к успешной проверке. Источник:
[AWS — SageMaker Model Dashboard](https://docs.aws.amazon.com/sagemaker/latest/dg/model-dashboard.html).

**Применение в Lola:**

- отдельная матрица `класс риска × язык × канал` с состояниями `Пройдено`,
  `Провалено`, `Нет покрытия`, `Проверка не завершена`;
- общий Safety status вычисляет сервер, но UI всегда показывает все провальные и
  отсутствующие ячейки;
- sentinel failures и mandatory Safety revision стоят в верхнем блоке допуска,
  выше quality и cost;
- ячейка открывает набор тестов, severity, expected/actual consequence и причину;
- forced Safety rebundle имеет понятные состояния `Обновляется`, `Частично
применено`, `Ошибка`, `Безопасный режим`; проекту не показывается ложная кнопка
  отмены обязательной версии.

### 4. Confidence имеет смысл только вместе с калибровкой и revision

Калибровочная кривая сравнивает среднюю предсказанную вероятность с фактической
долей положительных исходов по интервалам; число интервалов должно учитывать объём
данных. Источники: [scikit-learn — Probability
calibration](https://scikit-learn.org/stable/modules/calibration.html),
[scikit-learn — `calibration_curve`](https://scikit-learn.org/stable/modules/generated/sklearn.calibration.calibration_curve.html).

Vertex AI хранит confusion matrix, precision, recall и F1 для разных confidence
thresholds. Источник: [Google Cloud — Classification evaluation metrics
schema](https://docs.cloud.google.com/vertex-ai/docs/reference/rpc/google.cloud.aiplatform.v1beta1.schema.modelevaluation.metrics).

**Применение в Lola:**

- график показывает диагональ идеальной калибровки, candidate и published, а под
  ним — количество примеров в каждом интервале;
- рядом фиксируются calibrator revision, dataset revision, model revision,
  coverage и interval;
- пороги показываются поверх кривой, но их нельзя переносить на другую model или
  calibrator revision без новой проверки;
- состояние `Калибровка отсутствует` блокирует публикацию и не изображается как
  confidence `0%`.

### 5. Расходы и воронка должны объяснять единицы и знаменатель

OpenTelemetry различает input, output, cache-read и cache-write tokens, model,
provider и duration; содержание сообщений отдельно отмечено как потенциально
содержащее PII. Источник: [OpenTelemetry — GenAI semantic
attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/).

HCP Terraform помещает cost estimate отдельным этапом перед применением и даёт
общую стоимость, разницу и детализацию, включая ресурсы без доступной оценки.
Источник: [HashiCorp — Cost estimation
overview](https://developer.hashicorp.com/terraform/enterprise/workspaces/cost-estimation).

Amplitude показывает у каждого шага funnel абсолютное число, conversion/drop-off
и время перехода, а также явно фиксирует правила подсчёта и окно конверсии.
Источник: [Amplitude — Interpret funnel
analysis](https://amplitude.com/docs/analytics/charts/funnel-analysis/funnel-analysis-interpret).

**Применение в Lola:**

- расход показывается как `input / output / cache`, p50/p95 latency и деньги;
- нормализованные карточки отдельно называют знаменатель: `на 1000 сигналов`,
  `на принятое обращение`, `на созданную эскалацию`, `на решённое обращение`;
- рядом закреплены policy/model revisions и период наблюдения;
- неизвестная часть стоимости отображается отдельно и не считается нулём;
- воронка строго показывает серверные стадии: продуктовый диалог → наблюдаемое
  обращение → предложенная передача → созданная эскалация → принятая работа →
  исход;
- на каждом шаге: абсолютное число, доля от предыдущего, потеря и медианное время;
- frontend только форматирует серверные значения и определения, не выводит
  conversion повторно из округлённых счётчиков.

### 6. Журнал решений должен давать проверяемое объяснение без raw prompt и CoT

Google People + AI Guidebook рекомендует объяснять пользу и только тот уровень
технических деталей, который нужен пользователю для корректной mental model;
дополнительные детали следует раскрывать постепенно. Источник: [Google PAIR —
Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/).

OpenAI рекомендует использовать закреплённые версии моделей и evaluation, а для
разбора производственных запросов — сохранять request IDs. Источник: [OpenAI API —
Backward compatibility and request
IDs](https://platform.openai.com/docs/api-reference/backward-compatibility).

OpenAI отдельно объясняет, почему raw chain of thought не показывается
пользователям; полезные сведения должны передаваться в ответе или безопасном
кратком объяснении. Источник: [OpenAI — Learning to reason with
LLMs](https://openai.com/index/learning-to-reason-with-llms/).

OpenTelemetry относит verbose или потенциально чувствительные атрибуты к opt-in и
требует явно отмечать PII. Источник: [OpenTelemetry — How to write semantic
conventions](https://opentelemetry.io/docs/specs/semconv/how-to-write-conventions/).

**Применение в Lola:**

- строка журнала: время, Case/Escalation, stage, outcome, rule/reason,
  confidence + calibration revision, evidence refs, consequence;
- технический блок: policy/model/compiler/dataset pins, request/trace ID и
  idempotency outcome;
- содержание пользовательского сообщения раскрывается только через уже
  permissioned Case view; в общем журнале остаются безопасные ссылки на evidence;
- никогда не показывать system prompt, raw prompt, raw CoT или PII в списке;
- оператор получает короткое Case-scoped объяснение, lead — расширенные pins и
  ссылки на evaluation; права видны по отсутствию недоступных действий, а не по
  россыпи заблокированных кнопок.

### 7. Исправление метки — аудит, а не обещание мгновенного обучения

Microsoft Foundry хранит агрегированные и sample-level результаты, а Safety
evaluation предусматривает отдельную human feedback column для проверки
автоматической разметки. Источники: [Microsoft Foundry — View evaluation
results](https://learn.microsoft.com/en-us/azure/ai-studio/how-to/evaluate-results),
[Microsoft Foundry — Safety evaluations transparency
note](https://learn.microsoft.com/en-us/azure/foundry/concepts/safety-evaluations-transparency-note?view=foundry-classic).

**Применение в Lola:** карточка коррекции всегда показывает рядом:

- `Исходное решение` — неизменяемое;
- `Проверенная метка` — выбранная человеком;
- кто, когда и почему исправил;
- куда коррекция попадёт дальше: в новый dataset revision после отдельного
  процесса подготовки;
- прямой текст: «Исправление не меняет действующую модель автоматически».

### 8. Публикация — отдельный admission flow с preview и атомарным итогом

SageMaker Model Registry разделяет создание model version, approval status и
последующее развёртывание; версия содержит артефакты, метрики и метаданные.
Источники: [AWS — Register a Model
Version](https://docs.aws.amazon.com/sagemaker/latest/dg/model-registry-version.html),
[AWS — Model Registry](https://docs.aws.amazon.com/sagemaker/latest/dg/model-registry.html).

LaunchDarkly перед восстановлением прежней версии показывает номера версий, diff
и preview. Восстановление версии 3 поверх версии 5 создаёт новую версию 6, то есть
история не переписывается. Источник: [LaunchDarkly — Restoring previous flag
versions](https://launchdarkly.com/docs/home/releases/version-restore).

LaunchDarkly Change history показывает автора, ресурс, среду, время и diff каждого
изменения. Источник: [LaunchDarkly — Change
history](https://launchdarkly.com/docs/home/releases/change-history).

**Применение в Lola:**

1. `Проверить публикацию` запускает серверный admission и показывает отдельные
   gate rows: schema, overlap, calibration, Safety, quality, cost, capacity.
2. Queue impact показывается до подтверждения: новые/закрытые обращения,
   предложения передачи, эскалации и требуемая ёмкость по командам.
3. Только полный серверный `PASS` открывает `Опубликовать`.
4. Confirmation называет candidate revision, текущую published revision,
   ожидаемую version и необратимый смысл действия.
5. Успех создаёт единственную active revision. Восстановление старой версии
   создаёт новую revision из её содержимого; прежние записи остаются неизменными.
6. `409` и unknown outcome переводят экран в `Сверяем результат`: lookup по
   idempotency key, затем authoritative reload. Кнопка не обещает повторную
   публикацию, пока исход неизвестен.

В Lola нет staged rollout, canary, shadow, frontend flags или env-переключателей:
публикуется один атомарный bundle постоянного функционала.

## Рекомендуемая информационная архитектура

```text
Проверка и публикация
├─ Обзор
│  ├─ Опубликованная версия и кандидат
│  ├─ Допуск публикации
│  └─ Обязательное обновление Safety
├─ Качество
│  ├─ Сравнение метрик
│  ├─ Матрица ошибок и примеры
│  ├─ Safety coverage
│  └─ Калибровка уверенности
├─ Расходы и путь обращения
│  ├─ Токены, кеш, задержка, стоимость
│  ├─ Нормализованная стоимость
│  └─ Воронка и влияние на очередь
├─ Журнал решений
│  ├─ Решения
│  ├─ Объяснение обращения
│  └─ Коррекции
└─ Версии
   ├─ Черновик и предварительная проверка
   ├─ Опубликованная версия
   └─ История и создание версии из прежней
```

## Композиция экранов

### Обзор

- верхняя пара карточек `Опубликовано` и `Кандидат`, между ними — явная стрелка
  сравнения и совместимость pins;
- крупный admission banner: `Готово к публикации`, `Есть блокеры`, `Проверяем`,
  `Нужно обязательное обновление Safety`;
- не более шести summary cards: quality, critical recall, Safety, calibration,
  cost, capacity;
- ниже — список блокеров в порядке риска с прямыми ссылками на проблемный срез;
- основное действие одно: `Проверить публикацию` или `Опубликовать` в зависимости
  от authoritative state.

### Качество

- desktop: слева компактная навигация по секциям, справа широкий compare canvas;
- таблица метрик остаётся таблицей; графики используются только для распределения,
  калибровки и динамики;
- единый bar над результатами хранит dataset, период, locale, channel, risk class;
- в error drawer сначала показаны причина и consequence, затем evidence refs и
  безопасный переход в Case.

### Журнал решений

- фильтры: период, stage, outcome, policy/model revision, risk class;
- строка показывает итог и короткую причину; подробности открываются в drawer на
  desktop и отдельным route на mobile;
- сохранённый URL включает фильтры и идентификатор решения;
- correction — отдельное действие с подтверждением, не inline-перезапись label.

### Версии и публикация

- история — вертикальная timeline с единственной меткой `Сейчас опубликовано`;
- version card: автор, время, основание, pins, admission result, queue impact;
- `Создать версию на основе этой` сначала показывает diff относительно текущей;
- forced Safety rebundle отображается той же timeline, но имеет authority
  `Platform Safety` и не получает проектной кнопки отмены.

## Desktop, tablet и mobile

Material 3 рекомендует разные конфигурации для compact, medium и expanded
breakpoints, а не простое пропорциональное сжатие одного макета. Источник:
[Material Design 3 — Canonical layout
examples](https://m3.material.io/foundations/layout/canonical-examples/overview).

W3C требует reflow без потери информации и функциональности до эквивалента 320
CSS px; двумерная прокрутка допустима для настоящих таблиц, но не для всего экрана.
Источник: [W3C WCAG 2.2 —
Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow).

**Expanded desktop:**

- постоянная локальная навигация + основная область;
- comparison table и Safety matrix используют доступную ширину;
- detail drawer занимает до 40% ширины и не скрывает выбранную строку;
- sticky admission bar допустим только если не перекрывает focus.

**Medium tablet:**

- локальная навигация становится горизонтальной или открываемой;
- summary cards переходят в две колонки;
- метрики candidate/published остаются рядом, пояснения переносятся под строку;
- drawer открывается поверх, сохраняя явную кнопку возврата и focus trap.

**Compact mobile:**

- route stack `раздел → список → деталь`, а не сжатый desktop drawer;
- summary cards и funnel stages становятся вертикальными карточками;
- для confusion/Safety matrix доступен переключатель `Матрица / Список`; список
  группирует проблемные ячейки по risk class и не теряет ни одного измерения;
- compare row: название → candidate/published → разница → допуск;
- publish confirmation — полноэкранный dialog/sheet с блокерами, pins и queue
  impact; primary action остаётся в пределах большого touch target.

## Accessibility и motion

- порядок клавиатурного focus должен сохранять смысл и операбельность интерфейса.
  Источник: [W3C — Focus
  Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
- sticky панели и drawer не могут полностью перекрывать focused control.
  Источник: [W3C WCAG 2.2 — Focus Not Obscured
  (Minimum)](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum).
- состояния `Проверяем`, `Публикация завершена`, `Исход неизвестен`, число
  блокеров и forced Safety progress объявляются как status messages без
  принудительного переноса focus. Источник: [W3C WCAG 2.2 — Status
  Messages](https://www.w3.org/TR/WCAG22/#status-messages).
- интерактивные цели на touch-поверхностях проектируются около 44×44 CSS px,
  особенно для опасных и последовательных действий. Источник: [W3C — Target Size
  (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).
- анимация подчёркивает причинность: раскрытие строки, появление diff, переход
  admission state. Для `prefers-reduced-motion` остаются мгновенные переходы;
  непрерывные декоративные пульсации не нужны.

## Проверки, которые должен пройти готовый UI

- candidate лучше по aggregate, но имеет провал critical recall в одной locale —
  публикация заблокирована, gap виден с overview;
- одна ячейка Safety не проверена — агрегат не показывает `PASS`;
- model revision изменилась, calibrator остался старым — сравнение threshold
  недоступно;
- dataset сильно несбалансирован — UI показывает distribution, `n`, precision,
  recall и F1, а не только accuracy;
- часть стоимости неизвестна — она не превращается в `$0`;
- серверная funnel содержит drop-off — frontend не пересчитывает значения после
  округления;
- оператор видит безопасное Case explanation, но не видит lead-only pins и
  correction controls;
- коррекция сохраняет исходное решение и reviewed label одновременно;
- admission падает на schema, overlap, calibration, Safety, quality, cost или
  capacity — publish недоступен и ведёт к точной причине;
- `409` и unknown publish outcome запускают reconcile без повторного side effect;
- создание версии из прежней даёт новый номер и diff, не переписывает историю;
- mandatory Safety rebundle нельзя отменить проектным действием; progress,
  failure и safe state читаемы;
- desktop, tablet и mobile сохраняют все фильтры, блокеры и действия; keyboard,
  screen reader, axe и reduced-motion проходят без отдельного урезанного режима.

## Решения, которые не стоит переносить в Lola

- один итоговый «Quality score» без dataset revision и срезов;
- radar chart как основное сравнение точных метрик;
- зелёный aggregate при пустой или красной Safety cell;
- confidence без calibrator/model pins и числа примеров;
- расходы без единиц, периода и знаменателя;
- пересчёт funnel или queue impact во frontend;
- raw prompt, chain of thought или PII в общем Decision log;
- correction, которая перезаписывает original decision;
- публикация напрямую из редактора без отдельного admission preview;
- rollback, который меняет старую запись вместо создания новой revision;
- постоянный правый inspector, сжимающий таблицы на tablet/mobile;
- rollout, canary, shadow mode, feature flags, env toggles или параллельный legacy
  UI.
