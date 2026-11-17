import type { RepositoryRole } from "./policy.ts";
import { repositoryRoles } from "./policy.ts";

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
  readonly base: { readonly sha: string };
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

export interface PullReview {
  readonly id: number;
  readonly user: { readonly login: string } | null;
  readonly state: string;
}

export interface NewReviewComment {
  readonly path: string;
  readonly line: number;
  readonly side: "LEFT" | "RIGHT";
  readonly body: string;
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

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.send(method, path, body);
    return response.status === 204 ? (undefined as T) : (await response.json()) as T;
  }

  async text(path: string, accept: string): Promise<string> {
    return await (await this.send("GET", path, undefined, accept)).text();
  }

  async paginate<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = `${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    while (next) {
      const response = await this.send("GET", next);
      items.push(...(await response.json()) as T[]);
      next = /<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/.exec(
        response.headers.get("link") ?? "",
      )?.[1];
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

  compareDiff(baseSha: string, headSha: string): Promise<string> {
    return this.text(`${this.repo}/compare/${baseSha}...${headSha}`, "application/vnd.github.diff");
  }

  async role(login: string): Promise<RepositoryRole> {
    try {
      const { role_name, permission } = await this.json<{ role_name: string; permission: string }>(
        "GET",
        `${this.repo}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      // A custom role's name is its own; `permission` is the base role it inherits.
      return repositoryRoles.find((role) => role === role_name) ??
        repositoryRoles.find((role) => role === permission) ?? "none";
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

  createReview(
    number: number,
    review: {
      commit_id: string;
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
      comments: readonly NewReviewComment[];
    },
  ): Promise<{ id: number; html_url: string }> {
    return this.json("POST", `${this.repo}/pulls/${number}/reviews`, review);
  }

  dismissReview(number: number, reviewId: number, message: string): Promise<unknown> {
    return this.json("PUT", `${this.repo}/pulls/${number}/reviews/${reviewId}/dismissals`, {
      message,
      event: "DISMISS",
    });
  }

  createComment(number: number, body: string): Promise<{ id: number }> {
    return this.json("POST", `${this.repo}/issues/${number}/comments`, { body });
  }

  updateComment(commentId: number, body: string): Promise<unknown> {
    return this.json("PATCH", `${this.repo}/issues/comments/${commentId}`, { body });
  }

  addReaction(number: number, content: "eyes"): Promise<unknown> {
    return this.json("POST", `${this.repo}/issues/${number}/reactions`, { content });
  }

  async removeLabel(number: number, label: string): Promise<void> {
    try {
      await this.json(
        "DELETE",
        `${this.repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
      );
    } catch (error) {
      if (!(error instanceof GitHubError && error.status === 404)) throw error;
    }
  }
}
