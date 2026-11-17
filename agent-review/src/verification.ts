import { severities, type Severity } from "./policy.ts";
import { type Parsed, parseJsonObject, Reader } from "./reader.ts";
import type { ReviewResult } from "./result.ts";

/** The verifier's judgment of one candidate finding, by its index in the review result. */
export interface FindingCheck {
  readonly index: number;
  readonly confirmed: boolean;
  readonly severity: Severity;
  readonly reason: string;
}

const maxReasonLength = 2_000;

export const verificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      description: "Exactly one check per candidate finding",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "confirmed", "severity", "reason"],
        properties: {
          index: { type: "integer", description: "Index of the candidate" },
          confirmed: { type: "boolean", description: "Whether the defect is real" },
          severity: { type: "string", enum: [...severities] },
          reason: { type: "string", description: "Why, citing path:line" },
        },
      },
    },
  },
} as const;

export function parseVerification(
  raw: string,
  candidateCount: number,
): Parsed<readonly FindingCheck[]> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;

  const reader = new Reader();
  const checks = reader.array(parsed.value, "checks", candidateCount, "verification").flatMap(
    (item, position) => {
      const at = `verification.checks[${position}]`;
      const object = reader.object(item, at);
      if (!object) return [];
      return [{
        index: reader.integer(object, "index", 0, at),
        confirmed: reader.boolean(object, "confirmed", at),
        severity: reader.oneOf(object, "severity", severities, at),
        reason: reader.string(object, "reason", maxReasonLength, at),
      }];
    },
  );
  const indexes = new Set(checks.map((check) => check.index));
  for (let index = 0; index < candidateCount; index++) {
    if (!indexes.has(index)) reader.errors.push(`verification has no check for candidate ${index}`);
  }
  if (indexes.size !== checks.length) reader.errors.push("verification checks a candidate twice");
  return reader.finish(checks);
}

/** Keeps the confirmed findings, at the severity the verifier assigned. */
export function applyVerification(
  result: ReviewResult,
  checks: readonly FindingCheck[],
): { readonly result: ReviewResult; readonly rejected: number } {
  const byIndex = new Map(checks.map((check) => [check.index, check]));
  const findings = result.findings.flatMap((finding, index) => {
    const check = byIndex.get(index);
    return check?.confirmed ? [{ ...finding, severity: check.severity }] : [];
  });
  return { result: { ...result, findings }, rejected: result.findings.length - findings.length };
}
