# Ticket 31 — External Work frontend release proof

## Candidate

- Backend contract: `4a96a2a7f0216614ce126da2e0e83a7f728fb5a5`.
- OpenAPI: `sha256:f245791d705be8b1e903bdf0d4f1b0fceafd18720ac23ad717463dbc4ded93b5`.
- Production release authority: backend runbook
  `docs/setup/support-external-work-release.ru.md`; этот frontend proof не
  включает rollout или реальные provider credentials.

## Проверенный сценарий

1. Exact-permission route/nav admission и Project query switch.
2. ACTIVE и REAUTH_REQUIRED connections, test, catalog freshness и site/account.
3. Mapping draft, validation, preview, version diff, publish/rollback contract.
4. Compatibility inbox и linked recovery detail.
5. UNKNOWN command → evidence refresh → authoritative receipt без нового key.
6. Actor/Project/permission fencing, concealed access, conflict, timeout,
   in-flight teardown и receipt-without-reread recovery.
7. 1440×1000, 1024×768 и 390×844 в light/dark; tablet long/unbroken authority
   values; keyboard selection/Back; 44 px mobile Back; no horizontal overflow и
   undisabled axe critical/serious gate.

## Visual evidence

- Settings: `settings-desktop-light.png`, `settings-desktop-dark.png`,
  `settings-tablet-long-light.png`, `settings-tablet-long-dark.png`,
  `settings-mobile-light.png`, `settings-mobile-dark.png`.
- Recovery: `external-work-desktop-light.png`, `external-work-desktop-dark.png`,
  `external-work-tablet-long-light.png`, `external-work-tablet-long-dark.png`,
  `external-work-mobile-light.png`, `external-work-mobile-dark.png`.

Все файлы находятся в `docs/evidence/support-workspace/ticket-31/`. Tablet long
варианты дополнительно проверяют перенос длинного unbroken authority value без
горизонтального overflow.

Артефакты содержат только deterministic mock data; credentials, tokens, End
User PII и реальные provider objects отсутствуют.

## Release-owner checks вне локального frontend gate

- Использовать immutable frontend/backend candidates и backend fixture/evidence
  path из authoritative runbook.
- Проверить CORS exposure durable settings receipt headers на фактическом
  frontend origin; correctness не должна зависеть от отображения header в UI.
- Выполнить реальный OAuth/provider smoke только в выделенном Project, затем
  rollback по server-owned runbook. Не подменять этот шаг mock evidence.
