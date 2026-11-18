# Agent review

A maintainer adds the `agent-review` label to a PR. Claude Code or Codex reviews it, a second run of
the same agent checks each finding against the code, and `marimo-oss-bot` posts the confirmed
findings as a PR review. Repositories call the reusable workflow in
[`.github/workflows/agent-review.yml`](../.github/workflows/agent-review.yml).

## Trust boundaries

| Job       | GitHub access                   | Credentials       | Untrusted input       |
| --------- | ------------------------------- | ----------------- | --------------------- |
| `start`   | read; bot token for one comment | bot key           | none                  |
| `review`  | read only                       | model credentials | the PR, via the agent |
| `verify`  | read only                       | model credentials | the PR, via the agent |
| `publish` | read; bot token for the review  | bot key           | the agent's output    |

- Claude Code gets only `Read`, `Grep`, and `Glob`, confined to the workspace. Codex runs in its
  read-only sandbox, which can read the whole runner and run scripts, but can't write or reach the
  network. No workflow step executes the PR head, which is checked out under `pr-head/`.
- Instructions come from [`prompts/`](prompts) and the base branch's `REVIEW.md`, `AGENTS.md`, and
  `CLAUDE.md`, so the PR can't change them.
- `start` and `publish` run in the `agent-bot` environment, the only one that can fetch the bot
  key. `review` and `verify` run in `agent`, the only one that can fetch model keys.
- Output containing anything shaped like a credential is discarded before upload. It catches tokens
  printed verbatim, not encoded ones.
- [`publish.ts`](steps/publish.ts) picks the review event from live PR state and the repository's
  policy; the agent can't.

## Policy

Repositories set policy as inputs in their caller workflow, which runs from the default branch. The
bot requests changes for findings at or above `block-at-severity` and comments otherwise. With
`allow-approve: true`, it also approves when [`decide.ts`](src/decide.ts) allows; it doesn't check
CI, which branch protection covers. Turn on "dismiss stale approvals" first, so a push after the
bot's approval needs a new one. [`policy.ts`](src/policy.ts) holds the shared defaults, including
paths that always need a human.

## Adding a repository

1. Install `marimo-oss-bot` and create the `agent-review` label.
2. Create the `agent` and `agent-bot` environments and restrict both to the default
   branch, before Doppler trusts them. Otherwise a workflow on another branch could create or use
   them and fetch the keys.
3. In Doppler, add `repo:marimo-team/<repository>:environment:agent` to the agent identity's
   subjects and `…:environment:agent-bot` to the bot identity's. On both, also require
   `repository_owner` `marimo-team`, `ref` `refs/heads/<default branch>`, and `job_workflow_ref`
   `marimo-team/.github/.github/workflows/agent-*.yml@*`.
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
         # harness: claude
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
