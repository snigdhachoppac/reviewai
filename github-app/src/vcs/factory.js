import { GitHubProvider } from "./github.js";
import { GitLabProvider } from "./gitlab.js";

/**
 * Returns the correct VCS provider instance for a review job.
 * The job payload always includes a `provider` field set by the webhook handler.
 */
export function createProvider(jobData) {
  switch (jobData.provider) {
    case "github":
      return new GitHubProvider({
        owner: jobData.owner,
        repo: jobData.repo,
        installationId: jobData.installationId,
      });

    case "gitlab":
      return new GitLabProvider({
        projectId: jobData.projectId,
        projectPath: jobData.repoFullName,
      });

    default:
      throw new Error(`Unknown VCS provider: ${jobData.provider}`);
  }
}
