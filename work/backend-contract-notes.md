# Backend contract patch

## Scope

The patch is intended for `/Users/alxxsck/Documents/Lola_backend` and does not modify that
working tree directly.

It adds:

- a stable Swagger operation id factory (`<Controller>_<method>`) and enables the official
  Nest Swagger compiler plugin with the class-validator shim;
- explicit response DTOs and controller response annotations for CMS auth, projects,
  project members, users, UI elements, event definitions/logs, scenarios/actions, and scenario
  runs;
- an exported OpenAPI enum for all persisted scenario action types;
- explicit auth request metadata so login/refresh/logout request bodies are never empty even
  outside the compiler-plugin build;
- safe automatic linking of pre-existing project invitations to a successfully authenticated
  `AdminUser`, using case-insensitive normalized email matching;
- tenant guard tests and an OpenAPI contract test covering stable operation ids, required auth
  fields, non-empty response schemas, secret-field exclusion, and the action enum.

## Files

- `nest-cli.json`
- `src/main.ts`
- `src/common/openapi.ts`
- `src/modules/auth/cms-auth.controller.ts`
- `src/modules/auth/cms-auth.service.ts`
- `src/modules/auth/dto/cms-auth.dto.ts`
- `src/modules/auth/dto/cms-auth-response.dto.ts`
- `src/modules/platform/platform.controller.ts`
- `src/modules/platform/integration-users.controller.ts`
- `src/modules/platform/dto/platform.dto.ts`
- `src/modules/platform/dto/platform-response.dto.ts`
- `src/modules/events/events.controller.ts`
- `src/modules/events/dto/event-response.dto.ts`
- `src/modules/scenarios/scenario-runs.controller.ts`
- `src/modules/scenarios/dto/scenario-run-response.dto.ts`
- `test/cms-project-guard.test.ts`
- `test/openapi-contract.test.ts`

## Assumptions and security decisions

- The existing `CmsProjectGuard` and `ProjectMember.adminUserId` relation are the source of
  truth for CMS tenant access. The patch preserves them rather than introducing a second access
  model.
- Invitation linking happens only after password verification succeeds. It matches the admin's
  email (or an email-shaped login) case-insensitively, links only rows with `adminUserId = null`,
  and skips projects where the same admin is already linked. Existing email values are not
  rewritten, so no schema or data migration is required.
- Project response schemas deliberately omit `serverKeyHash`. The server API key remains exposed
  only in the one-time project creation/rotation response DTOs. Auth response schemas contain no
  password hash or refresh-token persistence metadata.
- The compiler plugin is relied upon to describe the complete set of existing request DTO
  properties from TypeScript and class-validator metadata. Auth inputs and scenario action enum
  metadata are also explicit because they are critical for generated clients.
- No destructive Prisma migration is included.
- The current `randomUUID` request-id middleware, structured HTTP logger, and
  `ApiExceptionFilter` in `src/main.ts` are preserved. The patch only adds the OpenAPI operation
  id factory import/use; it does not add a second request-id implementation.

## Apply and verify

```bash
cd /Users/alxxsck/Documents/Lola_backend
git apply --check /Users/alxxsck/Documents/Lola_front/work/backend-contract.patch
git apply /Users/alxxsck/Documents/Lola_front/work/backend-contract.patch
npm run lint
npm test
npm run build
```

To inspect the generated contract after starting the configured database and backend:

```bash
curl -fsS http://localhost:3000/docs-json -o openapi.json
```

## Verification performed in an isolated copy

- `git apply --check`: passed against the current backend tree after rebasing the patch over the
  request-id middleware and API exception-filter update.
- `npm run lint`: passed.
- `npm test`: 9/9 passed.
- `npm run build`: passed with the Swagger compiler plugin enabled.
