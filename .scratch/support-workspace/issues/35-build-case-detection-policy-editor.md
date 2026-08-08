# 35 — Построить Detection Policy editor и test console

**What to build:** Lead настраивает, какие разговоры являются casual,
product inquiry или product problem, и как backend создаёт/связывает Case,
используя guided editor вместо raw JSON.

**Blocked by:** 34 — синхронизировать Case Intelligence contracts; backend
31–32 — policy/runtime и cheap model/budget contracts.

**Status:** blocked-by-backend

- [ ] Редактор поддерживает Project scope, stable category codes,
      descriptions, positive/negative examples и locale scope.
- [ ] Rule builder разрешает только published `EXACT`, `PHRASE`, `ATTRIBUTE`,
      `SEMANTIC_STATEMENT`; произвольные JS/SQL/regex/prompt запрещены.
- [ ] UI объясняет normalization/word boundaries/quote-negation/precedence и
      показывает `DEFER` для unresolved same-priority conflicts.
- [ ] Include/exclude, confidence tiers, ambiguity, attach/reopen windows,
      context/debounce и model/budget представлены typed controls.
- [ ] Keywords показываются как evidence/candidate rule; quoted/negated word
      не обещает автоматический Case без semantic decision.
- [ ] Test console принимает одну фразу или bounded dialog, показывает
      `NO_CASE/CREATE/ATTACH/REOPEN/DEFER`, confidence, reason/rule и cost.
- [ ] Confidence отображает pinned calibrator, coverage/interval; insufficient
      class/locale/channel coverage запрещает auto-apply.
- [ ] Validation находит duplicate/overlap/unsafe broad rules и связывает
      ошибки с exact field/rule.
- [ ] Draft сохраняется при mobile navigation, `409`, revoke и reconnect по
      правилам authority; publish в этой задаче не реализуется локально.
- [ ] Component/keyboard/axe/visual tests покрывают desktop, tablet и mobile.
