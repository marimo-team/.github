import type { Finding, ReviewResult } from "./result.ts";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

export interface RunInfo {
  readonly model: string;
  readonly requester: string;
  readonly runUrl: string;
  readonly headSha: string;
}

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
  readonly unanchored: readonly Finding[];
  readonly notes: readonly string[];
}): string {
  const { run, result, unanchored, notes } = options;
  const sections = [attribution(run), sanitizeMarkdown(result.summary)];
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
