# Agent review

A maintainer adds the `agent-review` label to a PR. Claude Code reviews it, and `marimo-oss-bot`
posts the findings as a comment review. It doesn't approve or request changes yet; see
[Approval later](#approval-later). Repositories call the reusable workflow in
[`.github/workflows/agent-review.yml`](../.github/workflows/agent-review.yml).

## Trust boundaries

| Job       | GitHub access                   | Credentials                     | Untrusted input       |
| --------- | ------------------------------- | ------------------------------- | --------------------- |
| `start`   | read; bot token for one comment | bot key                         | none                  |
| `review`  | read only                       | model credentials, OTLP headers | the PR, via the agent |
| `publish` | read; bot token for the review  | bot key                         | the agent's output    |

- Claude Code gets only `Read`, `Grep`, and `Glob`, confined to the workspace and denied `.git`,
  where claude-code-action writes the job's token. It has no shell, and the action removes the OIDC
  request token from its environment. No workflow step executes the PR head, which is checked out
  under `pr-head/`.
- Only the Claude steps of the `review` job depend on the harness. A harness with a shell, such as
  Codex, needs a sandbox there first: anything that runs in the `review` job can read its OIDC
  request token.
- Instructions come from [`prompts/`](prompts) and the base branch's `REVIEW.md`, `AGENTS.md`, and
  `CLAUDE.md`, so the PR can't change them.
- `start` and `publish` run in the `agent-bot` environment, the only one that can fetch the bot key.
  `review` runs in `agent`, the only one that can fetch model keys.
- Output containing anything shaped like a credential is discarded before upload. It catches tokens
  printed verbatim, not encoded ones.
- [`publish.ts`](steps/publish.ts) builds the review from live PR state, not from what the agent
  says about the PR.
- `policy-ref` must be on this repository's `main`; a fork's commit is rejected.

## Observability

When the `ci_agent` Doppler config has `OTLP_ENDPOINT`, Claude Code exports its conversation over
OTLP/HTTP: prompts, responses, tool calls, and file contents it read, plus token and cost metrics.
The job log stays free of it, because logs are public. `OTLP_HEADERS` holds the backend's auth as
comma-separated `key=value` pairs. Claude Code sends values as written, so use a literal space, not
`%20`. Any backend that accepts OTLP logs works; for Grafana Cloud:

```
OTLP_ENDPOINT=https://otlp-gateway-prod-<region>.grafana.net/otlp
OTLP_HEADERS=Authorization=Basic <base64 of instance-id:token>
```

Give the token only write scopes. Find a review by `github.repository`, `github.pr`, or
`github.run_id`. The conversation text is in log events, not spans, and Claude's spans aren't nested
under one trace, so read a review through its log events, ordered by `event.sequence`.

## Approval later

The bot only comments. Approving and requesting changes plug into [`plan.ts`](src/plan.ts), which
already works from live PR state. Commit `3796dfd` implemented all of this, with tests:

1. Caller inputs for the policy, parsed in [`policy.ts`](src/policy.ts): whether the bot may
   approve, the severity that requests changes, extra paths that always need a human, and a size
   limit.
2. More live state in `PullState`: the author's role, the changed files, and `coverageGaps`
   recomputed from GitHub, so a PR padded past what the agent can read is never approved.
3. A pure function that picks the event. Approval needs a complete review of the current head, no
   findings at medium or above, no protected paths, a PR within the size limit, and an author with
   write access.
4. Dismissing the bot's earlier approval when a later review doesn't approve, and its block only
   after a complete review of the current head.

Before turning approval on, turn on "dismiss stale approvals", and confirm that an app's approval
counts toward the required reviews.

## Adding a repository

1. Install `marimo-oss-bot` and create the `agent-review` label.
2. Create the `agent` and `agent-bot` environments and restrict both to the default branch, before
   Doppler trusts them. Otherwise a workflow on another branch could create or use them and fetch
   the keys.
3. In Doppler, add `repo:marimo-team/<repository>:environment:agent` to the agent identity's
   subjects and `…:environment:agent-bot` to the bot identity's. Repositories created, renamed, or
   transferred after July 15, 2026 have IDs in the subject
   (`repo:marimo-team@<id>/<repository>@<id>:…`), so copy it from the repository's OIDC settings
   preview. On both identities, also require `repository_owner` `marimo-team`, `ref`
   `refs/heads/<default branch>`, and `job_workflow_ref`
   `marimo-team/.github/.github/workflows/agent-*.yml@*`. Doppler doesn't document wildcard
   matching, so check it once per identity: a review fetches its keys with this value, and fails
   with `…/workflows/other-*.yml@*`. If the wildcard doesn't match, drop `job_workflow_ref`: the
   value ends in the caller's pinned SHA, so an exact value breaks on every bump.
4. Add a caller workflow:

   ```yaml
   name: Agent Review
   on:
     pull_request_target:
       types: [labeled]

   permissions: {}

   jobs:
     agent-review:
       if: github.event.label.name == 'agent-review'
       concurrency:
         group: agent-review-${{ github.event.pull_request.number }}
       permissions:
         contents: read
         pull-requests: read
         id-token: write
       uses: marimo-team/.github/.github/workflows/agent-review.yml@<sha>
       with:
         policy-ref: <sha>
         # model: claude-opus-5-5 # optional; the default
   ```

5. Optionally, add `REVIEW.md` at the repository root with review instructions.

## Development

```sh
cd agent-review
deno task check && deno task test
```
