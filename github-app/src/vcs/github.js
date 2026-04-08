import { Octokit } from "@octokit/rest";
import { VCSProvider } from "./provider.js";

export class GitHubProvider extends VCSProvider {
  constructor({ owner, repo }) {
    super();
    this.owner = owner;
    this.repo = repo;
    this.kit = new Octokit({ auth: process.env.GITHUB_PAT });
  }

  async getFiles(prNumber) {
    const { data } = await this.kit.rest.pulls.listFiles({
      owner: this.owner, repo: this.repo, pull_number: prNumber, per_page: 50,
    });
    return data.map(f => ({ filename: f.filename, additions: f.additions, deletions: f.deletions, changes: f.changes, patch: f.patch || null }));
  }

  async getLanguages() {
    const { data } = await this.kit.rest.repos.listLanguages({ owner: this.owner, repo: this.repo });
    return data;
  }

  async postStatusPending() {}
  async postStatusComplete() {}

  async postReview(prNumber, headSha, result) {
    await this.kit.rest.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      commit_id: headSha,
      event: "COMMENT",
      body: result.summary,
      comments: [],
    });
    console.log(`💬 Posted review summary to GitHub!`);
  }
}
