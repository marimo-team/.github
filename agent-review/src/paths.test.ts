import { deepEqual as assertEquals } from "node:assert/strict";
import { instructionFileCandidates } from "./paths.ts";

Deno.test("lists instruction files from the root down to each changed file's directory", () => {
  assertEquals(instructionFileCandidates(["marimo/_server/api/a.py", "marimo/b.py", "c.py"], []), [
    "AGENTS.md",
    "CLAUDE.md",
    "marimo/AGENTS.md",
    "marimo/CLAUDE.md",
    "marimo/_server/AGENTS.md",
    "marimo/_server/CLAUDE.md",
    "marimo/_server/api/AGENTS.md",
    "marimo/_server/api/CLAUDE.md",
  ]);
});

Deno.test("ignores paths outside the base branch", () => {
  const root = ["AGENTS.md", "CLAUDE.md"];
  assertEquals(instructionFileCandidates(["../outside/a.py", "/etc/x"], []), root);
  // A PR adding pr-head/src/x.py must not get the head's own src/AGENTS.md listed.
  assertEquals(
    instructionFileCandidates(["pr-head/src/x.py", "work/a"], ["pr-head", "work"]),
    root,
  );
  assertEquals(instructionFileCandidates(["pr-headless/x.py"], ["pr-head"]).length, 4);
});
