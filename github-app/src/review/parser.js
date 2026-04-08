import { z } from "zod";

const CommentSchema = z.object({
  filePath: z.string(),
  line: z.number().int().positive().nullable().optional(),
  category: z.enum(["security", "architecture", "performance", "style", "correctness"]),
  severity: z.enum(["critical", "warning", "info", "suggestion"]),
  title: z.string().max(100),
  suggestion: z.string(),
  codeExample: z.string().optional(),
  language: z.string().optional(),
  references: z.array(z.string()).optional(),
});

const ReviewSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string(),
  comments: z.array(CommentSchema),
});

export function parseReviewResponse(rawText) {
  // Strip any accidental markdown fences Claude might add
  const clean = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error("Failed to parse Claude response as JSON:", err);
    console.error("Raw response:", rawText.slice(0, 500));
    // Return a safe fallback so we don't crash the job
    return {
      overallScore: 70,
      summary: "ReviewAI encountered an issue parsing the AI response. Manual review recommended.",
      comments: [],
    };
  }

  const result = ReviewSchema.safeParse(parsed);
  if (!result.success) {
    console.warn("Review schema validation failed:", result.error.issues);
    // Still return what we have — partial is better than nothing
    return {
      overallScore: parsed.overallScore ?? 70,
      summary: parsed.summary ?? "Review completed with validation warnings.",
      comments: (parsed.comments ?? []).filter(isValidComment),
    };
  }

  return result.data;
}

function isValidComment(c) {
  return (
    typeof c.filePath === "string" &&
    typeof c.suggestion === "string" &&
    typeof c.title === "string"
  );
}
