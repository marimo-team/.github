import type { ReviewEvent, Verdict } from "./decide.ts";
import type { Harness } from "./policy.ts";
import type { Finding, ReviewResult } from "./result.ts";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

export interface RunInfo {
  readonly harness: Harness;
  readonly model?: string;
  readonly requester: string;
  readonly runUrl: string;
  readonly headSha: string;
}

const harnessNames: Record<Harness, string> = { claude: "Claude Code", codex: "Codex" };
const verdictNames: Record<Verdict["kind"], string> = {
  approve: "Approve",
  request_changes: "Request changes",
  comment: "Comment",
};

function attribution(run: RunInfo): string {
  const agent = run.model
    ? `${run.model} via ${harnessNames[run.harness]}`
    : harnessNames[run.harness];
  return `> 🤖 Automated review by ${agent}, requested by \`${run.requester}\`.`;
}

// GitHub rejects review bodies over 65,536 characters.
const maxBodyLength = 60_000;

function footer(run: RunInfo): string {
  return `Reviewed \`${run.headSha}\` · [Run](${run.runUrl})`;
}

export function progressBody(run: RunInfo, status: string): string {
  return `${attribution(run)}\n\n${status}\n\n${footer(run)}`;
}

function decisionSection(verdict: Verdict, event: ReviewEvent): string {
  const approvalWithheld = verdict.kind === "approve" && event !== "APPROVE";
  const heading = approvalWithheld
    ? "**Proposed decision: Approve** (this repository doesn't allow the bot to approve)"
    : `**Decision: ${verdictNames[verdict.kind]}**`;
  // Reasons can quote changed file names, which the PR author controls.
  const reasons = verdict.kind === "request_changes"
    ? verdict.blocking.map((finding) => `${finding.severity}: ${finding.title}`)
    : verdict.kind === "comment"
    ? verdict.reasons
    : [];
  return [heading, ...reasons.map((reason) => `- ${sanitizeMarkdown(reason)}`)].join("\n");
}

function findingLine(finding: Finding): string {
  return `- **${finding.severity.toUpperCase()}** ${codeSpan(`${finding.path}:${finding.line}`)} ${
    sanitizeMarkdown(finding.title)
  }\n\n  ${sanitizeMarkdown(finding.body).replaceAll("\n", "\n  ")}`;
}

export function reviewBody(options: {
  readonly run: RunInfo;
  readonly result: ReviewResult;
  readonly verdict: Verdict;
  readonly event: ReviewEvent;
  readonly unanchored: readonly Finding[];
  readonly notes: readonly string[];
}): string {
  const { run, result, verdict, event, unanchored, notes } = options;
  const limitations = result.limitations.length
    ? `\n\n**Limitations**\n${
      result.limitations.map((item) => `- ${sanitizeMarkdown(item)}`).join("\n")
    }`
    : "";
  const sections = [
    attribution(run),
    decisionSection(verdict, event),
    sanitizeMarkdown(result.summary),
    `<details><summary>Coverage</summary>\n\n${
      sanitizeMarkdown(result.coverage)
    }${limitations}\n\n</details>`,
  ];
  if (unanchored.length) {
    sections.push(`**Findings outside the diff**\n\n${unanchored.map(findingLine).join("\n\n")}`);
  }
  if (notes.length) sections.push(notes.map((note) => `- ${note}`).join("\n"));
  if (result.findings.length === 0) {
    sections.push(
      "No findings within the coverage above. This doesn't establish that the PR is correct.",
    );
  }
  const body = sections.join("\n\n");
  if (body.length <= maxBodyLength) return `${body}\n\n${footer(run)}`;
  return `${
    body.slice(0, maxBodyLength)
  }\n\n…\n\nThe review was too long to post in full. The run has the complete result.\n\n${
    footer(run)
  }`;
}

export function findingComment(finding: Finding): string {
  return `**${finding.severity.toUpperCase()}** · ${sanitizeMarkdown(finding.title)}\n\n${
    sanitizeMarkdown(finding.body)
  }`;
}
