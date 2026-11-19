import { deepEqual as assertEquals } from "node:assert/strict";
import { matchingGlob } from "./glob.ts";

Deno.test("matches path globs", () => {
  const cases: [string, string, boolean][] = [
    [".github/**", ".github/workflows/ci.yml", true],
    [".github/**", "src/.github/x", false],
    ["**/AGENTS.md", "AGENTS.md", true],
    ["**/AGENTS.md", "frontend/src/AGENTS.md", true],
    ["**/AGENTS.md", "AGENTS.md.bak", false],
    ["src/*.py", "src/a.py", true],
    ["src/*.py", "src/sub/a.py", false],
    ["a.b", "axb", false],
    ["file?.ts", "file1.ts", true],
  ];
  for (const [glob, path, expected] of cases) {
    assertEquals(matchingGlob(path, [glob]) !== undefined, expected, `${glob} vs ${path}`);
  }
});
