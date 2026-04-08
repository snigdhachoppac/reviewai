import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReviewPrompt } from "../../src/review/prompt.js";

const MOCK_FILES = [
  {
    filename: "src/auth/jwt.js",
    additions: 40,
    deletions: 5,
    changes: 45,
    patch: `@@ -1,5 +1,10 @@
+const jwt = require('jsonwebtoken');
+
+function verifyToken(token) {
-  const decoded = jwt.decode(token);
+  const decoded = jwt.verify(token, process.env.SECRET);
   return decoded;
 }`,
  },
  {
    filename: "src/middleware/auth.js",
    additions: 10,
    deletions: 2,
    changes: 12,
    patch: `@@ -10,3 +10,5 @@
+if (!token) {
+  return res.status(401).json({ error: 'Unauthorized' });
+}`,
  },
];

const MOCK_LANGUAGES = { JavaScript: 85000, TypeScript: 12000, Shell: 3000 };

describe("buildReviewPrompt", () => {
  it("includes the PR title and body", () => {
    const prompt = buildReviewPrompt({
      prTitle: "feat: add JWT token verification",
      prBody: "Fixes insecure token handling",
      files: MOCK_FILES,
      languages: MOCK_LANGUAGES,
      recentIssues: [],
    });

    assert.ok(prompt.includes("feat: add JWT token verification"), "should include PR title");
    assert.ok(prompt.includes("Fixes insecure token handling"), "should include PR body");
  });

  it("includes top languages", () => {
    const prompt = buildReviewPrompt({
      prTitle: "test PR",
      prBody: "",
      files: MOCK_FILES,
      languages: MOCK_LANGUAGES,
      recentIssues: [],
    });

    assert.ok(prompt.includes("JavaScript"), "should include dominant language");
  });

  it("includes file patches in the diff section", () => {
    const prompt = buildReviewPrompt({
      prTitle: "test PR",
      prBody: "",
      files: MOCK_FILES,
      languages: MOCK_LANGUAGES,
      recentIssues: [],
    });

    assert.ok(prompt.includes("src/auth/jwt.js"), "should include changed filename");
    assert.ok(prompt.includes("jwt.verify"), "should include patch content");
  });

  it("includes recent issue context when provided", () => {
    const prompt = buildReviewPrompt({
      prTitle: "test PR",
      prBody: "",
      files: MOCK_FILES,
      languages: MOCK_LANGUAGES,
      recentIssues: [
        {
          file_path: "src/auth/jwt.js",
          category: "security",
          suggestion: "Token not verified previously",
        },
      ],
    });

    assert.ok(prompt.includes("Recent issues"), "should include recent issues section");
    assert.ok(prompt.includes("Token not verified previously"), "should include specific past issue");
  });

  it("limits to 15 files sorted by diff size", () => {
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      filename: `src/file${i}.js`,
      additions: i * 10,
      deletions: i * 2,
      changes: i * 12,
      patch: `@@ line @@\n+code change ${i}`,
    }));

    const prompt = buildReviewPrompt({
      prTitle: "big refactor",
      prBody: "",
      files: manyFiles,
      languages: {},
      recentIssues: [],
    });

    // The largest files (highest index) should be present
    assert.ok(prompt.includes("src/file24.js"), "should include largest file");
    // Files beyond the 15-file limit (smallest) should be excluded
    assert.ok(!prompt.includes("src/file0.js"), "should exclude smallest files beyond limit");
  });

  it("returns a string containing the JSON schema", () => {
    const prompt = buildReviewPrompt({
      prTitle: "test",
      prBody: "",
      files: MOCK_FILES,
      languages: {},
      recentIssues: [],
    });

    assert.ok(prompt.includes('"overallScore"'), "should contain schema field overallScore");
    assert.ok(prompt.includes('"comments"'), "should contain schema field comments");
    assert.ok(prompt.includes('"severity"'), "should contain schema field severity");
  });
});
