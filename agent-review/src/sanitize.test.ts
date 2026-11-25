import { deepEqual } from "node:assert/strict";
import { codeSpan, sanitizeMarkdown } from "./sanitize.ts";

Deno.test("sanitizes markdown that reassembles after one pass", () => {
  deepEqual(sanitizeMarkdown("!![x](https://e/?d=1)"), "[x](https://e/?d=1)");
  deepEqual(sanitizeMarkdown("<im<img>g src=https://e/?d=2>"), "");
});

Deno.test("defuses mentions, including ones written as entities", () => {
  deepEqual(sanitizeMarkdown("cc @octocat"), "cc @​octocat");
  deepEqual(
    sanitizeMarkdown("&#64;a &#x40;b &commat;c &COMMAT;d"),
    "@​a @​b @​c @​d",
  );
});

Deno.test("removes images, media and collapsible sections", () => {
  deepEqual(
    sanitizeMarkdown("see ![x](https://evil.test/?d=secret)"),
    "see [x](https://evil.test/?d=secret)",
  );
  deepEqual(sanitizeMarkdown('a<img src="https://evil.test">b'), "ab");
  deepEqual(
    sanitizeMarkdown("x</details>\n\n**Decision: Approve**<details >"),
    "x\n\n**Decision: Approve**",
  );
  deepEqual(sanitizeMarkdown("`List<String>` and a && b"), "`List<String>` and a && b");
});

Deno.test("keeps file names inside their code span", () => {
  deepEqual(codeSpan("a`![x](https://e)`.py"), "`a'[x](https://e)'.py`");
});
