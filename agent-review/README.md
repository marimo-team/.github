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
- The instructions come from [`prompts/`](prompts) and the base branch's `REVIEW.md`, `AGENTS.md`,
  and `CLAUDE.md`. The PR can't change the instructions it's reviewed under.
- The bot key's Doppler identity trusts only OIDC tokens whose subject names the `agent-review-bot`
  environment, which only `start` and `publish` run in. The agent jobs run outside it, so a token an
  agent obtained couldn't fetch the bot key.
- The agent's output is discarded if it contains anything shaped like a credential, before it's
  uploaded as an artifact. Codex can run read-only shell commands in a job whose environment holds
  Actions tokens; this catches a token printed verbatim, not an encoded one.
- [`publish.ts`](steps/publish.ts) validates the agent's output and decides what to post using live
  PR state and the repository's policy. The agent can't choose the review event.

## Policy

Each repository sets its policy as inputs in its caller workflow. That workflow runs from the
default branch, so a PR can't change the policy it's reviewed under.

The bot requests changes for findings at or above `block-at-severity` and comments otherwise. With
`allow-approve: true`, it also approves when every condition in [`decide.ts`](src/decide.ts) holds.
It doesn't check CI; branch protection's required checks still gate merging.

[`policy.ts`](src/policy.ts) holds what every repository shares: the paths that always need a human
approval, which `never-auto-approve` adds to, and the minimum author role for approval.

## Adding a repository

1. Install `marimo-oss-bot` on the repository and create the `agent-review` label.
2. Create the `agent-review-bot` environment and restrict its deployment branches to the default
   branch. Otherwise anyone with write access could push a branch whose workflow runs in the
   environment and fetches the bot key. Review jobs still qualify, because `pull_request_target`
   runs on the default branch.
3. Add `repo:marimo-team/<repository>:environment:agent-review-bot` to the subjects the publish
   Doppler identity accepts. On both Doppler identities, also require the `job_workflow_ref` claim
   to match `marimo-team/.github/.github/workflows/agent-review.yml@*`, so no other workflow in the
   repository can fetch these credentials.
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

5. Optionally, add review instructions in `REVIEW.md` at the repository root, the same file
   Anthropic's managed Code Review reads.

## Development

```sh
cd agent-review
deno task check && deno task test
```
