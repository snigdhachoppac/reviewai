import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../../src/vcs/factory.js";

describe("createProvider (VCS factory)", () => {
  it("returns a GitHubProvider for provider=github", () => {
    const provider = createProvider({
      provider: "github",
      owner: "acme",
      repo: "backend",
      installationId: 12345,
    });

    assert.equal(provider.constructor.name, "GitHubProvider");
    assert.equal(provider.owner, "acme");
    assert.equal(provider.repo, "backend");
  });

  it("returns a GitLabProvider for provider=gitlab", () => {
    const provider = createProvider({
      provider: "gitlab",
      projectId: 9876,
      repoFullName: "acme/backend",
    });

    assert.equal(provider.constructor.name, "GitLabProvider");
    assert.equal(provider.projectId, 9876);
    assert.equal(provider.projectPath, "acme/backend");
  });

  it("throws for unknown provider", () => {
    assert.throws(
      () => createProvider({ provider: "bitbucket" }),
      /Unknown VCS provider: bitbucket/
    );
  });

  it("throws when provider field is missing", () => {
    assert.throws(
      () => createProvider({ owner: "acme", repo: "backend" }),
      /Unknown VCS provider/
    );
  });
});

describe("GitLabProvider._fetch error handling", async () => {
  // Dynamic import so we can test the class in isolation
  const { GitLabProvider } = await import("../../src/vcs/gitlab.js");

  it("throws with a descriptive error on non-200 response", async () => {
    const provider = new GitLabProvider({ projectId: 1, projectPath: "a/b" });

    // Mock the global fetch to return a 404
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    await assert.rejects(
      () => provider._fetch("/projects/1/merge_requests/999"),
      /GitLab API error 404/
    );

    global.fetch = originalFetch;
  });
});

describe("GitHubProvider interface compliance", async () => {
  const { GitHubProvider } = await import("../../src/vcs/github.js");
  const { VCSProvider } = await import("../../src/vcs/provider.js");

  it("implements all required VCSProvider methods", () => {
    const required = ["getFiles", "getLanguages", "postReview", "postStatusPending", "postStatusComplete"];
    for (const method of required) {
      assert.ok(
        typeof GitHubProvider.prototype[method] === "function",
        `GitHubProvider should implement ${method}()`
      );
    }
  });

  it("GitLabProvider implements all required VCSProvider methods", async () => {
    const { GitLabProvider } = await import("../../src/vcs/gitlab.js");
    const required = ["getFiles", "getLanguages", "postReview", "postStatusPending", "postStatusComplete"];
    for (const method of required) {
      assert.ok(
        typeof GitLabProvider.prototype[method] === "function",
        `GitLabProvider should implement ${method}()`
      );
    }
  });
});
