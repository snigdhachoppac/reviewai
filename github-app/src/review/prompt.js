/**
 * Builds a rich, context-aware prompt for Claude to review a PR.
 * The more context we give, the better the architectural suggestions.
 */
export function buildReviewPrompt({ prTitle, prBody, files, languages, recentIssues }) {
  const topLanguages = Object.keys(languages).slice(0, 3).join(", ");

  // Limit diff size - take the most impactful files first
  const sortedFiles = [...files].sort((a, b) => b.changes - a.changes).slice(0, 15);

  const diffContent = sortedFiles
    .map((f) => {
      const header = `### ${f.filename} (+${f.additions} -${f.deletions})`;
      // Truncate very large diffs to keep within context window
      const patch = f.patch ? f.patch.slice(0, 3000) : "[Binary or no diff available]";
      return `${header}\n\`\`\`diff\n${patch}\n\`\`\``;
    })
    .join("\n\n");

  const recentContext =
    recentIssues.length > 0
      ? `\n\n## Recent issues in touched files (last 30 days)\n${recentIssues
          .map((r) => `- [${r.category}] ${r.file_path}: ${r.suggestion}`)
          .join("\n")}`
      : "";

  return `You are reviewing a pull request. Return ONLY valid JSON matching the schema below — no markdown, no explanation.

## PR Context
**Title:** ${prTitle}
**Description:** ${prBody || "No description provided."}
**Languages:** ${topLanguages}
**Files changed:** ${files.length} (showing top ${sortedFiles.length} by diff size)
${recentContext}

## Diff
${diffContent}

## Response Schema
\`\`\`json
{
  "overallScore": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "comments": [
    {
      "filePath": "<path/to/file.ext>",
      "line": <integer line number in new file, or null>,
      "category": "<security|architecture|performance|style|correctness>",
      "severity": "<critical|warning|info|suggestion>",
      "title": "<short title, max 8 words>",
      "suggestion": "<actionable explanation, 1-4 sentences>",
      "codeExample": "<optional improved code snippet>",
      "language": "<code language for syntax highlighting, optional>",
      "references": ["<optional CVE/RFC/doc links>"]
    }
  ]
}
\`\`\`

## Review Guidelines
- **Security**: Flag auth bypasses, injection vectors, hardcoded secrets, insecure defaults, unsafe deserialization, CORS misconfigs
- **Architecture**: Identify tight coupling, missing abstractions, violations of SRP/SOLID, circular dependencies, wrong layer of abstraction
- **Performance**: N+1 queries, missing indexes (infer from ORM usage), unnecessary re-renders, large bundle imports, blocking I/O
- **Correctness**: Race conditions, missing error handling, off-by-one errors, type coercion bugs, null/undefined deref
- **Style**: Naming clarity, function length, dead code, missing tests for critical paths

Scoring:
- Start at 100. Deduct 20 per critical, 8 per warning, 2 per info/suggestion.
- Minimum score: 10.

Be specific. Reference exact variable names, function names, and patterns. Do not flag formatting-only issues if a linter would catch them.`;
}
