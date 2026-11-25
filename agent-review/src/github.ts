import { type RepositoryRole, repositoryRoles } from "./policy.ts";
import type { DiffSide } from "./result.ts";

const apiUrl = "https://api.github.com";

export class GitHubError extends Error {
  constructor(readonly status: number, readonly detail: string, message: string) {
    super(message);
  }
}

export interface PullRequest {
  readonly state: "open" | "closed";
  readonly title: string;
  readonly body: string | null;
  readonly user: { readonly login: string };
  readonly head: { readonly sha: string };
}

export interface ComparedFile {
  readonly filename: string;
  readonly previous_filename?: string;
  readonly status: string;
  readonly additions: number;
  readonly deletions: number;
  readonly changes: number;
  readonly patch?: string;
}

export interface Comparison {
  readonly status: "diverged" | "ahead" | "behind" | "identical";
  readonly merge_base_commit: { readonly sha: string };
  readonly files?: readonly ComparedFile[];
}

/** GitHub stops listing files in a comparison at this many. */
export const comparisonFileLimit = 300;

export interface ReviewComment {
  readonly user: { readonly login: string } | null;
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
}

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export interface PullReview {
  readonly id: number;
  readonly user: { readonly login: string } | null;
  readonly state: ReviewState;
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export interface NewReviewComment {
  readonly path: string;
  readonly line: number;
  readonly side: DiffSide;
  readonly body: string;
}

export interface NewReview {
  /** Omit to review the current head. */
  readonly commit_id?: string;
  readonly event: ReviewEvent;
  readonly body: string;
  readonly comments: readonly NewReviewComment[];
}

/** A custom role's name is its own; `permission` is the base role it inherits. */
export function roleFromPermission(roleName: string, permission: string): RepositoryRole {
  return repositoryRoles.find((role) => role === roleName) ??
    repositoryRoles.find((role) => role === permission) ?? "none";
}

/** The API path of the next page, from a `Link` header. */
export function nextPagePath(link: string | null): string | undefined {
  for (const part of (link ?? "").split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match?.[1]?.startsWith(apiUrl)) return match[1].slice(apiUrl.length);
  }
  return undefined;
}

/** A 422 caused by an inline comment's position, rather than the body or the commit. */
export function isAnchoringError(error: unknown): boolean {
  return error instanceof GitHubError && error.status === 422 &&
    /pull_request_review_thread|\bline\b|\bpath\b|\bposition\b/i.test(error.detail);
}

export class GitHubClient {
  constructor(private readonly token: string, readonly repository: string) {}

  private async send(method: string, path: string, body?: unknown, accept?: string) {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Accept: accept ?? "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new GitHubError(
        response.status,
        detail,
        `${method} ${path} failed (${response.status}): ${detail}`,
      );
    }
    return response;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.send(method, path, body)).json()) as T;
  }

  private async noContent(method: string, path: string, body?: unknown): Promise<void> {
    await (await this.send(method, path, body)).body?.cancel();
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = `${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    while (next) {
      const response = await this.send("GET", next);
      items.push(...(await response.json()) as T[]);
      next = nextPagePath(response.headers.get("link"));
    }
    return items;
  }

  private get repo() {
    return `/repos/${this.repository}`;
  }

  pull(number: number): Promise<PullRequest> {
    return this.json("GET", `${this.repo}/pulls/${number}`);
  }

  compare(baseSha: string, headSha: string): Promise<Comparison> {
    return this.json("GET", `${this.repo}/compare/${baseSha}...${headSha}?per_page=1`);
  }

  async compareDiff(baseSha: string, headSha: string): Promise<string> {
    const path = `${this.repo}/compare/${baseSha}...${headSha}`;
    return await (await this.send("GET", path, undefined, "application/vnd.github.diff")).text();
  }

  async role(login: string): Promise<RepositoryRole> {
    try {
      const { role_name, permission } = await this.json<{ role_name: string; permission: string }>(
        "GET",
        `${this.repo}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      return roleFromPermission(role_name, permission);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return "none";
      throw error;
    }
  }

  reviewComments(number: number): Promise<ReviewComment[]> {
    return this.paginate(`${this.repo}/pulls/${number}/comments`);
  }

  reviews(number: number): Promise<PullReview[]> {
    return this.paginate(`${this.repo}/pulls/${number}/reviews`);
  }

  createReview(number: number, review: NewReview): Promise<{ id: number; html_url: string }> {
    return this.json("POST", `${this.repo}/pulls/${number}/reviews`, review);
  }

  dismissReview(number: number, reviewId: number, message: string): Promise<void> {
    return this.noContent("PUT", `${this.repo}/pulls/${number}/reviews/${reviewId}/dismissals`, {
      message,
      event: "DISMISS",
    });
  }

  createComment(number: number, body: string): Promise<{ id: number }> {
    return this.json("POST", `${this.repo}/issues/${number}/comments`, { body });
  }

  updateComment(commentId: number, body: string): Promise<void> {
    return this.noContent("PATCH", `${this.repo}/issues/comments/${commentId}`, { body });
  }

  addReaction(number: number, content: "eyes"): Promise<void> {
    return this.noContent("POST", `${this.repo}/issues/${number}/reactions`, { content });
  }

  async removeLabel(number: number, label: string): Promise<void> {
    try {
      await this.noContent(
        "DELETE",
        `${this.repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
      );
    } catch (error) {
      if (!(error instanceof GitHubError && error.status === 404)) throw error;
    }
  }
}
