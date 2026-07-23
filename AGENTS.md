## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default canonical label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses the single-context layout. See `docs/agents/domain.md`.

### Main branch workflow

Never push a local `main` commit on top of a stale remote base. Commit the intended
changes locally, fetch `origin`, rebase the local commit onto the current
`origin/main`, resolve and verify the rebased result, and only then push `main`.
