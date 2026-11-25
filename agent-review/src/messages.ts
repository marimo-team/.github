import type { Verdict } from "./decide.ts";
import type { ReviewEvent } from "./github.ts";
import type { Finding, ReviewResult } from "./result.ts";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

export interface RunInfo {
  readonly model: string;
  readonly requester: string;
  readonly runUrl: string;
  readonly headSha: string;
}

const verdictNames: Record<Verdict["kind"], string> = {
  approve: "Approve",
  request_changes: "Request changes",
  comment: "Comment",
};

function attribution(run: RunInfo): string {
  return `> 🤖 Automated review by ${run.model} via Claude Code, requested by \`${run.requester}\`.`;
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

function findingHeading(finding: Finding): string {
  return `**${finding.severity.toUpperCase()}** · ${sanitizeMarkdown(finding.title)}`;
}

function findingLine(finding: Finding): string {
  const location = codeSpan(`${finding.path}:${finding.line}`);
  const body = sanitizeMarkdown(finding.body).replaceAll("\n", "\n  ");
  return `- ${findingHeading(finding)} ${location}\n\n  ${body}`;
}

function coverageSection(result: ReviewResult): string {
  const limitations = result.limitations.length
    ? `\n\n**Limitations**\n${
      result.limitations.map((item) => `- ${sanitizeMarkdown(item)}`).join("\n")
    }`
    : "";
  return `<details><summary>Coverage</summary>\n\n${
    sanitizeMarkdown(result.coverage)
  }${limitations}\n\n</details>`;
}

/**
 * Coverage comes last and is the first thing dropped when the body is too long, so
 * truncation never cuts into its collapsible section or drops findings before it.
 */
export function reviewBody(options: {
  readonly run: RunInfo;
  readonly result: ReviewResult;
  readonly verdict: Verdict;
  readonly event: ReviewEvent;
  readonly unanchored: readonly Finding[];
  readonly notes: readonly string[];
}): string {
  const { run, result, verdict, event, unanchored, notes } = options;
  const sections = [
    attribution(run),
    decisionSection(verdict, event),
    sanitizeMarkdown(result.summary),
  ];
  if (unanchored.length) {
    sections.push(`**Findings outside the diff**\n\n${unanchored.map(findingLine).join("\n\n")}`);
  }
  if (notes.length) sections.push(notes.map((note) => `- ${note}`).join("\n"));
  if (result.findings.length === 0) {
    sections.push(
      "No findings within the coverage below. This doesn't establish that the PR is correct.",
    );
  }

  const tooLong = "The review was too long to post in full. The run has the complete result.";
  const withCoverage = [...sections, coverageSection(result)].join("\n\n");
  if (withCoverage.length <= maxBodyLength) return `${withCoverage}\n\n${footer(run)}`;
  const withoutCoverage = sections.join("\n\n");
  if (withoutCoverage.length <= maxBodyLength) {
    return `${withoutCoverage}\n\n${tooLong}\n\n${footer(run)}`;
  }
  return `${withoutCoverage.slice(0, maxBodyLength)}\n\n…\n\n${tooLong}\n\n${footer(run)}`;
}

export function findingComment(finding: Finding): string {
  return `${findingHeading(finding)}\n\n${sanitizeMarkdown(finding.body)}`;
}
