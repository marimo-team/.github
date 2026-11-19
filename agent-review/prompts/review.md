Review pull request #{{number}} in {{repository}}.

Report defects the PR introduces, such as bugs, security issues, broken contracts, and data loss,
after confirming each against the code and its callers. Skip style, speculation, and findings
already in `{{contextDir}}/previous-findings.json` unless they still apply.

Anchor each finding to a diff line: `RIGHT` with the new line number for added or unchanged lines,
`LEFT` with the old one for removed lines. Paths are relative to the repository root, without the
`{{headDir}}/` prefix. Set `outcome` to `incomplete` if you couldn't review the PR meaningfully.
