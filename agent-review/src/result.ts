import { isRelativeRepositoryPath, maxPathLength } from "./paths.ts";
import { severities, type Severity } from "./policy.ts";
import { type JsonObject, type Parsed, parseJsonObject, Reader } from "./reader.ts";

export type DiffSide = "LEFT" | "RIGHT";
export type ReviewOutcome = "completed" | "incomplete";

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

const limits = {
  findings: 30,
  limitations: 30,
  title: 200,
  body: 8_000,
  text: 8_000,
} as const;

/**
 * Kept within the subset both harnesses accept: OpenAI strict mode requires every
 * property to be required and forbids extra keywords, so bounds live in the parser.
 */
export const reviewResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "summary", "coverage", "limitations", "findings"],
  properties: {
    outcome: {
      type: "string",
      enum: ["completed", "incomplete"],
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
            enum: ["LEFT", "RIGHT"],
            description: "RIGHT for added or context lines, LEFT for removed lines",
          },
          severity: { type: "string", enum: [...severities] },
          title: { type: "string" },
          body: { type: "string", description: "Trigger, impact, and evidence" },
        },
      },
    },
  },
} as const;

function readFinding(reader: Reader, value: JsonObject, at: string): Finding {
  const path = reader.string(value, "path", maxPathLength, at);
  if (path && !isRelativeRepositoryPath(path)) {
    reader.errors.push(`${at}.path must be a relative repository path`);
  }
  return {
    path,
    line: reader.integer(value, "line", 1, at),
    side: reader.oneOf(value, "side", ["LEFT", "RIGHT"], at),
    severity: reader.oneOf(value, "severity", severities, at),
    title: reader.string(value, "title", limits.title, at),
    body: reader.string(value, "body", limits.body, at),
  };
}

export function parseReviewResult(raw: string): Parsed<ReviewResult> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  const reader = new Reader();
  const limitations = reader.array(value, "limitations", limits.limitations, "result").map(
    (item, index) => {
      if (typeof item !== "string" || item.trim() === "" || item.length > limits.text) {
        reader.errors.push(`result.limitations[${index}] must be a non-empty string`);
        return "";
      }
      return item;
    },
  );
  const findings = reader.array(value, "findings", limits.findings, "result").flatMap(
    (item, index) => {
      const at = `result.findings[${index}]`;
      const object = reader.object(item, at);
      return object ? [readFinding(reader, object, at)] : [];
    },
  );
  return reader.finish({
    outcome: reader.oneOf(value, "outcome", ["completed", "incomplete"], "result"),
    summary: reader.string(value, "summary", limits.text, "result"),
    coverage: reader.string(value, "coverage", limits.text, "result"),
    limitations,
    findings,
  });
}
