import "dotenv/config";
import express from "express";
import { createNodeMiddleware } from "@octokit/webhooks";
import { webhooks } from "./webhooks/handler.js";
import { gitlabRouter } from "./webhooks/gitlab.js";
import { reviewRouter } from "./review/router.js";
import { db, runMigrations } from "./lib/db.js";
import { rateLimiter, secureHeaders, requireApiKey, requestLogger, errorHandler } from "./middleware/security.js";

const server = express();

server.use(requestLogger);
server.use(secureHeaders);

// GitHub webhook — needs raw body for HMAC verification
server.use("/api/webhook", express.raw({ type: "application/json" }),
  createNodeMiddleware(webhooks, { path: "/api/webhook" }));

// GitLab webhook
server.use("/api/webhook", express.raw({ type: "application/json" }), gitlabRouter);

// Dashboard API
server.use(express.json());
server.use("/api", rateLimiter, requireApiKey, reviewRouter);

// Health check
server.get("/health", async (_, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", ts: Date.now(), db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "unavailable" });
  }
});

server.use(errorHandler);

async function start() {
  try {
    await runMigrations();
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🚀 ReviewAI listening on :${PORT}`);
      console.log(`   GitHub webhook : POST /api/webhook`);
      console.log(`   GitLab webhook : POST /api/webhook/gitlab`);
      console.log(`   Dashboard API  : GET  /api/metrics`);
      console.log(`   Health check   : GET  /health`);
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();
