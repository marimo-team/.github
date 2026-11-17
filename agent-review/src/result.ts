import { severities, type Severity } from "./policy.ts";

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
  path: 500,
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

export type ParseResult =
  | { readonly ok: true; readonly result: ReviewResult }
  | { readonly ok: false; readonly errors: readonly string[] };

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRelativeRepositoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= limits.path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..") &&
    !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

class Reader {
  readonly errors: string[] = [];

  string(object: Json, key: string, max: number, at: string): string {
    const value = object[key];
    if (typeof value !== "string" || value.trim() === "") {
      this.errors.push(`${at}.${key} must be a non-empty string`);
      return "";
    }
    if (value.length > max) {
      this.errors.push(`${at}.${key} exceeds ${max} characters`);
    }
    return value;
  }

  oneOf<T extends string>(object: Json, key: string, allowed: readonly [T, ...T[]], at: string): T {
    const value = object[key];
    if (!allowed.includes(value as T)) {
      this.errors.push(`${at}.${key} must be one of ${allowed.join(", ")}`);
      return allowed[0];
    }
    return value as T;
  }

  array(object: Json, key: string, max: number, at: string): unknown[] {
    const value = object[key];
    if (!Array.isArray(value)) {
      this.errors.push(`${at}.${key} must be an array`);
      return [];
    }
    if (value.length > max) {
      this.errors.push(`${at}.${key} has more than ${max} items`);
    }
    return value.slice(0, max);
  }
}

function readFinding(reader: Reader, value: unknown, at: string): Finding | undefined {
  if (!isRecord(value)) {
    reader.errors.push(`${at} must be an object`);
    return undefined;
  }
  const path = reader.string(value, "path", limits.path, at);
  if (path && !isRelativeRepositoryPath(path)) {
    reader.errors.push(`${at}.path must be a relative repository path`);
  }
  const line = value.line;
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    reader.errors.push(`${at}.line must be a positive integer`);
  }
  return {
    path,
    line: typeof line === "number" ? line : 0,
    side: reader.oneOf(value, "side", ["LEFT", "RIGHT"], at),
    severity: reader.oneOf(value, "severity", severities, at),
    title: reader.string(value, "title", limits.title, at),
    body: reader.string(value, "body", limits.body, at),
  };
}

export function parseReviewResult(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["output is not valid JSON"] };
  }
  if (!isRecord(value)) {
    return { ok: false, errors: ["output must be a JSON object"] };
  }

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
  const findings = reader.array(value, "findings", limits.findings, "result").map(
    (item, index) => readFinding(reader, item, `result.findings[${index}]`),
  );
  const result: ReviewResult = {
    outcome: reader.oneOf(value, "outcome", ["completed", "incomplete"], "result"),
    summary: reader.string(value, "summary", limits.text, "result"),
    coverage: reader.string(value, "coverage", limits.text, "result"),
    limitations,
    findings: findings.filter((finding): finding is Finding => finding !== undefined),
  };

  return reader.errors.length ? { ok: false, errors: reader.errors } : { ok: true, result };
}
