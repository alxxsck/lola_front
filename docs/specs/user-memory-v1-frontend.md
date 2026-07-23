# User Memory v1 — frontend specification

## Problem Statement

CMS Users cannot see or control the context Lola remembers across Conversations. Project
administrators also need a simple way to stop memory-related AI spend without deleting stored
facts, while operators need provenance before trusting or removing a fact.

## Solution

The Project page gains a compact AI Memory settings section. The existing End User workspace gains
a Memory panel that lists active facts with provenance and expiry and supports deleting one fact or
clearing the End User's memory. The UI uses generated backend contracts, dedicated
`project.user_memory.read/manage` permissions, and
current PrimeVue patterns.

## User Stories

1. As a Project administrator, I want to see whether AI Memory is enabled, so that its cost is not
   hidden.
2. As a Project administrator, I want to enable or suspend AI Memory, so that I can control spend
   without deleting data.
3. As a Project administrator, I want to set a daily extraction-call limit, so that usage remains
   bounded.
4. As a Project administrator, I want to see the fact TTL, so that retention is explicit.
5. As a read-only CMS User, I want to see settings without editable controls, so that permission
   boundaries are clear.
6. As an operator, I want to see an End User's active memory facts, so that I know what Lola may use.
7. As an operator, I want each fact to show category, value, source time, and expiry, so that I can
   judge whether it is still relevant.
8. As an authorized operator, I want to delete one incorrect fact, so that it stops influencing
   Lola immediately.
9. As an authorized operator, I want to clear all memory only after confirmation, so that accidental
   bulk deletion is difficult.
10. As an operator, I want disabled memory to be visibly described as paused rather than deleted, so
    that the setting is not misleading.
11. As an operator, I want clear loading, empty, forbidden, and retry states, so that the panel is
    useful during failures.
12. As a mobile CMS User, I want the panel to fit the existing End User workspace, so that memory is
    available without a desktop-only page.

## Implementation Decisions

- Add one focused AI Memory feature with a typed repository, small presentation model, Project
  settings section, and End User memory panel. Do not introduce a new global store.
- Place Project-level controls on the existing Project page near AI Usage because the setting
  controls cost. Settings respect Project settings permissions; facts use the dedicated User Memory
  permissions and render read-only state when mutation permission is absent.
- Place End User facts inside the existing User Workspace profile area. Reuse the workspace opened
  from both Users and Live pages; do not add a separate memory route.
- Show `enabled`, daily call limit, TTL, current status text, and the backend version used for
  optimistic update. Disabling clearly states that existing facts are retained but not used.
- List active facts only. Each item shows a human category label, value, source observation time,
  and expiry. Source message text is not duplicated into the list.
- Delete-one and clear-all actions are permission-gated. Clear-all requires a confirmation dialog
  naming the End User and explaining irreversibility.
- Repository interfaces map generated API DTOs to feature types. API and mock data modes expose the
  same behavior.
- Errors use concise user-facing messages and retain a retry action. No raw provider or backend
  details are rendered.
- The feature does not estimate exact future cost; it exposes the configured call budget and links
  cost understanding to the existing AI Usage section.
- Keep components local to the feature and use existing PrimeVue controls and visual language.

## Testing Decisions

- Test the repository contract for settings, list, delete, and clear operations.
- Test Project settings behavior for read-only permissions, saving, and the paused-not-deleted copy.
- Test the End User memory panel for loading, empty, fact rendering, delete, clear confirmation,
  forbidden mutation, and error retry.
- Test User Workspace integration through its public props and visible behavior rather than private
  composables.
- Follow existing Activity Settings, AI Usage, User Workspace, and generated-client test patterns.

## Out of Scope

- End User-facing memory controls in the product widget.
- Editing a fact's value in CMS.
- Showing expired or deleted facts and a deletion audit timeline.
- Per-category toggles, confidence scores, or manual fact creation.
- Cost charts specific to memory beyond existing AI Usage reporting.
- A new route or global memory-management page.

## Further Notes

- Backend User Memory v1 is a prerequisite.
- The UI must not describe model-derived facts as trusted profile attributes.
