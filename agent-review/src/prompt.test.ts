import { deepEqual as assertEquals, throws as assertThrows } from "node:assert/strict";
import { renderPrompt } from "./prompt.ts";

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
