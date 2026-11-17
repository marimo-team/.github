import { deepEqual as assertEquals } from "node:assert/strict";
import { instructionFileCandidates } from "./paths.ts";

Deno.test("lists instruction files from the root down to each changed file's directory", () => {
  assertEquals(instructionFileCandidates(["marimo/_server/api/a.py", "marimo/b.py", "c.py"]), [
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

Deno.test("ignores changed paths that escape the repository", () => {
  assertEquals(instructionFileCandidates(["../outside/a.py", "/etc/x"]), [
    "AGENTS.md",
    "CLAUDE.md",
  ]);
});
