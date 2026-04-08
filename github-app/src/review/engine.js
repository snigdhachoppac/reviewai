import Anthropic from "@anthropic-ai/sdk";
import { createProvider } from "../vcs/factory.js";
import { db } from "../lib/db.js";
import { buildReviewPrompt } from "./prompt.js";
import { parseReviewResponse } from "./parser.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runReview(jobData) {
  const { repoFullName, prNumber, prTitle, prBody, headSha, baseSha, authorLogin } = jobData;

  const vcs = createProvider(jobData);
  await vcs.postStatusPending(prNumber, headSha);

  const [files, languages] = await Promise.all([
    vcs.getFiles(prNumber),
    vcs.getLanguages(),
  ]);

  const recentIssues = await db.query(
    `SELECT file_path, category, suggestion
     FROM review_comments rc
     JOIN reviews r ON r.id = rc.review_id
     WHERE r.repo_full_name = $1
       AND r.created_at > NOW() - INTERVAL '30 days'
       AND rc.file_path = ANY($2)
     LIMIT 20`,
    [repoFullName, files.map((f) => f.filename)]
  );

  const prompt = buildReviewPrompt({ prTitle, prBody, files, languages, recentIssues: recentIssues.rows });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are ReviewAI, an expert code reviewer. Return structured JSON only — no markdown, no preamble. Focus on security, architecture, performance, and correctness.`,
    messages: [{ role: "user", content: prompt }],
  });

  const reviewData = parseReviewResponse(message.content[0].text);

  const event =
    reviewData.comments.some((c) => c.severity === "critical") ? "REQUEST_CHANGES"
    : reviewData.overallScore >= 85 && reviewData.comments.length <= 2 ? "APPROVE"
    : "COMMENT";

  const formattedComments = reviewData.comments.map((c) => ({
    ...c,
    body: formatComment(c),
  }));

  const result = { ...reviewData, event, baseSha, comments: formattedComments,
    summary: formatReviewSummary(reviewData, event) };

  await vcs.postReview(prNumber, headSha, result);
  await vcs.postStatusComplete(prNumber, headSha, result);

  const { rows: [review] } = await db.query(
    `INSERT INTO reviews (repo_full_name,pr_number,pr_title,author_login,head_sha,overall_score,review_event,summary,provider,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (repo_full_name,pr_number,head_sha) DO UPDATE SET overall_score=EXCLUDED.overall_score,summary=EXCLUDED.summary
     RETURNING id`,
    [repoFullName,prNumber,prTitle,authorLogin,headSha,reviewData.overallScore,event,reviewData.summary,jobData.provider||"github"]
  );

  if (review && reviewData.comments.length > 0) {
    const vals = [];
    const ph = reviewData.comments.map((c, i) => {
      const b = i * 8;
      vals.push(review.id, c.filePath, c.line??null, c.category, c.severity, c.title, c.suggestion, c.codeExample??null);
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
    }).join(",");
    await db.query(`INSERT INTO review_comments (review_id,file_path,line_number,category,severity,title,suggestion,code_example) VALUES ${ph}`, vals);
  }

  return { reviewId: review?.id, comments: reviewData.comments, score: reviewData.overallScore, provider: jobData.provider };
}

function formatComment(c) {
  const icons = { critical:"🔴", warning:"🟡", info:"🔵", suggestion:"💡" };
  let body = `${icons[c.severity]||"💡"} **[${c.category}] ${c.title}**\n\n${c.suggestion}`;
  if (c.codeExample) body += `\n\n**Suggested fix:**\n\`\`\`${c.language||""}\n${c.codeExample}\n\`\`\``;
  if (c.references?.length) body += `\n\n*Refs: ${c.references.join(", ")}*`;
  body += `\n\n<sub>ReviewAI · [Dashboard](${process.env.DASHBOARD_URL})</sub>`;
  return body;
}

function formatReviewSummary(reviewData, event) {
  const { overallScore, summary, comments } = reviewData;
  const critical = comments.filter(c => c.severity==="critical").length;
  const warnings  = comments.filter(c => c.severity==="warning").length;
  const label = event==="APPROVE"?"✅ Approved":event==="REQUEST_CHANGES"?"🔴 Changes requested":"💬 Reviewed";
  return `## ReviewAI — ${label}\n\n**Quality Score: ${overallScore}/100**\n\n${summary}\n\n| Severity | Count |\n|---|---|\n| 🔴 Critical | ${critical} |\n| 🟡 Warning | ${warnings} |\n| 🔵 Info/Suggestion | ${comments.length-critical-warnings} |\n\n<sub>Powered by [ReviewAI](${process.env.DASHBOARD_URL})</sub>`;
}
