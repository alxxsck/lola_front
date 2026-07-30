# Перевод операторского чата: frontend release proof

Дата: 30 июля 2026 года.
Ветка: `codex/support-chat-translations-frontend`.

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
- permission-guarded override без перевода с обязательной причиной;
- recovery envelope без текста;
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

- Vitest: `485/485` suites, `1420/1420` tests.
- Focused translation regression: `133/133`.
- Playwright translation flow: `5 passed`, `1` ожидаемо skipped как mobile-only.
- `vue-tsc`, ESLint, IAM architecture check: passed.
- Production build: passed, `2775` modules transformed.
- Visual QA: desktop `1440×1000/1100`, mobile `390×844`.
- Browser runtime errors in tested translation flows: none.
- Backend public boundary contract: `5/5` — REST, Widget и realtime возвращают End User только
  delivered text без русского source и provider/model metadata.

Production defaults to API mode. Mock translation data exists only when the existing explicit
`VITE_DATA_MODE=mock` demo mode is selected and never invokes xAI.
