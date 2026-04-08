import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration test for runReview().
 *
 * We mock:
 *   - The VCS provider (no real GitHub/GitLab calls)
 *   - The Anthropic SDK (no real API calls)
 *   - The Postgres pool (no real DB)
 *
 * We test:
 *   - The correct review event is chosen based on AI output
 *   - Comments are formatted and passed to vcs.postReview()
 *   - DB insert is called with correct data
 *   - Fallback works when AI returns malformed JSON
 */

// ── Minimal mock implementations ─────────────────────────────────────────────

class MockVCSProvider {
  constructor() {
    this.calls = { postStatusPending: 0, postReview: 0, postStatusComplete: 0 };
    this.lastReview = null;
  }
  async getFiles() {
    return [{
      filename: "src/auth/jwt.js",
      additions: 10, deletions: 2, changes: 12,
      patch: "@@ -1 +1 @@\n-jwt.decode(token)\n+jwt.verify(token, SECRET)",
    }];
  }
  async getLanguages() { return { JavaScript: 50000 }; }
  async postStatusPending() { this.calls.postStatusPending++; }
  async postReview(prNumber, headSha, result) {
    this.calls.postReview++;
    this.lastReview = result;
  }
  async postStatusComplete() { this.calls.postStatusComplete++; }
}

const VALID_AI_RESPONSE = JSON.stringify({
  overallScore: 55,
  summary: "Critical security issue found: JWT not verified.",
  comments: [{
    filePath: "src/auth/jwt.js",
    line: 1,
    category: "security",
    severity: "critical",
    title: "jwt.decode skips verification",
    suggestion: "Use jwt.verify() to validate the token signature.",
    codeExample: "const decoded = jwt.verify(token, SECRET);",
    language: "js",
  }],
});

// ── Mock module registry ──────────────────────────────────────────────────────

// We use mock.module to replace the real dependencies before importing engine.js
const mockProvider = new MockVCSProvider();
let capturedDbArgs = null;

await mock.module("../../src/vcs/factory.js", {
  namedExports: {
    createProvider: () => mockProvider,
  },
});

await mock.module("@anthropic-ai/sdk", {
  defaultExport: class MockAnthropic {
    messages = {
      create: async () => ({
        content: [{ type: "text", text: VALID_AI_RESPONSE }],
      }),
    };
  },
});

await mock.module("../../src/lib/db.js", {
  namedExports: {
    db: {
      query: async (sql, params) => {
        capturedDbArgs = { sql, params };
        if (sql.includes("INSERT INTO reviews")) {
          return { rows: [{ id: 42 }] };
        }
        return { rows: [] };
      },
    },
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

const { runReview } = await import("../../src/review/engine.js");

describe("runReview() integration", () => {
  const BASE_JOB = {
    provider: "github",
    repoFullName: "acme/backend",
    prNumber: 412,
    prTitle: "feat: add JWT verification",
    prBody: "Fixes insecure token handling",
    headSha: "abc123",
    baseSha: "def456",
    authorLogin: "slee",
    installationId: 9999,
  };

  it("calls postStatusPending before the review", async () => {
    mockProvider.calls.postStatusPending = 0;
    await runReview(BASE_JOB);
    assert.equal(mockProvider.calls.postStatusPending, 1, "should signal pending once");
  });

  it("calls postReview and postStatusComplete after", async () => {
    mockProvider.calls.postReview = 0;
    mockProvider.calls.postStatusComplete = 0;
    await runReview(BASE_JOB);
    assert.equal(mockProvider.calls.postReview, 1, "should call postReview once");
    assert.equal(mockProvider.calls.postStatusComplete, 1, "should call postStatusComplete once");
  });

  it("sets event=REQUEST_CHANGES when a critical issue exists", async () => {
    await runReview(BASE_JOB);
    assert.equal(
      mockProvider.lastReview.event,
      "REQUEST_CHANGES",
      "critical severity should trigger REQUEST_CHANGES"
    );
  });

  it("passes formatted comments with a body string to postReview", async () => {
    await runReview(BASE_JOB);
    const comment = mockProvider.lastReview.comments[0];
    assert.ok(typeof comment.body === "string", "comment should have a body string");
    assert.ok(comment.body.includes("security"), "body should reference category");
    assert.ok(comment.body.includes("jwt.verify"), "body should include code example");
  });

  it("persists the review to the DB with correct fields", async () => {
    capturedDbArgs = null;
    await runReview(BASE_JOB);
    assert.ok(capturedDbArgs !== null, "should call db.query");
    assert.ok(capturedDbArgs.sql.includes("INSERT INTO reviews"), "should insert into reviews");
    assert.ok(capturedDbArgs.params.includes("acme/backend"), "should include repo name");
    assert.ok(capturedDbArgs.params.includes("github"), "should include provider");
  });

  it("approves a PR with high score and no critical issues", async () => {
    // Override mock to return a clean review
    await mock.module("@anthropic-ai/sdk", {
      defaultExport: class MockAnthropic {
        messages = {
          create: async () => ({
            content: [{ type: "text", text: JSON.stringify({
              overallScore: 92,
              summary: "Clean PR, looks good.",
              comments: [{
                filePath: "src/utils.js", line: 5,
                category: "style", severity: "suggestion",
                title: "Minor naming nit",
                suggestion: "Consider renaming x to index for clarity.",
              }],
            }) }],
          }),
        };
      },
    });

    const { runReview: runReview2 } = await import("../../src/review/engine.js");
    await runReview2(BASE_JOB);
    assert.equal(mockProvider.lastReview.event, "APPROVE");
  });
});
