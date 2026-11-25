import { deepEqual } from "node:assert/strict";
import { GitHubError, isAnchoringError, nextPagePath, roleFromPermission } from "./github.ts";

Deno.test("maps a collaborator's permission to a role, preferring a known role name", () => {
  deepEqual(roleFromPermission("maintain", "write"), "maintain");
  deepEqual(roleFromPermission("release-manager", "write"), "write");
  deepEqual(roleFromPermission("custom", "unknown"), "none");
});

Deno.test("follows only GitHub API next links", () => {
  const link = [
    '<https://api.github.com/repos/o/r/pulls/1/reviews?page=1>; rel="prev"',
    '<https://api.github.com/repos/o/r/pulls/1/reviews?page=3>; rel="next"',
  ].join(", ");
  deepEqual(nextPagePath(link), "/repos/o/r/pulls/1/reviews?page=3");
  deepEqual(nextPagePath('<https://evil.test/x?page=2>; rel="next"'), undefined);
  deepEqual(nextPagePath(null), undefined);
});

Deno.test("recognizes errors caused by an inline comment's position", () => {
  const error = (status: number, detail: string) => new GitHubError(status, detail, detail);
  deepEqual(isAnchoringError(error(422, '{"errors":["Line could not be resolved"]}')), true);
  deepEqual(isAnchoringError(error(422, '{"message":"Body is too long"}')), false);
  deepEqual(isAnchoringError(error(500, "line")), false);
  deepEqual(isAnchoringError(new Error("line")), false);
});
