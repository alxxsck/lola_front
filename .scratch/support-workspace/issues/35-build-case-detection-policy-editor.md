# 35 — Построить Detection Policy editor и test console

**What to build:** Lead настраивает, какие разговоры являются casual,
product inquiry или product problem, и как backend создаёт/связывает Case,
используя guided editor вместо raw JSON.

**Blocked by:** 34 — синхронизировать Case Intelligence contracts.

**Status:** frontend-complete — production integration awaits backend merge

**Completed against:** backend Case Intelligence
`b26be183a6e1ab5c32c143ee6bab34c8fe16d00b` и составной pinned OpenAPI
`sha256:89e5ca742adb3f39649fc893fc50109b098a77cfbbc343b67ebae48403e3f90e`.
Перед production deploy этот commit должен быть объединён с актуальной
серверной базой в один проверенный кандидат.

- [x] Редактор поддерживает Project scope, stable category codes,
      descriptions, positive/negative examples и locale scope.
- [x] Rule builder разрешает только published `EXACT`, `PHRASE`, `ATTRIBUTE`,
      `SEMANTIC_STATEMENT`; произвольные JS/SQL/regex/prompt запрещены.
- [x] UI объясняет normalization/word boundaries/quote-negation/precedence и
      показывает `DEFER` для unresolved same-priority conflicts.
- [x] Include/exclude, confidence tiers, ambiguity, attach/reopen windows,
      context/debounce и доступные model/budget поля представлены typed
      controls; отсутствующие server projections не имитируются в браузере.
- [x] Keywords показываются как evidence/candidate rule; quoted/negated word
      не обещает автоматический Case без semantic decision.
- [x] Безопасная проверка принимает диалог до восьми сообщений и показывает
      `NO_CASE/CREATE/ATTACH/REOPEN/DEFER`, причину, совпавшие правила,
      категории-кандидаты, доверие, интервал, стоимость и все этапы. Режим
      `NON_DISPATCHING` не вызывает модель и не изменяет обращения.
- [x] Каталог разрешённых моделей заменяет ручной ввод revision ID. Покрытие
      калибровки показывается по решению, языку и каналу; недостаток данных
      явно блокирует автоматическое действие.
- [x] Локальная и серверная проверки связывают duplicate/overlap/broad и
      структурные ошибки с точным полем; английский backend message не попадает
      в интерфейс.
- [x] Draft сохраняется при mobile navigation, `409`, revoke и reconnect по
      правилам authority; Lead может сохранить и опубликовать доступную
      Detection revision через server commands.
- [x] Экран является постоянной canonical surface: без frontend feature flag,
      env toggle, shadow/canary controls и временного legacy fallback.
- [x] Component/keyboard/axe/visual tests покрывают desktop, tablet и mobile.
