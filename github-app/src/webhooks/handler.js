import { App, createNodeMiddleware } from "@octokit/app";
import { Webhooks } from "@octokit/webhooks";
import { reviewQueue } from "../review/queue.js";

// GitHub App setup
export const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"),
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  oauth: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
});

export const webhooks = app.webhooks;

// Fired when a PR is opened or new commits are pushed
webhooks.on(
  ["pull_request.opened", "pull_request.synchronize"],
  async ({ payload, octokit }) => {
    const { pull_request: pr, repository, installation } = payload;

    console.log(
      `📥 PR event: ${repository.full_name}#${pr.number} "${pr.title}"`
    );

    // Post a "review in progress" status immediately for UX
    await octokit.rest.checks.create({
      owner: repository.owner.login,
      repo: repository.name,
      name: "ReviewAI",
      head_sha: pr.head.sha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: {
        title: "AI review in progress...",
        summary: "ReviewAI is analysing your changes for security issues, architectural concerns, and performance improvements.",
      },
    });

    // Queue the actual review work (async - can take 10-60s for large PRs)
    await reviewQueue.add(
      "review-pr",
      {
        owner: repository.owner.login,
        repo: repository.name,
        prNumber: pr.number,
        prTitle: pr.title,
        prBody: pr.body || "",
        headSha: pr.head.sha,
        baseSha: pr.base.sha,
        authorLogin: pr.user.login,
        installationId: installation.id,
        repoFullName: repository.full_name,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
  }
);

// When a PR is closed/merged, update metrics
webhooks.on("pull_request.closed", async ({ payload }) => {
  const { pull_request: pr, repository } = payload;
  console.log(
    `🔒 PR closed: ${repository.full_name}#${pr.number} merged=${pr.merged}`
  );
  // Could trigger final quality score computation here
});

webhooks.onError((error) => {
  console.error("Webhook error:", error);
});
