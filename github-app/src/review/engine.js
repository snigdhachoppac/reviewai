import Anthropic from "@anthropic-ai/sdk";
import { createProvider } from "../vcs/factory.js";
import { db } from "../lib/db.js";
import { buildReviewPrompt } from "./prompt.js";
import { parseReviewResponse } from "./parser.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runReview(jobData) {
  const { repoFullName, prNumber, prTitle, prBody, headSha, baseSha, authorLogin } = jobData;

  console.log(`🔍 Starting review for ${repoFullName}#${prNumber}`);

  const vcs = createProvider(jobData);

  try { await vcs.postStatusPending(prNumber, headSha); } catch(e) { console.warn("postStatusPending failed:", e.message); }

  const [files, languages] = await Promise.all([
    vcs.getFiles(prNumber),
    vcs.getLanguages(),
  ]);

  console.log(`📁 Got ${files.length} files to review`);

  const recentIssues = await db.query(
    `SELECT file_path, category, suggestion FROM review_comments rc
     JOIN reviews r ON r.id = rc.review_id
     WHERE r.repo_full_name = $1 AND r.created_at > NOW() - INTERVAL '30 days'
     AND rc.file_path = ANY($2) LIMIT 20`,
    [repoFullName, files.map(f => f.filename)]
  );

  const prompt = buildReviewPrompt({ prTitle, prBody, files, languages, recentIssues: recentIssues.rows });

  console.log(`🤖 Calling Claude API...`);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are ReviewAI, an expert code reviewer. Return structured JSON only.`,
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`✅ Claude responded!`);

  const reviewData = parseReviewResponse(message.content[0].text);

  const event = reviewData.comments.some(c => c.severity === "critical") ? "REQUEST_CHANGES"
    : reviewData.overallScore >= 85 && reviewData.comments.length <= 2 ? "APPROVE"
    : "COMMENT";

  const formattedComments = reviewData.comments.map(c => ({ ...c, body: formatComment(c) }));
  const result = { ...reviewData, event, baseSha, comments: formattedComments, summary: formatSummary(reviewData, event) };

  try { await vcs.postReview(prNumber, headSha, result); console.log(`💬 Posted review to GitHub!`); }
  catch(e) { console.error("postReview failed:", e.message); }

  try { await vcs.postStatusComplete(prNumber, headSha, result); }
  catch(e) { console.warn("postStatusComplete failed:", e.message); }

  const { rows: [review] } = await db.query(
    `INSERT INTO reviews (repo_full_name,pr_number,pr_title,author_login,head_sha,overall_score,review_event,summary,provider,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (repo_full_name,pr_number,head_sha) DO UPDATE SET overall_score=EXCLUDED.overall_score RETURNING id`,
    [repoFullName,prNumber,prTitle,authorLogin,headSha,reviewData.overallScore,event,reviewData.summary,jobData.provider||"github"]
  );

  console.log(`💾 Saved review to DB, id=${review?.id}`);
  console.log(`🎉 Review complete! Score: ${reviewData.overallScore}/100, ${reviewData.comments.length} comments`);

  return { reviewId: review?.id, comments: reviewData.comments, score: reviewData.overallScore };
}

function formatComment(c) {
  const icons = { critical:"🔴", warning:"🟡", info:"🔵", suggestion:"💡" };
  let body = `${icons[c.severity]||"💡"} **[${c.category}] ${c.title}**\n\n${c.suggestion}`;
  if (c.codeExample) body += `\n\n**Suggested fix:**\n\`\`\`${c.language||""}\n${c.codeExample}\n\`\`\``;
  body += `\n\n<sub>ReviewAI</sub>`;
  return body;
}

function formatSummary(reviewData, event) {
  const { overallScore, summary, comments } = reviewData;
  const critical = comments.filter(c => c.severity==="critical").length;
  const label = event==="APPROVE"?"✅ Approved":event==="REQUEST_CHANGES"?"🔴 Changes requested":"💬 Reviewed";
  return `## ReviewAI — ${label}\n\n**Quality Score: ${overallScore}/100**\n\n${summary}\n\n| Severity | Count |\n|---|---|\n| 🔴 Critical | ${critical} |\n| Other | ${comments.length-critical} |`;
}
