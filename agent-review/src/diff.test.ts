import { deepEqual } from "node:assert/strict";
import { anchorFindings, commentableLines } from "./diff.ts";
import type { Finding } from "./result.ts";

const patch = [
  "@@ -10,3 +10,4 @@ def f():",
  " keep",
  "-old",
  "+new",
  "+added",
  "@@ -40,1 +41,1 @@",
  "-gone",
  "\\ No newline at end of file",
  "+here",
].join("\n");

Deno.test("maps hunks to commentable lines on each side", () => {
  const lines = commentableLines(patch);
  deepEqual([...lines.LEFT], [10, 11, 40]);
  deepEqual([...lines.RIGHT], [10, 11, 12, 41]);
});

Deno.test("moves findings outside the diff into the body", () => {
  const at = (path: string, side: Finding["side"], line: number): Finding => ({
    path,
    side,
    line,
    severity: "low",
    title: "t",
    body: "b",
  });
  const { inline, unanchored } = anchorFindings(
    [
      at("a.py", "RIGHT", 12),
      at("a.py", "RIGHT", 13),
      at("a.py", "LEFT", 12),
      at("b.py", "RIGHT", 1),
    ],
    new Map([["a.py", patch]]),
  );
  deepEqual(inline.map((finding) => finding.line), [12]);
  deepEqual(unanchored.map((finding) => [finding.path, finding.side, finding.line]), [
    ["a.py", "RIGHT", 13],
    ["a.py", "LEFT", 12],
    ["b.py", "RIGHT", 1],
  ]);
});
