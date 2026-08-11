# 39 — Завершить frontend control plane маршрутизации

**Part of GitHub epic:** #4.

**What to build:** Support Lead полностью настраивает автоматическую
маршрутизацию из CMS: создаёт Teams/Skills, публикует Workforce, собирает и
проверяет Queue, публикует Routing Policy, связывает Queue с Policy, проходит
server-owned readiness, включает `OFFER`/`AUTO_ASSIGN` и разбирает фактическое
решение до Case, кандидатов, исключений и закреплённых revisions.

**Discovery artifact:**
`docs/research/support-routing-control-plane-ticket-39-discovery-2026-08-11.ru.md`.

**Status:** blocked-by-backend-contract-gate

**Delivery invariant:** это постоянная permission-gated capability. Frontend
feature flags, env toggles, raw JSON как основной редактор, client-side
readiness/ranking/capacity и восстановление удалённых rollout/admission API не
допускаются.

## Gate 0 — backend prerequisites и frontend contract sync

- Backend-объём и точные контракты:
  `docs/research/support-routing-control-plane-backend-blockers-2026-08-11.ru.md`.
- [ ] Есть Queue-slot read/catalog: binding и `routePriority` читаются после
      reload и для `DISABLED` Queue.
- [ ] Есть server-owned per-Queue readiness projection с closed blocker codes,
      entity/version pins и repair target для Queue publication, READY
      generation, compatible Queue mode, Policy, Workforce, slot и Team refs.
- [ ] Policy read DTO типизирует draft/current published revision целиком;
      Decision DTO типизирует outcome, selected Team, candidates, exclusions,
      score components, fact versions, input/source manifests и visibility.
- [ ] Ручной Shadow Run имеет durable `runId`, terminal state и
      однозначную связь с получившимися Decisions.
- [ ] Есть bounded searchable operator presentation resolver/catalog для
      Workforce и Decision UI; Support Lead не зависит от `project.members.read`,
      не делает N+1 и не видит UUID как primary label.
- [ ] Policy publish→read round-trip сохраняет `queueWeights`, `timeouts` и
      `retry`; non-default contract test проходит; transport/compiler одинаково
      ограничивают `retry.maxAttempts`.
- [ ] Для полного version/audit promise есть revision list/detail, actor/time/
      reason, semantic diff и restore-as-new-draft для Workforce/Queue/Policy.
- [ ] Pinned frontend contract содержит typed 400/401/403/404/409/428/503 и
      unknown-outcome/idempotency semantics для всех mutations.
- [ ] После стабилизации backend API на frontend экспортирован актуальный
      OpenAPI, generated client больше не содержит удалённые
      project-rollout/admission endpoints и старые activation types.

## Information architecture

Один navigation group «Маршрутизация» и связанный workbench:

```text
/support/settings/routing             overview, readiness, activation
/support/settings/teams-skills        Team и Skill identities
/support/settings/workforce           operator capacity/skills/languages
/support/settings/queues              Queue catalog, rules, preview, publish
/support/settings/routing/policies    Policy catalog/editor/history
/support/settings/routing/decisions   Decisions, explain и audit
```

Flow один и видим пользователю целиком:
`Configure → Preview/Validate → Publish → Bind → Readiness → Activate → Diagnose`.
`AUTO_ASSIGN` — финальный step confirmation wizard, а не обычный toggle.

## Frontend scope

### Foundation и authority

- [ ] Добавить `project.support.teams.read/manage` и
      `project.support.queues.read/manage` в canonical frontend permission
      registry; routes/nav/actions используют exact server permissions.
- [ ] Создать один глубокий feature module с API adapters, authority-scoped
      controller, normalized catalogs и shared command recovery. Generated DTO
      не протекает непосредственно в page-компоненты.
- [ ] Все protected caches/drafts очищаются при revoke, смене Project/actor и
      concealment 404; read-only пользователь не получает draft/mutation UI.
- [ ] Все commands используют `Idempotency-Key` и `If-Match`/ETag по контракту;
      409/428/timeout не превращаются в локальный успех.

### Teams, Skills и Workforce

- [ ] Searchable Team/Skill catalogs поддерживают create, rename, archive,
      reference impact и conflict recovery.
- [ ] Workforce matrix показывает operator presentation, membership, capacity
      units, skills/proficiency и languages; есть keyboard-friendly bulk edit,
      filters и summary покрытия.
- [ ] Configured capacity и live Availability показаны как разные состояния.
      Availability не записывается в Workforce draft.
- [ ] Local dirty, saved server draft и published immutable revision имеют
      разные labels/actions; доступны discard, diff, publish и restore-as-draft.

### Queues

- [ ] Catalog показывает published/draft state, match count/freshness, routing
      mode, primary/fallback Teams, binding, activation и ordered priority.
- [ ] Guided recursive builder поддерживает closed `All/Any/Not` grammar и
      typed predicates `field/operator/value`; raw JSON не используется.
- [ ] Sort, visibility, `MANUAL/OFFER/AUTO_ASSIGN`, primary и ordered fallback
      Teams редактируются только в пределах generated closed contract.
- [ ] Server preview показывает count/lower bound, samples, high-water и
      diagnostics; browser не исполняет Queue predicate.
- [ ] Reorder имеет drag и доступные Move up/down actions; priority conflict
      перечитывает authoritative catalog и сохраняет несвязанный draft.

### Routing Policies

- [ ] Guided editor покрывает mandatory/preferred skills/languages, capacity
      weight, utilization ceiling, candidate/Queue weights, offer/reservation
      timeouts, retry/cooldown/fallback delay.
- [ ] Numeric controls сопровождаются plain-language impact summary, field-level
      validation и jump-to-field; никаких magic defaults, скрытых browser
      normalization или arbitrary JSON.
- [ ] Published revision read-only; Edit работает с отдельным draft; validate,
      diff, publish, history и restore-as-new-draft являются разными действиями.

### Binding, readiness и activation

- [ ] Queue→Policy slot и route priority можно прочитать, создать, изменить и
      увидеть после reload независимо от activation state.
- [ ] Routing overview использует signature `Readiness rail`: Workforce → Queue
      → Policy → Binding → Shadow → Activation. Каждый server status имеет
      пояснение и deep link к exact repair target.
- [ ] Shadow control/run и Decision results дают безопасную проверку до LIVE;
      result не приписывается запуску без server correlation.
- [ ] Activation wizard показывает Queue/Policy/Workforce/generation pins,
      affected scope, target `OFFER`/`AUTO_ASSIGN`, reason и blocking readiness.
- [ ] Deactivate не удаляет slot/config; unknown outcome разрешается только
      authoritative activation refetch/idempotent replay.

### Decisions, explain и audit

- [ ] Decision catalog показывает time/outcome, Case, Queue, Team/operator,
      candidate/exclusion counts, latency и pinned revisions.
- [ ] Explain drawer показывает evaluated path, ordered candidates,
      eligibility/exclusions, score breakdown, fact versions и Case deep link;
      server privacy projection не расширяется браузером.
- [ ] Unknown future enum получает безопасный fallback label и technical code,
      а не crash или ложное «успешно».
- [ ] Audit показывает actor/time/reason и semantic diff; restore всегда создаёт
      новый draft и требует отдельного publish.

## Visual, responsive и motion direction

- [ ] Спокойный workbench-tight control plane на существующих semantic tokens и
      PrimeVue primitives: split view `catalog → editor/inspector`, один focal
      action, status color только по смыслу, без сетки одинаковых mega-cards.
- [ ] Readiness rail — уникальная визуальная подпись домена; связи Queue,
      Policy, Workforce и activation читаются без opaque IDs.
- [ ] Motion 140–220 ms только для insert/remove/reorder, drawer и readiness
      transition; только transform/opacity, без постоянного glow и с
      `prefers-reduced-motion`.
- [ ] Desktop/tablet/mobile не имеют horizontal overflow; mobile использует
      route stack, sticky action summary и одну рабочую поверхность.
- [ ] Reorder не drag-only; tables/interactive grids следуют semantic keyboard
      model; errors/statuses доступны без цвета и через restrained live regions.

## Acceptance / release proof

- [ ] Unit/contract tests закрывают adapters, permission/revoke purge, DTO
      mapping, validation, idempotency/ETag, 409/428/timeout и unknown enums.
- [ ] Component/router tests закрывают read-only/manage, loading/empty/error,
      dirty navigation, archive impact, publish/diff, readiness и activation.
- [ ] Playwright + axe проверяют light/dark и 1440/1024/390/320 для всех шести
      routes, keyboard-only reorder/rule editing и reduced motion.
- [ ] Real-API staging E2E доказывает путь: fresh Project → Team/Skill → Workforce
      publish → Queue preview/publish → Policy publish → slot → shadow →
      readiness → `AUTO_ASSIGN` → available operator получает Case → Decision
      explain совпадает с Assignment.
- [ ] Failure E2E отдельно доказывает no eligible operator, capacity gap,
      missing/stale prerequisite, route-priority conflict, stale ETag,
      worker/dependency degradation, deactivate/drain и unknown outcome.
- [ ] `npm run api:check`, typecheck, lint, unit/component и relevant E2E проходят;
      backend staging подтверждает routing worker DB capability/grants.

## Не входит / не дублировать

Ticket 39 не переписывает routing algorithm, manual assignment/reassignment,
operator self-Availability, OFFER accept/decline и существующее Case assignment
presentation. Он связывает эти готовые runtime поверхности с полноценным
configuration/activation/diagnostics control plane и не создаёт второй source
of truth.
