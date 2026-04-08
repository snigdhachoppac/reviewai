import { Router } from "express";
import crypto from "crypto";
import { reviewQueue } from "../review/queue.js";

export const gitlabRouter = Router();

/**
 * GitLab sends webhooks with a X-Gitlab-Token header for verification.
 * Unlike GitHub's HMAC signature, GitLab just sends the raw secret token.
 */
function verifyGitLabToken(req) {
  const token = req.headers["x-gitlab-token"];
  if (!token || token !== process.env.GITLAB_WEBHOOK_SECRET) {
    throw new Error("Invalid GitLab webhook token");
  }
}

gitlabRouter.post("/webhook/gitlab", express_raw_to_json, async (req, res) => {
  try {
    verifyGitLabToken(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const event = req.headers["x-gitlab-event"];
  const payload = req.body;

  // Only handle Merge Request events
  if (event !== "Merge Request Hook") {
    return res.status(200).json({ skipped: true });
  }

  const { object_attributes: mr, project, user } = payload;

  // Only trigger on open/update actions, not close/merge
  if (!["open", "update", "reopen"].includes(mr.action)) {
    return res.status(200).json({ skipped: true, action: mr.action });
  }

  console.log(`📥 GitLab MR event: ${project.path_with_namespace}!${mr.iid} "${mr.title}"`);

  // Acknowledge the webhook immediately (GitLab has a short timeout)
  res.status(200).json({ queued: true });

  // Queue the review job using the same engine as GitHub
  await reviewQueue.add(
    "review-pr",
    {
      provider: "gitlab",
      repoFullName: project.path_with_namespace,
      projectId: project.id,
      prNumber: mr.iid,               // GitLab calls it "iid" (internal project ID)
      prTitle: mr.title,
      prBody: mr.description || "",
      headSha: mr.last_commit.id,
      baseSha: mr.diff_refs?.base_sha || "",
      authorLogin: user.username,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    }
  );
});

// Middleware to parse JSON body on this route
function express_raw_to_json(req, res, next) {
  if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }
  next();
}
