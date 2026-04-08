import { Router } from "express";
import { db } from "../lib/db.js";

export const reviewRouter = Router();

// Dashboard metrics overview
reviewRouter.get("/metrics", async (req, res) => {
  try {
    const { repo, days = 30 } = req.query;
    const repoFilter = repo ? "AND r.repo_full_name = $2" : "";
    const params = repo ? [days, repo] : [days];

    const { rows } = await db.query(
      `SELECT
        COUNT(DISTINCT r.id)::int AS total_reviews,
        COUNT(rc.id)::int AS total_issues,
        COUNT(rc.id) FILTER (WHERE rc.category = 'security')::int AS security_issues,
        COUNT(rc.id) FILTER (WHERE rc.category = 'architecture')::int AS arch_issues,
        COUNT(rc.id) FILTER (WHERE rc.category = 'performance')::int AS perf_issues,
        COUNT(rc.id) FILTER (WHERE rc.category = 'style')::int AS style_issues,
        ROUND(AVG(r.overall_score))::int AS avg_score,
        COUNT(rc.id) FILTER (WHERE rc.severity = 'critical')::int AS critical_count
       FROM reviews r
       LEFT JOIN review_comments rc ON rc.review_id = r.id
       WHERE r.created_at > NOW() - ($1 || ' days')::INTERVAL
       ${repoFilter}`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// Recent PRs with review data
reviewRouter.get("/prs", async (req, res) => {
  try {
    const { repo, limit = 20, offset = 0 } = req.query;
    const params = [limit, offset];
    const repoFilter = repo ? `AND r.repo_full_name = $3` : "";
    if (repo) params.push(repo);

    const { rows } = await db.query(
      `SELECT
        r.id, r.repo_full_name, r.pr_number, r.pr_title,
        r.author_login, r.overall_score, r.review_event,
        r.summary, r.created_at,
        COUNT(rc.id)::int AS issue_count,
        COUNT(rc.id) FILTER (WHERE rc.severity = 'critical')::int AS critical_count,
        ARRAY_AGG(DISTINCT rc.category) FILTER (WHERE rc.id IS NOT NULL) AS categories
       FROM reviews r
       LEFT JOIN review_comments rc ON rc.review_id = r.id
       ${repo ? "WHERE r.repo_full_name = $3" : ""}
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch PRs" });
  }
});

// Single PR review detail
reviewRouter.get("/prs/:id/comments", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rc.*, r.pr_title, r.repo_full_name, r.author_login, r.overall_score
       FROM review_comments rc
       JOIN reviews r ON r.id = rc.review_id
       WHERE rc.review_id = $1
       ORDER BY rc.severity DESC, rc.category`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Quality trend over time (for sparklines)
reviewRouter.get("/trend", async (req, res) => {
  try {
    const { repo, days = 30 } = req.query;
    const params = repo ? [days, repo] : [days];
    const repoFilter = repo ? "AND repo_full_name = $2" : "";

    const { rows } = await db.query(
      `SELECT
        DATE_TRUNC('day', created_at) AS day,
        ROUND(AVG(overall_score))::int AS avg_score,
        COUNT(*)::int AS pr_count
       FROM reviews
       WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
       ${repoFilter}
       GROUP BY 1
       ORDER BY 1`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trend" });
  }
});

// Top recurring issues (useful for engineering leads)
reviewRouter.get("/top-issues", async (req, res) => {
  try {
    const { repo, days = 30 } = req.query;
    const params = repo ? [days, repo] : [days];
    const repoFilter = repo ? "AND r.repo_full_name = $2" : "";

    const { rows } = await db.query(
      `SELECT rc.title, rc.category, rc.severity, COUNT(*)::int AS occurrences
       FROM review_comments rc
       JOIN reviews r ON r.id = rc.review_id
       WHERE r.created_at > NOW() - ($1 || ' days')::INTERVAL
       ${repoFilter}
       GROUP BY rc.title, rc.category, rc.severity
       ORDER BY occurrences DESC
       LIMIT 10`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top issues" });
  }
});
