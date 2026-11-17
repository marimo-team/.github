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

- The agent can only read files in the workspace. Claude Code gets `Read`, `Grep`, and `Glob` in
  `dontAsk` mode; Codex runs in its read-only sandbox.
- The workspace root is the base branch. The PR head is checked out under `pr-head/` as files to
  read, and nothing executes it.
- The instructions come from [`prompts/`](prompts) and the base branch's `REVIEW.md`. The agent is
  also pointed at the base branch's `AGENTS.md` and `CLAUDE.md` files for the changed paths. The PR
  can't change the instructions it's reviewed under.
- The bot key's Doppler identity trusts only OIDC tokens whose subject names the `agent-review-bot`
  environment, which only `start` and `publish` run in. The agent jobs run outside it, so a token an
  agent obtained couldn't fetch the bot key.
- [`publish.ts`](steps/publish.ts) validates the agent's output and decides what to post using live
  PR state and [`policy.ts`](src/policy.ts). The agent can't choose the review event.

## Policy

[`policy.ts`](src/policy.ts) sets each repository's `authority`:

- `advisory`: always posts a comment, including the decision it would have made.
- `block`: requests changes for findings at or above `blockAtSeverity`.
- `approve`: also approves when every condition in [`decide.ts`](src/decide.ts) holds.

Repositories without an entry get the advisory defaults.

## Adding a repository

1. Install `marimo-oss-bot` on the repository and create the `agent-review` label. Add
   `repo:marimo-team/<repository>:environment:agent-review-bot` to the subjects the publish Doppler
   identity accepts. GitHub creates the environment on the first run; restricting its deployment
   branches to the default branch is a further safeguard.
2. Add a caller workflow:

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
         checks: read
         statuses: read
         id-token: write
       uses: marimo-team/.github/.github/workflows/agent-review.yml@<sha>
       with:
         policy-ref: <sha>
   ```

3. Optionally, add review instructions in `REVIEW.md` at the repository root, the same file
   Anthropic's managed Code Review reads.

## Development

```sh
cd agent-review
deno task check && deno task test
```
