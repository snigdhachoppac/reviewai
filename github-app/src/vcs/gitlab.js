import { VCSProvider } from "./provider.js";

const GITLAB_URL = process.env.GITLAB_URL || "https://gitlab.com";

/**
 * GitLab Merge Request provider.
 * Uses GitLab's REST API v4 with a project access token.
 * Handles both gitlab.com and self-hosted GitLab instances.
 */
export class GitLabProvider extends VCSProvider {
  constructor({ projectId, projectPath }) {
    super();
    this.projectId = projectId;
    this.projectPath = projectPath; // "namespace/repo" — used for display
    this.token = process.env.GITLAB_TOKEN;
    this.baseUrl = `${GITLAB_URL}/api/v4`;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "PRIVATE-TOKEN": this.token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitLab API error ${res.status} on ${path}: ${body}`);
    }

    return res.json();
  }

  async getFiles(mrIid) {
    // GitLab returns the diff for an MR via /changes
    const mr = await this._fetch(
      `/projects/${this.projectId}/merge_requests/${mrIid}/changes`
    );

    return (mr.changes || []).map((f) => ({
      filename: f.new_path,
      additions: (f.diff.match(/^\+/gm) || []).length,
      deletions: (f.diff.match(/^-/gm) || []).length,
      changes: f.diff.split("\n").length,
      patch: f.diff || null,
    }));
  }

  async getLanguages() {
    // GitLab provides language stats per project
    const langs = await this._fetch(`/projects/${this.projectId}/languages`);
    // Convert percentages to a byte-count-like map the prompt builder expects
    const total = 1000000;
    return Object.fromEntries(
      Object.entries(langs).map(([lang, pct]) => [lang, Math.round((pct / 100) * total)])
    );
  }

  async postStatusPending(mrIid, headSha) {
    // GitLab uses "commit statuses" for external CI-style checks
    await this._fetch(`/projects/${this.projectId}/statuses/${headSha}`, {
      method: "POST",
      body: JSON.stringify({
        state: "running",
        name: "ReviewAI",
        description: "AI review in progress...",
        target_url: `${process.env.DASHBOARD_URL}/pr/${mrIid}`,
      }),
    });
  }

  async postStatusComplete(mrIid, headSha, result) {
    const state = result.event === "REQUEST_CHANGES" ? "failed" : "success";
    await this._fetch(`/projects/${this.projectId}/statuses/${headSha}`, {
      method: "POST",
      body: JSON.stringify({
        state,
        name: "ReviewAI",
        description: `Score: ${result.overallScore}/100 · ${result.comments.length} issues`,
        target_url: `${process.env.DASHBOARD_URL}/pr/${mrIid}`,
      }),
    });
  }

  async postReview(mrIid, headSha, result) {
    // 1. Post a top-level MR note with the summary
    await this._fetch(
      `/projects/${this.projectId}/merge_requests/${mrIid}/notes`,
      {
        method: "POST",
        body: JSON.stringify({ body: result.summary }),
      }
    );

    // 2. Post inline diff notes for each comment that has a line number
    const inlineComments = result.comments.filter((c) => c.line && c.filePath);

    for (const comment of inlineComments) {
      try {
        await this._fetch(
          `/projects/${this.projectId}/merge_requests/${mrIid}/discussions`,
          {
            method: "POST",
            body: JSON.stringify({
              body: comment.body,
              position: {
                position_type: "text",
                base_sha: result.baseSha,
                start_sha: result.baseSha,
                head_sha: headSha,
                new_path: comment.filePath,
                new_line: comment.line,
              },
            }),
          }
        );
      } catch (err) {
        // Inline comments can fail if the line doesn't exist in the diff.
        // Fall back to posting as a regular MR note rather than dropping it.
        console.warn(`Inline comment failed for ${comment.filePath}:${comment.line}, posting as note`);
        await this._fetch(
          `/projects/${this.projectId}/merge_requests/${mrIid}/notes`,
          {
            method: "POST",
            body: JSON.stringify({
              body: `**${comment.filePath}:${comment.line}**\n\n${comment.body}`,
            }),
          }
        );
      }
    }
  }
}
