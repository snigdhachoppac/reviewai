import "dotenv/config";
import express from "express";
import { webhooks } from "./webhooks/handler.js";
import { reviewQueue } from "./review/queue.js";
import { reviewRouter } from "./review/router.js";
import { db, runMigrations } from "./lib/db.js";

const server = express();
server.use(express.json());

server.post("/api/webhook", async (req, res) => {
  const event = req.headers["x-github-event"];
  const payload = req.body;
  
  console.log(`📥 Webhook received: ${event}`);
  
  if (event === "pull_request" && 
      (payload.action === "opened" || payload.action === "synchronize")) {
    const pr = payload.pull_request;
    const repo = payload.repository;
    console.log(`📥 PR event: ${repo.full_name}#${pr.number} "${pr.title}"`);
    
    await reviewQueue.add("review-pr", {
      provider: "github",
      owner: repo.owner.login,
      repo: repo.name,
      repoFullName: repo.full_name,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body || "",
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      authorLogin: pr.user.login,
      installationId: payload.installation?.id,
    });
  }
  
  res.status(200).send("ok");
});

server.use("/api", reviewRouter);

server.get("/health", async (_, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", ts: Date.now(), db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});

async function start() {
  await runMigrations();
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => console.log(`🚀 ReviewAI listening on :${PORT}`));
}

start();
