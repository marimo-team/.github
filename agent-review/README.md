# Agent review

A maintainer adds the `agent-review` label to a PR. Claude Code reviews it, and `marimo-oss-bot`
posts the findings as a PR review. Repositories call the reusable workflow in
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
- [`run-agent`](run-agent/action.yml) keeps everything about how the agent runs, so a sandboxed
  runner can replace it without changing the jobs around it. A harness with a shell, such as Codex,
  needs that first: anything that runs in the `review` job can read its OIDC request token.
- Instructions come from [`prompts/`](prompts) and the base branch's `REVIEW.md`, `AGENTS.md`, and
  `CLAUDE.md`, so the PR can't change them.
- `start` and `publish` run in the `agent-bot` environment, the only one that can fetch the bot key.
  `review` runs in `agent`, the only one that can fetch model keys.
- Output containing anything shaped like a credential is discarded before upload. It catches tokens
  printed verbatim, not encoded ones.
- [`publish.ts`](steps/publish.ts) picks the review event from live PR state and the repository's
  policy; the agent can't. It recomputes what the diff leaves out (truncation, binary files), so a
  PR padded past what the agent can read is never approved and never lifts the bot's block.
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

## Policy

Repositories set policy as inputs in their caller workflow, which runs from the default branch. The
bot requests changes for findings at or above `block-at-severity` and comments otherwise. With
`allow-approve: true`, it also approves when [`decide.ts`](src/decide.ts) allows; it doesn't check
CI, which branch protection covers. Turn on "dismiss stale approvals" first, so a push after the
bot's approval needs a new one. [`policy.ts`](src/policy.ts) holds the shared defaults, including
paths that always need a human.

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
         # Optional, with their defaults:
         # allow-approve: false
         # model: claude-opus-5-5
         # block-at-severity: high
         # max-changed-lines: 400
         # never-auto-approve: "" # extra globs, one per line
   ```

5. Optionally, add `REVIEW.md` at the repository root with review instructions.

## Development

```sh
cd agent-review
deno task check && deno task test
```
