# Доказательства выпуска графового редактора сценариев

Дата проверки: 9 августа 2026 года.

## Что проверено

Релиз закрывает канонический ветвящийся сценарий из 7 действий и большой линейный сценарий из 31 действия. Release-матрица проверяет отсутствие горизонтального overflow, read-only права, доступную клавиатурную навигацию, возвращение фокуса и локализованные подписи. Изоляция доменного payload проверяется отдельными тестами manual layout и fallback.

| Viewport | Сценарий | Тема | Текст | Evidence |
| --- | --- | --- | --- | --- |
| 1440 × 900 | 7 действий | light | 100% | [PNG](./evidence/scenario-graph-v2/canonical-light-1440.png) |
| 1024 × 900 | 7 действий | dark | 200% | [PNG](./evidence/scenario-graph-v2/canonical-dark-1024-text200.png) |
| 1440 × 900 | 31 действие | light | 100% | [PNG](./evidence/scenario-graph-v2/large-light-1440.png) |
| 1024 × 900 | 31 действие | dark | 200% | [PNG](./evidence/scenario-graph-v2/large-dark-1024-text200.png) |
| 390 × 844 | 7 действий | light | 200% | [PNG](./evidence/scenario-graph-v2/canonical-light-390-text200.png) |
| 320 × 844 | 31 действие | dark | 200% | [PNG](./evidence/scenario-graph-v2/large-dark-320-text200.png) |
| 320 × 844 | полноэкранная схема, 31 действие | dark | 200% | [PNG](./evidence/scenario-graph-v2/large-dark-320-text200-graph.png) |
| 1280 × 720 | feature flag off | light | 100% | [PNG](./evidence/scenario-graph-v2/rollout-fallback.png) |

В 200% режиме интерфейс следует reflow: содержимое может требовать вертикальной прокрутки, но документ и studio не получают горизонтальную прокрутку. На 390/320 px начальным экраном остаётся линейный список; схема и inspector открываются отдельно.

## Автоматические проверки

Основная release-матрица:

```bash
npx playwright test e2e/operator-journeys.spec.ts --project=chromium --grep "scenario graph hardening matrix"
npx playwright test e2e/operator-journeys.spec.ts --project=mobile-chromium --grep "scenario graph hardening keeps"
```

Оба теста запускают axe с WCAG 2 A/AA, включая `color-contrast`, и отклоняют serious/critical нарушения. Desktop/tablet тест проверяет 1440 и 1024 px, обе темы, 7/31 действий и read-only. Mobile тест проверяет 390 и 320 px, 200% текста, list-first маршрут, Enter/Escape и возврат фокуса.

Изолированный fallback:

```bash
CI=1 E2E_FRONTEND_PORT=4187 VITE_SCENARIO_GRAPH_WORKSPACE_ENABLED=false \
  npx playwright test e2e/operator-journeys.spec.ts --project=chromium \
  --grep "scenario graph rollout fallback"
```

Тест сверяет геометрию старой композиции и сохранённый draft, а затем запрещает в JSON слова и поля `viewport`, координаты presentation layout, `pinned`, `layout` и feature flag.

## Покрытые состояния и точные проверки

| Состояние | Автоматическое доказательство |
| --- | --- |
| первое действие, draft, publish и rollback | `scenario first action changes are previewed, atomic and version-aware`; `scenario author can save, validate, preview, publish and safely roll back a durable draft` |
| конфликт версии draft | unit `keeps local edits and offers a reload when durable draft concurrency fails` в `ScenarioEditorPage.test.ts` |
| localization и identity рёбер | `scenario graph labels use the project default locale and stable branch identity` |
| read-only, 7/31 узел, light/dark, 200% | два hardening-теста из основной матрицы выше |
| drag, keyboard nudge и payload isolation | `scenario manual layout is personal, durable and byte-for-byte domain safe`; `action editor uses list, full-width detail and graph views on mobile` |
| minimap, fit/center и восстановление viewport | `scenario canvas keeps 7 and 30+ node graphs navigable and visually distinct`; `large scenario search and minimap stay usable on mobile`; mobile action-editor test |
| reduced motion и keyboard route | `scenario authoring supports keyboard focus, narrow reflow and reduced motion` |

Соответствующий последовательный browser regression запускается так:

```bash
npx playwright test e2e/operator-journeys.spec.ts --project=chromium --workers=1 \
  --grep "scenario canvas keeps|scenario graph labels|scenario first action|scenario manual layout|scenario author can save|keyboard focus"
npx playwright test e2e/operator-journeys.spec.ts --project=mobile-chromium --workers=1 \
  --grep "large scenario search|scenario graph hardening keeps|action editor uses list"
npx vitest run src/pages/ScenarioEditorPage.test.ts \
  -t "keeps local edits and offers a reload when durable draft concurrency fails"
```

Перед публикацией также выполняются `npm test`, `npm run typecheck`, `npm run lint` и релевантный набор браузерных regression tests.
