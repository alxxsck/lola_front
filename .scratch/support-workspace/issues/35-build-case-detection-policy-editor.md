# 35 — Построить Detection Policy editor и test console

**What to build:** Lead настраивает, какие разговоры являются casual,
product inquiry или product problem, и как backend создаёт/связывает Case,
используя guided editor вместо raw JSON.

**Blocked by:** 34 — синхронизировать Case Intelligence contracts.

**Status:** implemented-available-scope

**Completed against:** backend `e9650e8e8d2831232eeabf09f88960fac1f52f6d1`.
Поля, которых ещё нет в typed server response (например, calibrator coverage и
расширенная оценка качества), остаются additive scope следующих контрактов и не
имитируются на клиенте.

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
- [x] Test console принимает поддерживаемую backend одну фразу и показывает
      `NO_CASE/CREATE/ATTACH/REOPEN/DEFER`, reason и matched rules. Confidence,
      cost и bounded dialog добавляются только после появления typed response.
- [x] Доступная confidence configuration отображается как server-owned
      threshold; UI не заявляет calibrator coverage/interval, пока их нет в DTO.
- [x] Локальная validation связывает структурные ошибки с exact field/rule;
      server overlap/unsafe-broad issues подключаются после публикации typed
      field-addressable errors.
- [x] Draft сохраняется при mobile navigation, `409`, revoke и reconnect по
      правилам authority; Lead может сохранить и опубликовать доступную
      Detection revision через server commands.
- [x] Экран является постоянной canonical surface: без frontend feature flag,
      env toggle, shadow/canary controls и временного legacy fallback.
- [x] Component/keyboard/axe/visual tests покрывают desktop, tablet и mobile.
