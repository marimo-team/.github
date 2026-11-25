import { deepEqual, throws } from "node:assert/strict";
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
  deepEqual(
    prompt,
    "Review #7.\n\nRead pr-head/.\n\n## Review instructions\n\nCheck the kernel.\n",
  );
  deepEqual(renderPrompt(["x"], variables, "  \n"), "x\n");
  throws(() => renderPrompt(["{{missing}}"], variables, undefined));
});
