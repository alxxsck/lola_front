# Перевод операторского чата: frontend release proof

Дата: 30 июля 2026 года.
Ветка: `main` после merge `codex/support-chat-translations-frontend`.

## Готовый функционал

- conversation opt-in и ручной target locale;
- явное разрешение конфликта profile/recent-message language до preview;
- bounded bulk текущих 50 сообщений, новые страницы и future realtime для
  USER/ASSISTANT/SCENARIO;
- persisted inbound original/translation projection;
- CMS-only translation realtime с status-rank merge и REST reconciliation;
- preview-first outbound draft, edit-before-send, retry, reversible stale invalidation и atomic send;
- automatic/manual pending reconciliation и unknown-outcome REST recovery без повторной доставки;
- target locale selector строится из backend `supportedLocales`, без frontend allowlist;
- язык ответа показывает источник решения: manual/profile/recent messages/case/unknown;
- при UNKNOWN/conflict оператор всегда может выбрать любой backend-supported locale вручную,
  а conflict copy показывает фактический `language.source`;
- model/provider details fail-closed скрыты без `project.translation.read`;
- очевидный noise и только authoritative same-language сообщения отсекаются до
  bulk/realtime command; без достоверного source locale любой содержательный текст, включая
  кириллицу, остаётся доступен для перевода;
- provider unavailable и hard budget exhaustion блокируют provider work и никогда не
  отправляют исходный текст автоматически;
- permission-guarded override без перевода с обязательной причиной;
- CMS-only reply recovery хранит source в same-tab `sessionStorage`, scoped по
  project/end-user/conversation, валидирует срок/размер и очищается при auth clear,
  consumed/expired draft и явном discard;
- `SKIPPED` отображается как безопасное объяснение без утечки raw enum;
- отдельные model profiles `Основная модель` / `Модель переводов`;
- `grok-4.3 + reasoning low` как отображаемый translation default;
- Project translation tone/formality, read-only Working Locale и glossary editor;
- workload AI Usage с applied model и reasoning;
- responsive desktop/mobile UI.

## Contract

- Backend revision:
  `c9d3e975b7da2ce3b85bb7a8852b751f1a97180f`.
- OpenAPI SHA-256:
  `2dcf8a52f1c31f4b6069a30d8cb9cb35b4e4535c4194d06ee81a2ee8f479a0aa`.
- Required operations: `112`.

## Evidence

- Vitest: `242/242` test files, `1465/1465` tests.
- Focused post-merge translation regression: `12/12` files, `128/128` tests.
- Playwright translation flow: `7 passed`, `1` ожидаемо skipped как mobile-only.
- Playwright production API-mode: `2/2` — отдельные desktop и mobile прогоны с
  двумя реальными CMS identities, двумя End Users/Conversations и real backend.
- `vue-tsc`, ESLint, IAM architecture check: passed.
- Production build: passed, `2776` modules transformed.
- Visual QA: mock desktop `1440×1000/1100`, mobile `390×844`; дополнительно
  production API-mode screenshots для desktop Chrome и Pixel 7.
- Browser runtime errors in tested translation flows: none.
- Backend public boundary contract: `5/5` — REST, Widget и realtime возвращают End User только
  delivered text без русского source и provider/model metadata.
- Browser public boundary: real `/chat/conversations/:id/messages`, compatibility
  `/chat/messages` и `/assistant` `chat.message` проверены на отсутствие source,
  translation/provider/model/token/idempotency/config metadata.

## Матрица обязательных integration-сценариев

| Сценарий                                 | Доказательство                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reload не создаёт повторную работу       | controller recovery/idempotency tests; workspace восстанавливает пустой composer и persisted reply draft; persisted message projection не создаёт provider work; Playwright сохраняет conversation preference |
| Older page переводится отдельно          | `UserWorkspaceDialog.test.ts`: command получает только id новой страницы                                                                                                                                      |
| Future realtime                          | workspace integration: без authoritative source locale и foreign, и Cyrillic USER создают command; истинный same-language безопасно SKIP-ается backend                                                        |
| Два CMS Users, Conversations и End Users | API-mode Playwright desktop/mobile: opt-in первого CMS User не виден второму CMS User и не переносится в другой Conversation/End User                                                                         |
| Provider/budget failure                  | API-mode browser подтверждает deployment/provider fail-closed UI и `422`; hard-budget exhaustion остаётся покрыт controller/unit/integration tests без ложного browser claim                                  |
| Socket reconnect                         | workspace reconcile callback повторно получает authoritative REST projection                                                                                                                                  |
| Public REST/Widget/realtime              | backend boundary `5/5` плюс API-mode Playwright desktop/mobile на production-shaped REST, compatibility Widget и реальном `/assistant` socket; mock UI не используется как security evidence                  |

Environment gate закрыт тестом `e2e/support-chat-translation.api.spec.ts`, который runner
запускает последовательно в `api-chromium` и `api-mobile-chromium` на новой изолированной
PostgreSQL базе. Единственный browser route bridge — существующий phishing-resistant
`/auth/refresh`; translation/chat/public/realtime запросы не мокируются.

Production defaults to API mode. Mock translation data exists only when the existing explicit
`VITE_DATA_MODE=mock` demo mode is selected and never invokes xAI.
