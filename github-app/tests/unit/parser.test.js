import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReviewResponse } from "../../src/review/parser.js";

describe("parseReviewResponse", () => {
  it("parses a valid JSON review response", () => {
    const valid = JSON.stringify({
      overallScore: 72,
      summary: "This PR has one critical security issue and two minor style problems.",
      comments: [
        {
          filePath: "src/auth/jwt.js",
          line: 42,
          category: "security",
          severity: "critical",
          title: "jwt.decode skips signature verification",
          suggestion: "Use jwt.verify() instead of jwt.decode() to validate the token signature.",
          codeExample: "const decoded = jwt.verify(token, process.env.JWT_SECRET);",
          language: "js",
        },
      ],
    });

    const result = parseReviewResponse(valid);

    assert.equal(result.overallScore, 72);
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].category, "security");
    assert.equal(result.comments[0].severity, "critical");
  });

  it("strips markdown code fences before parsing", () => {
    const withFences = "```json\n" + JSON.stringify({
      overallScore: 85,
      summary: "Looks good.",
      comments: [],
    }) + "\n```";

    const result = parseReviewResponse(withFences);
    assert.equal(result.overallScore, 85);
    assert.equal(result.comments.length, 0);
  });

  it("returns a safe fallback when JSON is completely invalid", () => {
    const result = parseReviewResponse("This is not JSON at all, sorry!");

    assert.ok(typeof result.overallScore === "number", "should return numeric score");
    assert.ok(Array.isArray(result.comments), "should return empty comments array");
    assert.ok(typeof result.summary === "string", "should return summary string");
  });

  it("returns a safe fallback for empty input", () => {
    const result = parseReviewResponse("");
    assert.ok(Array.isArray(result.comments));
  });

  it("handles partial schema — missing optional fields", () => {
    const partial = JSON.stringify({
      overallScore: 60,
      summary: "Needs work.",
      comments: [
        {
          filePath: "src/app.js",
          category: "style",
          severity: "info",
          title: "Function is too long",
          suggestion: "Consider breaking this into smaller functions.",
          // line, codeExample, language, references are all optional
        },
      ],
    });

    const result = parseReviewResponse(partial);
    assert.equal(result.comments[0].filePath, "src/app.js");
    assert.equal(result.comments[0].line, undefined);
  });

  it("clamps overallScore to 0-100 range", () => {
    const outOfRange = JSON.stringify({
      overallScore: 150, // invalid — should be caught by Zod
      summary: "test",
      comments: [],
    });

    // Zod will fail validation — should fall back gracefully
    const result = parseReviewResponse(outOfRange);
    assert.ok(result !== null, "should not throw");
    assert.ok(typeof result.overallScore === "number");
  });

  it("accepts all valid severity levels", () => {
    for (const severity of ["critical", "warning", "info", "suggestion"]) {
      const input = JSON.stringify({
        overallScore: 80,
        summary: "test",
        comments: [{
          filePath: "src/x.js",
          category: "style",
          severity,
          title: "test comment",
          suggestion: "do something",
        }],
      });

      const result = parseReviewResponse(input);
      assert.equal(result.comments[0].severity, severity, `should accept severity: ${severity}`);
    }
  });

  it("accepts all valid category values", () => {
    for (const category of ["security", "architecture", "performance", "style", "correctness"]) {
      const input = JSON.stringify({
        overallScore: 80,
        summary: "test",
        comments: [{
          filePath: "src/x.js",
          category,
          severity: "info",
          title: "test",
          suggestion: "do something",
        }],
      });

      const result = parseReviewResponse(input);
      assert.equal(result.comments[0].category, category, `should accept category: ${category}`);
    }
  });
});
