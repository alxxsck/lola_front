# 40 — Завершить frontend control plane SLA Configuration

**Part of GitHub epic:** #4.

**What to build:** Support Lead полностью настраивает server-owned SLA из CMS:
редактирует Business Calendar и ordered SLA Policy, получает серверный preview
и оценку влияния, сохраняет draft, публикует immutable-версию, изучает историю,
semantic diff и audit, а при необходимости создаёт новую версию на основе
старой. Браузер не вычисляет дедлайны и не дублирует SLA engine.

**Discovery artifact:**
`docs/research/support-sla-configuration-ticket-40-primary-sources-2026-08-11.ru.md`.

**Status:** blocked-by-backend-36-contract-gate

**Backend dependency:** Backend Ticket 36 завершает authoring/configuration API.
Расчёт сроков, состояний `AT_RISK`/`BREACHED`, пауз, reopen и resolution уже
принадлежит SLA engine из Backend Ticket 08 и не входит в этот frontend ticket.

**Delivery invariant:** capability постоянная и permission-gated. После
публикации валидная конфигурация сразу становится текущей для новых SLA
occurrences. Уже созданные активные occurrences остаются pinned к своей
ревизии, если backend-контракт прямо не говорит обратного. Отдельные rollout,
canary, shadow, activation switch, env/feature gate и браузерный пересчёт сроков
запрещены.

## Проверенная отправная точка

В frontend уже есть V1-маршрут `/support/settings/sla-calendars` и feature
`src/features/support-sla`, который умеет читать aggregate, менять/discard
draft и публиковать его. Это основа для углубления, а не параллельная реализация.

Текущие ограничения, которые Ticket 40 обязан устранить:

- generated API содержит устаревшие поля rollout/reconciliation, удалённые из
  актуального backend-направления;
- `groupCode` вводится raw-строкой вместо server-owned каталога с названиями;
- timezone — свободный текст, без удобного IANA picker;
- targets редактируются в минутах, хотя контракт хранит business seconds, из-за
  чего возможна скрытая потеря точности;
- preview, impact, version history/detail/diff и audit отсутствуют;
- retry существует только в памяти страницы и не переживает reload/navigation;
- calendar exceptions и rules не рассчитаны на граничные объёмы 730/100;
- success-copy ошибочно утверждает, что публикация не меняет действующую SLA;
- server draft, local dirty state, published revision и recovery state показаны
  недостаточно явно.

## Gate 0 — backend prerequisites и contract sync

Frontend-реализация после discovery не начинается до выполнения всех пунктов:

- [ ] Backend 36 публикует в финальном OpenAPI реальные HTTP operations для:
      current aggregate read, draft replace, draft discard, server preview,
      `groupCode` catalog, publish, cursor history, revision detail, semantic
      diff, rollback-as-new-version и command outcome lookup/reconciliation.
- [ ] Наличие методов только во внутреннем backend port не считается HTTP-
      контрактом; frontend не придумывает URL, request shape или status codes.
- [ ] Current DTO типизирует published revision, optional draft, aggregate
      `version`/strong `ETag`, `allowedActions` и visibility каждого блока.
- [ ] Preview DTO содержит canonical normalized configuration/config hash,
      typed errors и warnings с domain code и field path, selected-rule
      examples, impact counts, `dataAsOf`, population/scope и `truncated` с
      пределом. Preview явно non-dispatching и без side effects.
- [ ] Preview provenance полностью типизирован: compiler/engine revision,
      calendar hash, timezone/tzdb provenance и иные поддержанные backend facts;
      `Record<string, unknown>` не выходит в публичный контракт.
- [ ] Catalog DTO имеет stable revision/ETag, machine `groupCode`, human label,
      lifecycle/availability state и детерминированную обработку `UNMAPPED`.
- [ ] History/detail/diff DTO содержат immutable revision ID/number, kind,
      created/published/rollback origin, actor presentation, timestamp, reason,
      config hashes и current marker. Semantic diff содержит типизированные
      before/after values, а не только counts или raw JSON.
- [ ] Publish принимает обязательный reason и exact preview/config precondition;
      rollback принимает source revision и reason и создаёт новую immutable
      revision, не переписывая историю.
- [ ] Все mutations имеют документированные strong `If-Match` и
      `Idempotency-Key` semantics. Outcome lookup позволяет отличить completed,
      failed, in-progress и unknown после обрыва соединения.
- [ ] OpenAPI закрыто типизирует 400/401/403/404/409/412/428/503 и domain codes:
      calendar/timezone/rule/target/AT_RISK/pause validation, unknown group,
      catalog drift, stale draft/root, source revision missing, duplicate
      command и reused idempotency key with different payload.
- [ ] После стабилизации Backend 36 frontend generated client обновлён; старые
      rollout-related types и checkpoint fields удалены, `npm run api:check`
      проходит без handwritten duplicates.

Если финальный backend контракт не предоставляет часть detail/diff/audit/
preview semantics, scope не заменяется browser inference: блокер возвращается в
Backend 36 и фиксируется в discovery artifact.

## Authority и domain boundaries

- Server владеет validation, normalization, timezone/DST semantics, rule
  matching, preview/impact, hashes, version numbers, publication, rollback,
  audit и расчётом SLA clocks/deadlines.
- Browser владеет только editing ergonomics, локальной assistive validation,
  presentation, focus/keyboard behavior, request orchestration и безопасным
  recovery.
- Локальная validation ускоряет ввод, но никогда не объявляет конфигурацию
  валидной вместо server preview.
- `groupCode`, приоритеты, case types, pause reasons и будущие closed enums
  выбираются только из серверных/сгенерированных контрактов.
- Нельзя мигрировать или пересчитывать уже активные Case clocks из этого UI.

## Intent и визуальное направление

**Кто и зачем:** Support Lead/Administrator настраивает юридически и операционно
значимые нормативы, должен понимать порядок применения правил и последствия до
публикации. Это редкая, сложная и потенциально рискованная операция; интерфейс
должен быть спокойным, проверяемым и сохранять контекст.

**Domain concepts:** business time, calendar, timezone, exception, ordered
policy, selector, target, first/next response, resolution, threshold, pause,
preview, impact, immutable revision, diff, audit, rollback.

**Color world:** нейтральные slate/ink surfaces, холодный синий только для
selection и primary action, amber для warning/`AT_RISK`, red только для
blocking/error/`BREACHED`, green только для подтверждённого server success.

**Signature element:** `SLA decision ladder` — нумерованная first-match цепочка
правил, в которую после preview встроены server-owned match counts и warnings.
Она делает порядок бизнес-логики видимым и связывает editor с impact.

**Не использовать:** dashboard из одинаковых больших cards, wizard как
единственный способ редактирования, raw JSON, monospace/UUID как primary label,
gradient/glow, decorative shadow stacks, drag-only reorder и постоянно
открытые 100 тяжёлых rule forms.

### Visual checkpoint

- **Intent:** точный configuration workbench, а не marketing dashboard.
- **Hierarchy:** published/local state → section context → editable value →
  server preview → publish action.
- **Palette:** только существующие semantic tokens; brand accent один.
- **Depth:** borders и tonal surface shifts; overlay только для modal/drawer.
- **Surfaces:** одна основная рабочая плоскость, компактные nested groups, radius
  около 14 px согласно design system; без сетки floating containers.
- **Typography:** существующая UI typography; tabular numerals для durations,
  counts и version numbers; monospace только для технического ID/hash.
- **Spacing:** 4 px base grid, рабочие значения 8/12/16; плотность
  `workbench-tight`, но touch targets 40–44 px для частых действий.

## Information architecture и routes

Сохранить существующую точку входа и углубить её:

```text
/support/settings/sla-calendars                    editor + preview
/support/settings/sla-calendars/history            immutable history + audit
/support/settings/sla-calendars/revisions/:id      read-only revision detail
/support/settings/sla-calendars/compare?from=&to=  semantic diff
```

Допустим route-backed drawer вместо отдельной desktop-страницы detail, если URL
остаётся deep-linkable, reload-safe и на mobile превращается в полноценный route.

Главный desktop layout:

```text
state/lifecycle rail
┌──────────────┬──────────────────────────────┬────────────────────┐
│ section nav  │ focused editor               │ server preview     │
│ 190–220 px   │ calendar или policy          │ 280–340 px         │
└──────────────┴──────────────────────────────┴────────────────────┘
```

- Section nav: «Календарь», «Рабочая неделя», «Исключения», «Правила SLA»,
  «Паузы», с error/warning/count markers.
- Center: один focal editing context с compact summary соседних sections.
- Preview: contextual inspector, не третья независимая форма.
- На tablet preview уходит под editor либо в persistent drawer.
- На mobile используется route stack: section list → editor → preview/review;
  desktop columns не сжимаются в горизонтально прокручиваемую таблицу.

## Lifecycle и state model

Одновременно различать пять состояний:

1. current published immutable revision;
2. saved server draft с base revision/ETag;
3. local dirty changes поверх draft;
4. server preview, привязанный к exact canonical hash/catalog revision;
5. pending/unknown command recovery.

- [ ] Lifecycle rail показывает revision numbers, author/time/reason, dirty
      marker и allowed next action обычным текстом, а не только цветом.
- [ ] Local edits не меняют published summary; saved draft не называется
      published version.
- [ ] Любое изменение form, base ETag, group catalog revision или preview-
      значимого input инвалидирует старый preview и publish readiness.
- [ ] Dirty navigation guard предлагает остаться либо осознанно отбросить
      только local edits; он не удаляет server draft без отдельной команды.
- [ ] Reload восстанавливает только безопасный local envelope в том же
      actor/project scope и сверяет base ETag до редактирования.

## Business Calendar editor

### Timezone

- [ ] Searchable IANA timezone picker переиспользует PrimeVue
      `AutoComplete`/`Select` и отображает localized label, точный IANA ID и
      текущий offset как вторичную подсказку: `Мадрид — Europe/Madrid — сейчас
      UTC+02:00`.
- [ ] Сохраняется только значение из server-supported catalog/validation;
      фиксированные offsets и браузерные abbreviations не заменяют IANA ID.
- [ ] Поиск находит city/region/localized name/IANA ID; offset не является
      единственным sort/group key.
- [ ] UI явно говорит, что дедлайны и DST рассчитывает сервер. Browser `Intl`
      допускается для labels/hints, но не для SLA computation/validation.

### Рабочая неделя

- [ ] Семь компактных day rows: working-day toggle, один или несколько
      intervals, add/remove, «Скопировать в…» и «Очистить».
- [ ] Closed day и day with intervals различимы; пустой interval не
      нормализуется молча.
- [ ] Overnight interval показывается/разделяется только так, как задаёт
      backend contract. Browser не придумывает трактовку `22:00–06:00`.
- [ ] Пересечения, adjacent intervals и DST ambiguity возвращаются как typed
      server diagnostics с переходом к exact day/interval.

### Исключения и праздники

- [ ] Редактор поддерживает контрактные date + intervals/closed-day значения.
      Названия праздников, recurrence, locale holiday import и half-day presets
      не изобретаются, если их нет в Backend 36.
- [ ] Calendar date хранится как local date в выбранной timezone и не проходит
      через скрытую UTC/browser-timezone конвертацию.
- [ ] До 730 exceptions работают через year/filter grouping и virtualized либо
      paged list; DOM не содержит 730 полноценных одновременно открытых forms.
- [ ] Добавление date использует существующий PrimeVue DatePicker и доступный
      keyboard/focus model; duplicate date диагностируется до и после server
      preview без потери введённых данных.

## SLA Policy editor

### Ordered decision ladder

- [ ] Над списком постоянно показано: «Правила проверяются сверху вниз;
      применяется первое совпавшее».
- [ ] Каждое правило имеет ordinal, human summary, status/error marker, preview
      match count и actions. Fallback явно подписан и locked последним.
- [ ] Expanded одновременно одно правило либо небольшой контролируемый набор;
      100 rules не создают 100 тяжёлых subtrees.
- [ ] Drag handle — только ускоритель. Видимые «Выше»/«Ниже», keyboard actions
      и optional `Alt+↑/↓` дают полный эквивалент без drag.
- [ ] После reorder focus остаётся на правиле, ordinal обновляется, polite live
      region сообщает: «Правило … перемещено на позицию 2 из 7».

### Conditions

- [ ] `groupCode` выбирается searchable multi/single select из server catalog;
      primary text — human label, secondary — machine code.
- [ ] Archived/temporarily unavailable code, уже присутствующий в draft или
      published revision, не исчезает молча: он показывается retained pill с
      server lifecycle и repair guidance.
- [ ] Case type и priority используют closed generated options. Empty/any
      semantics подписаны явно и round-trip без browser defaults.
- [ ] Summary правила показывает все selectors, а не только имя.

### Targets, AT_RISK и pauses

- [ ] Редактируются три независимых норматива: first operator response, next
      response и resolution.
- [ ] Duration control хранит exact business seconds и умеет human-friendly
      days/hours/minutes/seconds без silent rounding. Значение 90 seconds после
      load/edit/save остаётся 90 seconds.
- [ ] `AT_RISK` редактируется в контрактной единице/диапазоне и рядом получает
      plain-language server-backed summary без вычисления дедлайна.
- [ ] Pause rules редактируются отдельно для трёх clocks только в рамках closed
      backend schema; UI показывает, какой clock останавливает каждое правило.
- [ ] Labels, helper text и summary используют «рабочее время», не создают
      впечатление calendar elapsed duration.

## Validation, preview и impact

- [ ] Local validation срабатывает на blur/structural edits, server preview —
      явная операция «Проверить и оценить», а не request на каждый keystroke.
- [ ] Общий error summary сверху содержит count и links к exact fields; каждое
      поле также получает inline error. Машинная логика строится по stable code/
      path, не по `title`/`detail` текста.
- [ ] Preview всегда маркирован как server-owned, non-dispatching и привязан к
      config hash. Показывает validation, normalized values, warnings,
      provenance и время расчёта.
- [ ] Impact counts встраиваются в decision ladder и дублируются summary:
      evaluated population, matched by rule, fallback/unknown, total,
      `dataAsOf` и truncation/limit.
- [ ] Примеры показывают human-safe labels и rule selected; PII и скрытые Case
      fields не выводятся. Browser не расширяет server projection.
- [ ] Impact называется оценкой выбора правил, а не обещанием пересчитать
      действующие clocks. Existing active occurrences не включаются в migration.
- [ ] Warnings не блокируют publish, если backend `allowedActions` разрешает;
      blocking errors блокируют. Неизвестный severity/code получает безопасный
      fallback и technical reference.
- [ ] После изменения form preview становится stale; publish требует новый
      preview либо server явно подтверждает эквивалентный canonical hash.

## Draft, publish и direct stable behavior

### Save/discard

- [ ] Draft save не открывает modal; показывает non-blocking status и новый
      authoritative ETag/base revision.
- [ ] Discard подтверждает, что удаляется server draft/local work, и не затрагивает
      published revision.
- [ ] Нормализованный ответ сервера заново гидратирует form без потери focus;
      normalization differences показаны как info, а не скрыто заменены.

### Publish review

- [ ] Publish открывает focus-safe review dialog только после валидного current
      preview. Initial focus — heading или safe cancel, focus возвращается на
      trigger.
- [ ] Dialog показывает обязательный reason, base/current revision, semantic
      diff, preview hash/time, impact scope/truncation и server warnings.
- [ ] Primary copy прямой: «После публикации эта версия сразу используется для
      новых SLA. Уже активные SLA сохраняют закреплённую версию».
- [ ] Action называется «Опубликовать версию», не `OK` и не «активировать».
- [ ] Success использует authoritative new revision number и даёт links «Открыть
      версию»/«Сравнить с предыдущей»; local/draft state очищается только после
      подтверждённого outcome.

## History, revision detail, semantic diff и audit

### History

- [ ] Cursor-paged list, newest first; row показывает revision, kind
      (`PUBLISH`/`ROLLBACK` или generated enum), actor, exact timestamp, reason,
      source revision и current marker.
- [ ] Filters/search добавляются только если backend cursor semantics их
      поддерживают; frontend не фильтрует одну страницу как будто это весь log.
- [ ] Published revision строго read-only. Открытие detail deep-linkable и
      сохраняет cursor/filter context возврата.

### Detail и diff

- [ ] Detail повторяет знакомую структуру Calendar → Rules → Targets → Pauses,
      показывает hashes/provenance в сворачиваемом technical section.
- [ ] Можно сравнить revision с предыдущей, current и второй выбранной revision.
- [ ] Semantic diff группирует Calendar/timezone, weekly intervals, exceptions,
      rule order/selectors, три targets, `AT_RISK` и pauses.
- [ ] Added/removed/changed видны текстом и цветом; unchanged sections свёрнуты.
      Raw JSON не является основным или единственным diff.
- [ ] Version history и audit разделены: history отвечает «какая конфигурация»,
      audit — «кто и какое действие выполнил». Если audit API отдельный, UI не
      синтезирует его из history.

### Rollback as new immutable version

- [ ] Действие называется «Создать новую версию на основе №N».
- [ ] Confirmation показывает source metadata, semantic diff `current → source`,
      обязательный reason и предупреждение о немедленном применении к новым SLA.
- [ ] Команда создаёт новую immutable revision с новым номером и ссылкой на
      source. Ни одна старая revision не меняется и не удаляется.
- [ ] После success открывается новая current revision; browser не подменяет
      результат локальной копией source.

## Permissions, concealment и scope hygiene

Использовать canonical permissions и server `allowedActions`:

| Состояние | Навигация и данные | Действия |
|---|---|---|
| без `project.support.sla.read` | route/nav скрыты; protected cache очищен | нет |
| read-only | current/history/detail/diff в разрешённой projection; draft скрыт | нет mutations |
| `project.support.sla.manage` | full projection в actor/project scope | только server-allowed actions |
| `project.support.sla.correct` | не расширяет settings authority | только отдельная Case clock correction capability |

- [ ] Revoke, logout, actor switch, Project switch и concealment 404 очищают
      local draft, preview, cursor, revision cache и pending recovery envelope.
- [ ] Cache/session keys включают actor + Project + resource; нельзя показать
      label, diff или error другого scope даже на мгновение.
- [ ] 403/404 не предлагают blind retry. UI возвращается в безопасный route и
      не раскрывает существование concealed revision/group.

## ETag, idempotency и command recovery

- [ ] Strong ETag хранится и отправляется opaque целиком, включая кавычки;
      frontend не парсит из него revision/version.
- [ ] Stale `412`/typed conflict сохраняет local form, загружает current в
      отдельный comparison state и предлагает compare/reload/manual reapply.
      Новый ETag не используется для silent replay старого payload.
- [ ] Для publish/rollback/discard используется один actor/project-scoped
      pending-command envelope в `sessionStorage`, по уже применённому в repo
      Case Intelligence recovery pattern.
- [ ] Envelope содержит operation, exact request fingerprint/body, opaque ETag,
      Idempotency-Key и safe timestamps; секреты и server response body не
      сохраняются.
- [ ] После timeout/navigation/reload сначала вызывается outcome lookup. Replay
      допустим только с тем же key, body и precondition, если это прямо разрешено
      финальным контрактом. Вторая команда не запускается параллельно.
- [ ] Пока outcome неизвестен, copy говорит «Проверяем результат на сервере», а
      не «Не выполнено». Completed outcome применяет authoritative snapshot;
      failed показывает typed problem; expired/unknown требует safe refetch.

## Error-state matrix

| Transport/domain | UX |
|---|---|
| 400 typed violations | error summary + inline field links; form сохраняется |
| unknown timezone/calendar/rule/target | открыть соответствующую section и exact field |
| unknown `groupCode` / catalog drift | обновить catalog, retained value не терять, re-preview |
| 409 stale draft/root | сохранить local copy, current-vs-local compare, без auto overwrite |
| idempotency key reused differently | terminal safety error, новая команда только после явного review |
| source revision missing/concealed | purge detail/action state, history refetch |
| 401/428 | re-auth/reload precondition, telemetry; не считать success |
| 403/404 | concealment purge и безопасный redirect |
| 503/dependency unavailable | retained form, retry server preview/read; no client calculation |
| timeout/connection loss | unknown outcome recovery |
| unknown future problem/enum | безопасный fallback, reference ID, telemetry, no crash |

## Frontend architecture

- [ ] Углубить существующий `src/features/support-sla` как один deep module:
      transport adapters → normalized domain → authority-scoped controller →
      focused UI sections. Page только композирует workbench.
- [ ] Generated DTO изолированы в adapter; компоненты не импортируют их и не
      зависят от wire casing/nullable quirks.
- [ ] Calendar/rule/catalog/version entities нормализованы по stable IDs; labels
      разрешаются без N+1 и raw UUID fallback как primary presentation.
- [ ] Read, preview, history и command lanes имеют независимые loading/error
      states. Abort/generation guards не дают late response затереть новый
      actor/project/form state.
- [ ] Existing lifecycle rail, calendar, rule list и controller refactorятся;
      второй SLA editor/store/API source не создаётся.
- [ ] Переиспользуются PrimeVue `AutoComplete`, `Select`/`MultiSelect`,
      `DatePicker`, `VirtualScroller`/`DataTable`, `Dialog`, `Drawer`, `Tabs` и
      существующие app primitives. Новая UI-библиотека не добавляется.
- [ ] Suggested internal seams: `api`, `domain`, `controller/recovery`,
      `calendar-editor`, `policy-ladder`, `server-preview`, `version-history`,
      `semantic-diff`; конкретные filenames могут следовать conventions repo.

## Responsive, accessibility и motion

- [ ] Light/dark используют semantic tokens; contrast, focus ring и error states
      проверяются в обеих темах.
- [ ] Все controls имеют persistent labels; logical groups используют
      `fieldset/legend` или эквивалентную семантику.
- [ ] Полный путь доступен keyboard-only. Reorder, date selection, dialogs,
      drawers и error-summary links имеют предсказуемый focus order/return.
- [ ] Status «сохранено/preview готов/reorder/publish outcome» объявляется polite
      live region без focus theft; blocking summary — alert один раз.
- [ ] Ошибка, warning, current state и diff никогда не кодируются только цветом.
- [ ] Motion 140–220 ms только для section/drawer/insert/remove/reorder, через
      transform/opacity; `prefers-reduced-motion` полностью соблюдается.
- [ ] 1440/1024/390/320 px не имеют page-level horizontal overflow. Tables на
      mobile превращаются в semantic rows/details, не уменьшаются до нечитаемого.
- [ ] Loading, empty, read-only, error, stale preview, truncated impact, catalog
      drift и recovery имеют отдельные осмысленные states без layout jump.

## Acceptance и release proof

### Unit и contract

- [ ] Duration round-trip сохраняет exact seconds, включая 90 seconds и
      mixed day/hour/minute values; нет floating/rounding drift.
- [ ] Calendar tests закрывают local-date no-UTC conversion, closed day,
      multiple intervals, duplicate exceptions, overnight contract и DST
      diagnostics mapping.
- [ ] Rule tests закрывают first-match order, locked fallback, accessible move,
      focus retention, catalog labels/retained codes и 100-rule boundary.
- [ ] Adapter tests закрывают весь pinned OpenAPI, opaque ETag, typed problems,
      semantic diff/preview normalization и unknown enum/problem fallback.
- [ ] Controller tests закрывают actor/Project/revoke purge, late responses,
      preview invalidation, catalog drift, stale edit и persisted outcome
      recovery without duplicate command.

### Component/router/accessibility

- [ ] Router/nav tests закрывают no-read/read/manage и deep-link concealment для
      history/detail/compare.
- [ ] Component tests закрывают loading/empty/error/read-only/dirty/draft/
      preview-stale/truncated/unknown-outcome states.
- [ ] Keyboard-only tests проходят timezone search, weekly intervals,
      exceptions, rule edit/reorder, error summary, publish и rollback dialogs.
- [ ] Playwright + axe проходят light/dark на 1440/1024/390/320, включая 100
      rules и 730 exceptions без page overflow и runaway DOM.

### Real API E2E

- [ ] Fresh Project: получить group catalog → собрать Calendar/Policy → server
      preview → save draft → publish → открыть immutable revision/history/diff.
- [ ] Новый Case после publish получает SLA occurrence, pinned к новой revision;
      browser ничего не вычисляет. Case с ранее активным occurrence сохраняет
      прежний revision pin.
- [ ] Rollback из старой revision создаёт новую current immutable revision;
      history сохраняет исходную, промежуточную и новую версии, diff/audit
      совпадают с backend facts.
- [ ] Negative E2E закрывает invalid timezone/calendar/target/pause, unknown
      group, catalog drift, stale ETag, permission revoke/concealment, 503 и
      connection loss с outcome reconciliation.
- [ ] `npm run api:check`, typecheck, lint, unit/component и relevant E2E
      проходят; backend staging использует final migration/OpenAPI Ticket 36.

## Не входит / не дублировать

Ticket 40 не реализует SLA engine, client-side deadlines/statuses, Case clock
correction, migration активных occurrences, routing/assignment, escalation/
notification policies, analytics dashboard, holiday provider/import, именованные
holidays/recurrence без backend schema, произвольные `groupCode`, raw JSON editor
или отдельное включение опубликованной конфигурации. Любая валидная опубликованная
версия применяется системой напрямую по Backend 36.
