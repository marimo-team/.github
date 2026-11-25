import { severities, type Severity } from "./policy.ts";
import { type JsonObject, type Parsed, parseJsonObject, Reader } from "./reader.ts";

export const diffSides = ["LEFT", "RIGHT"] as const;
export type DiffSide = (typeof diffSides)[number];

export const reviewOutcomes = ["completed", "incomplete"] as const;
export type ReviewOutcome = (typeof reviewOutcomes)[number];

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly side: DiffSide;
  readonly severity: Severity;
  readonly title: string;
  readonly body: string;
}

export interface ReviewResult {
  readonly outcome: ReviewOutcome;
  readonly summary: string;
  readonly coverage: string;
  readonly limitations: readonly string[];
  readonly findings: readonly Finding[];
}

const maxPathLength = 500;

function isRelativeRepositoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= maxPathLength &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..") &&
    !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

// The schema can't state these, so the parser enforces them.
const limits = {
  findings: 30,
  /** More than this many is malformed, not merely verbose. */
  findingsParsed: 500,
  limitations: 30,
  title: 200,
  body: 4_000,
  text: 8_000,
} as const;

/** Bounds live in the parser, which doesn't trust the agent to follow the schema. */
export const reviewResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "summary", "coverage", "limitations", "findings"],
  properties: {
    outcome: {
      type: "string",
      enum: reviewOutcomes,
      description: "incomplete when gaps prevented a meaningful review",
    },
    summary: { type: "string", description: "What the PR does and the overall assessment" },
    coverage: { type: "string", description: "What was examined and how deeply" },
    limitations: {
      type: "array",
      items: { type: "string" },
      description: "Material that could not be examined or verified",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "line", "side", "severity", "title", "body"],
        properties: {
          path: { type: "string", description: "Path relative to the repository root" },
          line: { type: "integer", description: "Line number on the given side of the diff" },
          side: {
            type: "string",
            enum: diffSides,
            description: "RIGHT for added or context lines, LEFT for removed lines",
          },
          severity: { type: "string", enum: severities },
          title: { type: "string" },
          body: { type: "string", description: "Trigger, impact, and evidence" },
        },
      },
    },
  },
} as const;

/**
 * Agents read the PR head under `headDir`, often by absolute path, so their paths can
 * carry the workspace and that directory as prefixes.
 */
export function headPathNormalizer(workspace: string, headDir: string): (path: string) => string {
  const prefixes = [`${workspace}/${headDir}/`, `${workspace}/`, `${headDir}/`];
  return (path) => {
    const relative = path.replace(/^(?:\.\/)+/, "");
    const prefix = prefixes.find((candidate) => relative.startsWith(candidate));
    return prefix ? relative.slice(prefix.length) : relative;
  };
}

function readFinding(
  reader: Reader,
  value: JsonObject,
  at: string,
  normalizePath: (path: string) => string,
): Finding {
  const path = normalizePath(reader.string(value, "path", Infinity, at));
  if (path && !isRelativeRepositoryPath(path)) {
    reader.errors.push(`${at}.path must be a relative repository path`);
  }
  return {
    path,
    line: reader.integer(value, "line", 1, at),
    side: reader.oneOf(value, "side", diffSides, at),
    severity: reader.oneOf(value, "severity", severities, at),
    title: reader.string(value, "title", limits.title, at),
    body: reader.string(value, "body", limits.body, at),
  };
}

/** Keeps the `count` most severe findings, in their original order. */
function mostSevere(findings: readonly Finding[], count: number): Finding[] {
  if (findings.length <= count) return [...findings];
  const rank = (finding: Finding) => severities.indexOf(finding.severity);
  const kept = new Set(
    findings.map((finding, index) => ({ finding, index }))
      .sort((a, b) => rank(b.finding) - rank(a.finding) || a.index - b.index)
      .slice(0, count)
      .map(({ index }) => index),
  );
  return findings.filter((_, index) => kept.has(index));
}

/**
 * Validates and trims the agent's output. Parsing its own output again gives the same
 * result, so a later job can re-validate what an earlier one wrote.
 */
export function parseReviewResult(
  raw: string,
  normalizePath: (path: string) => string = (path) => path,
): Parsed<ReviewResult> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  const reader = new Reader();
  const parsedFindings = reader.array(value, "findings", limits.findingsParsed, "result").flatMap(
    (item, index) => {
      const at = `result.findings[${index}]`;
      const object = reader.object(item, at);
      return object ? [readFinding(reader, object, at, normalizePath)] : [];
    },
  );
  const findings = mostSevere(parsedFindings, limits.findings);
  const omitted = parsedFindings.length - findings.length;
  const omittedNote = omitted ? [`${omitted} lower-severity findings were omitted.`] : [];

  const limitations = reader.array(value, "limitations", Infinity, "result")
    .flatMap((item, index) => {
      if (typeof item === "string" && item.trim() !== "") return [item.slice(0, limits.text)];
      reader.errors.push(`result.limitations[${index}] must be a non-empty string`);
      return [];
    })
    .slice(0, limits.limitations - omittedNote.length);

  return reader.finish({
    outcome: reader.oneOf(value, "outcome", reviewOutcomes, "result"),
    summary: reader.string(value, "summary", limits.text, "result"),
    coverage: reader.string(value, "coverage", limits.text, "result"),
    limitations: [...limitations, ...omittedNote],
    findings,
  });
}
