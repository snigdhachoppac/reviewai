/**
 * PR Template Enforcement
 *
 * Checks that a PR description fills in all required sections of the team's
 * PR template before the AI review proceeds. Missing template sections are
 * flagged as a comment — not a review rejection — since they're process issues,
 * not code issues.
 *
 * To configure: add a .github/PULL_REQUEST_TEMPLATE.md (or .gitlab/merge_request_templates/Default.md)
 * to your repo. ReviewAI will extract the required sections and check them.
 *
 * Falls back to a built-in default template if none is found in the repo.
 */

// Default template sections ReviewAI enforces if no custom template is found
const DEFAULT_REQUIRED_SECTIONS = [
  {
    id: "what",
    pattern: /##\s*(what|summary|description|changes?)/i,
    placeholder: /\[.*?(describe|add a description|what does).*?\]/i,
    label: "## What",
    description: "A description of what this PR does",
  },
  {
    id: "why",
    pattern: /##\s*(why|motivation|context|reason)/i,
    placeholder: /\[.*?(why|motivation|reason).*?\]/i,
    label: "## Why",
    description: "Why this change is needed",
  },
  {
    id: "testing",
    pattern: /##\s*(test|testing|how.*test|verification)/i,
    placeholder: /\[.*?(describe.*test|how.*verify|test.*approach).*?\]/i,
    label: "## Testing",
    description: "How this was tested",
  },
];

/**
 * Parses a markdown PR template and extracts required section headers.
 */
function parseTemplateRequirements(templateContent) {
  const lines = templateContent.split("\n");
  const sections = [];

  for (const line of lines) {
    // Required sections are marked with ## headers
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      const header = headerMatch[1].trim();
      // Skip optional sections (marked with "(optional)" or similar)
      if (/optional/i.test(header)) continue;

      sections.push({
        id: header.toLowerCase().replace(/\s+/g, "_"),
        label: `## ${header}`,
        pattern: new RegExp(`##\\s*${escapeRegex(header)}`, "i"),
        description: header,
      });
    }
  }

  return sections.length > 0 ? sections : DEFAULT_REQUIRED_SECTIONS;
}

/**
 * Checks a PR body against the required template sections.
 * Returns an array of violations (empty = template satisfied).
 */
export function checkPRTemplate(prBody, templateContent = null) {
  const requirements = templateContent
    ? parseTemplateRequirements(templateContent)
    : DEFAULT_REQUIRED_SECTIONS;

  if (!prBody || prBody.trim().length < 20) {
    return [{
      id: "no_description",
      label: "PR description",
      issue: "PR has no description. Please fill in the PR template.",
      severity: "warning",
    }];
  }

  const violations = [];

  for (const req of requirements) {
    // Check if the section header exists
    const hasSection = req.pattern.test(prBody);
    if (!hasSection) {
      violations.push({
        id: req.id,
        label: req.label,
        issue: `Missing section: **${req.label}** — ${req.description}`,
        severity: "info",
      });
      continue;
    }

    // Check if the section content is filled in (not just the placeholder)
    if (req.placeholder && req.placeholder.test(prBody)) {
      violations.push({
        id: `${req.id}_unfilled`,
        label: req.label,
        issue: `Section **${req.label}** appears to still have placeholder text. Please fill it in.`,
        severity: "info",
      });
    }
  }

  return violations;
}

/**
 * Formats template violations into a GitHub/GitLab PR comment.
 */
export function formatTemplateComment(violations, dashboardUrl) {
  if (violations.length === 0) return null;

  const lines = [
    "## ⚠️ PR Template Checklist",
    "",
    "ReviewAI noticed the following sections may need attention:",
    "",
    ...violations.map((v) => `- ${v.issue}`),
    "",
    "*These are process reminders, not code issues. The AI code review has proceeded regardless.*",
    "",
    `<sub>ReviewAI · [Dashboard](${dashboardUrl || process.env.DASHBOARD_URL})</sub>`,
  ];

  return lines.join("\n");
}

/**
 * Attempts to fetch the repo's PR template from the VCS provider.
 * Returns null if no template is found.
 */
export async function fetchPRTemplate(vcsProvider, prNumber) {
  try {
    // Try GitHub-style .github/PULL_REQUEST_TEMPLATE.md
    const files = await vcsProvider.getFiles(prNumber);
    // Templates aren't in the diff — this is a simplification.
    // In production, use the Contents API to fetch the template file directly.
    return null;
  } catch {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
