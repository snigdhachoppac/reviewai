#!/usr/bin/env node
/**
 * Stage 1: Data Collection
 *
 * Scrapes merged PRs from high-quality open source repos and extracts
 * review comments that were acknowledged by the author (replied to with
 * "fixed", "done", "good catch", etc. — a signal the comment was useful).
 *
 * Output: JSONL where each line is a raw training example:
 * {
 *   repo, prNumber, prTitle, filePath, patch,
 *   reviewComment, authorAck, reactions, commentAuthorFollowers
 * }
 *
 * Usage:
 *   node collect.js --repos rails/rails,facebook/react --output data/raw.jsonl
 *   node collect.js --repos rails/rails --max-prs 500 --output data/raw.jsonl
 */

import { Octokit } from "@octokit/rest";
import { createWriteStream } from "fs";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    repos:   { type: "string" },
    output:  { type: "string", default: "data/raw.jsonl" },
    "max-prs": { type: "string", default: "200" },
    "min-reactions": { type: "string", default: "1" },
  },
});

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

// Signals that an author acknowledged a review comment as useful
const ACK_PATTERNS = [
  /\b(fixed|done|good catch|great catch|you're right|updated|addressed|thanks|ty)\b/i,
  /\b(will fix|fixing|fixed in|sorted|adjusted|corrected|resolved)\b/i,
];

const SKIP_PATTERNS = [
  /\bnit\b/i,                    // Skip pure nits
  /^lgtm\.?$/i,                  // Skip "LGTM"
  /^(looks good|nice work)\.?$/i,
  /.{5,}/,                       // Require at least 5 chars (inverted — skip very short)
].slice(0, 2); // Only use nit/lgtm skips; length check is separate

async function collectRepo(owner, repo, maxPrs) {
  console.log(`\n📦 Collecting from ${owner}/${repo}...`);
  const examples = [];

  // Only look at merged PRs (higher signal — they passed review)
  let page = 1;
  let collected = 0;

  while (collected < maxPrs) {
    const { data: prs } = await octokit.rest.pulls.list({
      owner, repo, state: "closed", sort: "updated",
      direction: "desc", per_page: 50, page,
    });

    if (prs.length === 0) break;
    const merged = prs.filter((p) => p.merged_at);

    for (const pr of merged) {
      if (collected >= maxPrs) break;

      try {
        const [filesRes, commentsRes] = await Promise.all([
          octokit.rest.pulls.listFiles({ owner, repo, pull_number: pr.number, per_page: 30 }),
          octokit.rest.pulls.listReviewComments({ owner, repo, pull_number: pr.number, per_page: 100 }),
        ]);

        const files = filesRes.data;
        const reviewComments = commentsRes.data;

        for (const comment of reviewComments) {
          // Skip bot comments
          if (comment.user.type === "Bot") continue;
          // Skip very short comments (likely "+1" or emoji)
          if (comment.body.trim().length < 30) continue;
          // Skip pure nits
          if (/^\s*nit[:\s]/i.test(comment.body)) continue;

          // Find the file this comment is on
          const file = files.find((f) => f.filename === comment.path);
          if (!file?.patch) continue;

          // Check if the PR author replied acknowledging the comment
          const replies = reviewComments.filter(
            (r) => r.in_reply_to_id === comment.id
              && r.user.login === pr.user.login
          );

          const authorAck = replies.some((r) =>
            ACK_PATTERNS.some((p) => p.test(r.body))
          );

          const reactions = comment.reactions?.total_count || 0;

          examples.push({
            repo: `${owner}/${repo}`,
            prNumber: pr.number,
            prTitle: pr.title,
            prBody: (pr.body || "").slice(0, 500),
            filePath: comment.path,
            patch: file.patch.slice(0, 2000),
            reviewComment: comment.body,
            commentLine: comment.line,
            authorAck,
            reactions,
            commentAuthorAssociation: comment.author_association,
            createdAt: comment.created_at,
          });
        }

        collected++;
        if (collected % 25 === 0) {
          console.log(`  ${owner}/${repo}: ${collected}/${maxPrs} PRs, ${examples.length} examples so far`);
        }

        // Rate limit: GitHub allows 5000 req/hr with auth
        await sleep(200);
      } catch (err) {
        console.warn(`  Skipping PR #${pr.number}: ${err.message}`);
      }
    }

    page++;
  }

  return examples;
}

async function main() {
  const repos = args.repos?.split(",").map((r) => r.trim()) || [];
  const maxPrs = parseInt(args["max-prs"]);

  if (repos.length === 0) {
    console.error("--repos is required. Example: --repos rails/rails,facebook/react");
    process.exit(1);
  }

  const out = createWriteStream(args.output, { flags: "w" });
  let total = 0;

  for (const repoPath of repos) {
    const [owner, repo] = repoPath.split("/");
    const examples = await collectRepo(owner, repo, maxPrs);

    for (const ex of examples) {
      out.write(JSON.stringify(ex) + "\n");
    }
    total += examples.length;
    console.log(`✅ ${repoPath}: ${examples.length} examples collected`);
  }

  out.end();
  console.log(`\n🎉 Total: ${total} raw examples written to ${args.output}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => { console.error(err); process.exit(1); });
