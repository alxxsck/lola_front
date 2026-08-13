# Lola CMS

Lola CMS даёт CMS Users безопасные Project-scoped поверхности для настройки Lola,
операционной работы и анализа опубликованных данных.

## Language

**Reporting & Dashboards**:
Контекст управляемой Project-scoped аналитики, который хранит аналитические определения и
presentation artifacts, но не становится владельцем исходных доменных фактов.
_Avoid_: BI-экран, конструктор SQL, аналитическая база

**Artifact Space**:
Project-scoped пространство владения аналитическими объектами: Personal, Team или Project.
Положение объекта в Space не выдаёт Permission.
_Avoid_: Workspace, группа доступа, роль

**Collection**:
Навигационная подборка Saved Reports и Dashboards внутри Artifact Space. Collection организует
объекты, но не расширяет доступ к ним или к данным.
_Avoid_: Permission group, Dashboard group, папка с правами

**Saved Report**:
Самостоятельный versioned аналитический объект с одной Query Definition, presentation и
собственным URL. Saved Report можно повторно использовать в нескольких Dashboards.
_Avoid_: Widget, запрос, график

**Dashboard**:
Курируемая versioned композиция Widgets, filters и layout для быстрого ответа на связанную группу
бизнес-вопросов.
_Avoid_: Overview page, набор запросов, отчёт

**Widget**:
Элемент Dashboard, который ссылается на pinned Saved Report или Query Revision и Chart Definition,
но не владеет вычисленными данными.
_Avoid_: карточка, materialized view, сохранённый result

**Query Definition**:
Неизменяемое типизированное аналитическое намерение с зафиксированными Dataset, Metric,
Dimension, Population и временной семантикой.
_Avoid_: SQL, query JSON, фильтры виджета

**Query Run**:
Одна авторизованная попытка выполнить Query Definition в заданном диапазоне и workload lane.
_Avoid_: Report, result, refresh

**Query Result**:
Ограниченный неизменяемый результат Query Run, доступ к которому каждый раз проверяется заново.
_Avoid_: Cache entry, Dashboard data, source of truth

**Resource Receipt**:
Серверное объяснение результата: pinned definitions, временная зона, data-as-of, полнота,
точность, исключения, маршрут и стоимость выполнения.
_Avoid_: Metadata, tooltip details, debug info

**SLA Configuration**:
Project-scoped versioned пара Business Calendar и ordered SLA Policy, из которой backend
создаёт immutable revisions. Это не состояние clock отдельного Case и не команда его коррекции.
_Avoid_: SLA clock, Case SLA, rollout switch

**Правило назначения**:
Набор условий и приоритетов, по которым обращения упорядочиваются, неподходящие операторы
исключаются, а среди подходящих выбирается исполнитель.
_Avoid_: политика, алгоритм, настройки маршрутизации

**Support Macro**:
Stable Project-owned identity шаблона ответа с mutable draft и immutable published revisions.
Один Support Macro владеет всеми своими языковыми вариантами.
_Avoid_: фраза на одном языке, копия шаблона для каждого языка

**Macro Locale Variant**:
Локализованные title, body, shortcuts и literal variable fallbacks внутри одной revision
Support Macro; общие visibility и variable schema в вариант не входят.
_Avoid_: отдельный Macro, независимая revision, runtime-перевод

**Translation Suggestion**:
Несохранённый результат AI authoring job, привязанный к snapshot исходного текста. Пользователь
может изменить его; только обычные Save и Publish делают текст частью Support Macro revision.
_Avoid_: опубликованный перевод, runtime dependency, автоматическое сохранение

**Global Safety Policy**:
Обязательная platform-owned защита всех End User сообщений во всех Projects, языках и каналах.
Project может настроить обработку выявленного риска, но не отключить или ослабить саму проверку.
_Avoid_: Project safety setting, safety bundle, classifier configuration

**Safety Model Profile**:
Выбранные Platform Operator модель и глубина рассуждения для Global Safety Policy. Внутренние
версии, пороги и формат решения принадлежат платформе и не являются пользовательской настройкой.
_Avoid_: classifier revision, calibrator, model ID form

**Safety Decision**:
Зафиксированный результат обязательной проверки одного End User сообщения: безопасно,
подозрение или срочный риск с одним каноническим Risk Class.
_Avoid_: category, calibrated score, moderation tag
