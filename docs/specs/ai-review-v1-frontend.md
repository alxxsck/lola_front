# AI Review v1 — frontend specification

## Problem Statement

Operators can inspect Event Logs manually but do not have a bounded UI for requesting an
evidence-linked Lola proposal about selected Events. A free-form prompt box would hide scope and
cost, while a synchronous action would provide poor progress and retry feedback.

## Solution

The existing End User workspace gains a typed AI Review dialog. The operator chooses one
Project-local date and one to twenty Event codes, optionally adds a short instruction, previews
volume, confirms high-cost scopes, and starts a durable Run. The dialog polls the Run and opens the
created AI Proposal on success.

## User Stories

1. As an operator, I want to start Review from the selected End User workspace, so that the user
   scope is obvious.
2. As an operator, I want to select a Project-local date, so that the reviewed day matches Project
   operations.
3. As an operator, I want to select Event codes from the Project catalog, so that I cannot submit an
   invalid or hidden filter.
4. As an operator, I want the UI to enforce one to twenty Event codes, so that backend constraints
   are visible before submission.
5. As an operator, I want to enter a short optional instruction, so that I can focus the analysis.
6. As an operator, I want to preview Event count, evidence size, token upper bound, and cost level,
   so that I understand likely expense.
7. As an operator, I want a changed scope to invalidate the old preview, so that confirmation never
   applies to different evidence.
8. As an operator, I want HIGH scope to require explicit confirmation, so that I knowingly accept
   the spend.
9. As an operator, I want blocked scope to explain how to narrow it, so that hard limits are
   actionable.
10. As an operator, I want duplicate clicks prevented while a Run is being created, so that the UI
    does not create duplicate work.
11. As an operator, I want pending/running status and safe failure messages, so that background work
    is understandable.
12. As an operator, I want `OUTCOME_UNKNOWN` to warn against automatic retry, so that I understand
    possible duplicate cost.
13. As an operator, I want a successful Run to open its AI Proposal, so that I can inspect findings
    and cited Events in the existing inbox.
14. As a read-only CMS User, I want the action hidden or disabled, so that permission boundaries are
    clear.
15. As a Project administrator, I want a simple Review enable switch and daily Run limit in Project
    settings, so that cost is independently controlled.
16. As a mobile CMS User, I want the dialog to remain usable in the existing responsive workspace,
    so that Review is not desktop-only.

## Implementation Decisions

- Add one focused AI Review feature with typed repository, small form model, settings section, and
  dialog. Avoid a global store and reuse the existing router for the final AI Proposal.
- Put the entry action in the existing End User workspace. `projectId` and `endUserId` come from the
  workspace context and are not editable in the dialog.
- Load selectable Event codes from the existing Project Event catalog. Use the native calendar
  input and show the Project timezone returned by the backend contract.
- The form contains local date, selected Event codes, and optional instruction. It does not expose
  SQL, JSONPath, raw filters, multi-user selection, or multi-day ranges.
- Preview is an explicit action or debounced after a valid stable scope. Any change to date, codes,
  or instruction clears confirmation and marks the previous estimate stale.
- Present Event count, redacted bytes, conservative token upper bound, and LOW/MEDIUM/HIGH label.
  HIGH displays a confirmation checkbox; blocked estimates disable Run creation and explain that
  event codes must be narrowed.
- Generate one client idempotency key per deliberate submission and retain it during network retry.
  Disable the submit button while the request is in flight.
- After creation, poll the Run with bounded backoff while the dialog is open. Stop on terminal state
  or component unmount; no new realtime channel is introduced.
- On success, show a button that navigates to the existing AI Proposal detail route. Do not duplicate
  the full Proposal renderer in the dialog.
- Project settings live near AI Usage and independently show `enabled` and daily Run limit.
- Permission checks use existing project-permission helpers with dedicated
  `project.ai_review.read/run` permissions plus the read permissions needed to load settings,
  Event Definitions, and the resulting Proposal. Server responses remain authoritative.
- API mode uses generated backend contracts; mock mode implements the same repository interface for
  local UI tests and demos.

## Testing Decisions

- Test the repository contract for settings, estimate, create, and status reads.
- Test the dialog as the public UI seam: validation, event selection, stale preview, high-cost
  confirmation, blocked scope, duplicate-submit prevention, polling, unknown outcome, and Proposal
  navigation.
- Test Project settings read-only and editable states.
- Test User Workspace integration and permission gating through visible behavior.
- Follow existing User Workspace, Event Logs, AI Proposal, Activity Settings, and repository test
  patterns.

## Out of Scope

- Free-form chat with an administrative AI agent.
- Reviewing several End Users or days.
- Editing raw Event payloads or backend filters.
- Streaming partial model output.
- A new AI Review page, global queue dashboard, or realtime socket.
- Rendering complete Proposal findings outside the existing Proposal detail UI.
- Exact monetary prediction before the provider call.
- Automatic scheduled reviews.

## Further Notes

- Backend AI Review v1 and User Memory v1 are prerequisites.
- Cost labels are conservative preflight guidance; existing AI Usage reporting remains the source of
  actual provider usage and cost.
