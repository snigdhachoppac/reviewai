import { App } from "@octokit/app";
import { VCSProvider } from "./provider.js";

const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"),
  webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET },
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
});

export class GitHubProvider extends VCSProvider {
  constructor({ owner, repo, installationId }) {
    super();
    this.owner = owner;
    this.repo = repo;
    this.installationId = installationId;
    this._octokit = null;
  }

  async octokit() {
    if (!this._octokit) {
      this._octokit = await githubApp.getInstallationOctokit(this.installationId);
    }
    return this._octokit;
  }

  async getFiles(prNumber) {
    const kit = await this.octokit();
    const { data: files } = await kit.rest.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 50,
    });

    return files.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch || null,
    }));
  }

  async getLanguages() {
    const kit = await this.octokit();
    const { data } = await kit.rest.repos.listLanguages({
      owner: this.owner,
      repo: this.repo,
    });
    return data;
  }

  async postStatusPending(prNumber, headSha) {
    const kit = await this.octokit();
    await kit.rest.checks.create({
      owner: this.owner,
      repo: this.repo,
      name: "ReviewAI",
      head_sha: headSha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: {
        title: "AI review in progress...",
        summary: "ReviewAI is analysing your changes.",
      },
    });
  }

  async postStatusComplete(prNumber, headSha, result) {
    const kit = await this.octokit();
    const conclusion =
      result.event === "REQUEST_CHANGES" ? "failure" : "success";

    await kit.rest.checks.create({
      owner: this.owner,
      repo: this.repo,
      name: "ReviewAI",
      head_sha: headSha,
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title: `Score: ${result.overallScore}/100 · ${result.comments.length} issues`,
        summary: result.summary,
        annotations: result.comments.slice(0, 50).map((c) => ({
          path: c.filePath,
          start_line: c.line || 1,
          end_line: c.line || 1,
          annotation_level:
            c.severity === "critical" ? "failure"
            : c.severity === "warning" ? "warning"
            : "notice",
          message: c.suggestion,
          title: `[${c.category}] ${c.title}`,
        })),
      },
    });
  }

  async postReview(prNumber, headSha, result) {
    const kit = await this.octokit();

    const comments = result.comments
      .filter((c) => c.line)
      .map((c) => ({
        path: c.filePath,
        line: c.line,
        body: c.body,
      }));

    await kit.rest.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      commit_id: headSha,
      event: result.event,
      body: result.summary,
      comments,
    });
  }
}
