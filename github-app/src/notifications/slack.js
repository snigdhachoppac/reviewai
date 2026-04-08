/**
 * Slack Notification Service
 *
 * Sends rich Block Kit messages to Slack when:
 *   - A critical security issue is found in a PR
 *   - A PR is approved automatically (score >= 85)
 *   - A repo's average quality score drops below the threshold
 *
 * Requires SLACK_WEBHOOK_URL in .env (Incoming Webhook from Slack App config).
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SCORE_DROP_THRESHOLD = parseInt(process.env.SLACK_SCORE_THRESHOLD || "70");

// Colour sidebar: Slack uses hex colours
const COLOURS = {
  critical: "#E24B4A",
  warning:  "#FBBF24",
  approved: "#3ECF8E",
  info:     "#60A5FA",
};

async function postToSlack(payload) {
  if (!SLACK_WEBHOOK_URL) return; // Silently skip if not configured

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Slack notification failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Slack notification error:", err.message);
  }
}

/**
 * Notify when critical security issues are found in a PR.
 */
export async function notifyCriticalIssues({ repoFullName, prNumber, prTitle, authorLogin, score, criticalComments, dashboardUrl }) {
  if (!criticalComments?.length) return;

  const issueList = criticalComments.slice(0, 3).map((c) =>
    `• *${c.title}* in \`${c.filePath}\`${c.line ? `:${c.line}` : ""}\n  ${c.suggestion.slice(0, 120)}${c.suggestion.length > 120 ? "…" : ""}`
  ).join("\n\n");

  await postToSlack({
    attachments: [{
      color: COLOURS.critical,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔴 *Critical issues found in PR*\n*<https://github.com/${repoFullName}/pull/${prNumber}|${repoFullName}#${prNumber}: ${prTitle}>*`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Author*\n${authorLogin}` },
            { type: "mrkdwn", text: `*Quality Score*\n${score}/100` },
            { type: "mrkdwn", text: `*Critical Issues*\n${criticalComments.length}` },
            { type: "mrkdwn", text: `*Action*\nChanges requested` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Issues found:*\n\n${issueList}` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View PR" },
              url: `https://github.com/${repoFullName}/pull/${prNumber}`,
              style: "danger",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Dashboard" },
              url: dashboardUrl || process.env.DASHBOARD_URL,
            },
          ],
        },
      ],
    }],
  });
}

/**
 * Notify when a PR is auto-approved with a high score.
 */
export async function notifyApproval({ repoFullName, prNumber, prTitle, authorLogin, score, dashboardUrl }) {
  await postToSlack({
    attachments: [{
      color: COLOURS.approved,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *PR auto-approved by ReviewAI*\n*<https://github.com/${repoFullName}/pull/${prNumber}|${repoFullName}#${prNumber}: ${prTitle}>*`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Author*\n${authorLogin}` },
            { type: "mrkdwn", text: `*Quality Score*\n${score}/100 🏆` },
          ],
        },
      ],
    }],
  });
}

/**
 * Notify when a repo's average score drops below the threshold.
 * Call this from a scheduled job (e.g. daily cron).
 */
export async function notifyScoreDrop({ repoFullName, currentScore, previousScore, dashboardUrl }) {
  if (currentScore >= SCORE_DROP_THRESHOLD) return;
  if (currentScore >= previousScore) return; // Only alert on drops

  await postToSlack({
    attachments: [{
      color: COLOURS.warning,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ *Quality score drop detected*\n*${repoFullName}* quality score has fallen below the threshold.`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Current Score*\n${currentScore}/100` },
            { type: "mrkdwn", text: `*Previous Score*\n${previousScore}/100` },
            { type: "mrkdwn", text: `*Threshold*\n${SCORE_DROP_THRESHOLD}/100` },
            { type: "mrkdwn", text: `*Change*\n${currentScore - previousScore} pts` },
          ],
        },
        {
          type: "actions",
          elements: [{
            type: "button",
            text: { type: "plain_text", text: "View Insights" },
            url: `${dashboardUrl || process.env.DASHBOARD_URL}/insights`,
          }],
        },
      ],
    }],
  });
}
