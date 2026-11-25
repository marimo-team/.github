import { deepEqual } from "node:assert/strict";
import { coverageGaps, maxDiffLength } from "./coverage.ts";
import type { ComparedFile } from "./github.ts";

function file(filename: string, overrides: Partial<ComparedFile> = {}): ComparedFile {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 0,
    changes: 1,
    patch: "@@ -1 +1 @@\n+x",
    ...overrides,
  };
}

Deno.test("a fully diffed change has no gaps", () => {
  deepEqual(
    coverageGaps(
      [file("a.py"), file("b.py", { status: "renamed", changes: 0, patch: undefined })],
      100,
    ),
    [],
  );
});

Deno.test("reports what the diff leaves out", () => {
  deepEqual(coverageGaps([file("a.py")], undefined), ["The full diff was unavailable."]);
  deepEqual(coverageGaps([file("a.py")], maxDiffLength + 1), [
    "The diff is too large to review in full.",
  ]);
  deepEqual(coverageGaps([file("lib.so", { changes: 0, patch: undefined })], 100), [
    "1 file(s) have no textual diff, such as `lib.so`.",
  ]);
  deepEqual(
    coverageGaps(Array.from({ length: 300 }, (_, index) => file(`f${index}.py`)), 100),
    ["Only the first 300 changed files are listed."],
  );
});
