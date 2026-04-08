/**
 * VCS Provider Abstraction Layer
 *
 * Every VCS provider (GitHub, GitLab, Bitbucket...) implements this interface.
 * The review engine only speaks this language — it never calls GitHub or GitLab
 * APIs directly. This makes adding new providers a matter of implementing one file.
 *
 * @typedef {Object} NormalizedPR
 * @property {string} provider       - "github" | "gitlab" | "bitbucket"
 * @property {string} repoFullName   - "owner/repo"
 * @property {number} prNumber       - PR / MR number
 * @property {string} prTitle
 * @property {string} prBody
 * @property {string} headSha        - commit SHA being reviewed
 * @property {string} baseSha
 * @property {string} authorLogin
 * @property {string} targetBranch
 * @property {NormalizedFile[]} files
 * @property {Record<string,number>} languages
 *
 * @typedef {Object} NormalizedFile
 * @property {string} filename
 * @property {number} additions
 * @property {number} deletions
 * @property {number} changes
 * @property {string|null} patch    - unified diff string
 *
 * @typedef {Object} ReviewComment
 * @property {string} filePath
 * @property {number|null} line
 * @property {string} body          - formatted markdown comment
 *
 * @typedef {Object} ReviewResult
 * @property {number} overallScore
 * @property {string} summary
 * @property {ReviewComment[]} comments
 * @property {"APPROVE"|"REQUEST_CHANGES"|"COMMENT"} event
 */

export class VCSProvider {
  /** @returns {Promise<NormalizedFile[]>} */
  async getFiles(_prNumber) { throw new Error("Not implemented"); }

  /** @returns {Promise<Record<string,number>>} */
  async getLanguages() { throw new Error("Not implemented"); }

  /** @returns {Promise<void>} */
  async postReview(_prNumber, _headSha, _result) { throw new Error("Not implemented"); }

  /** @returns {Promise<void>} */
  async postStatusPending(_prNumber, _headSha) { throw new Error("Not implemented"); }

  /** @returns {Promise<void>} */
  async postStatusComplete(_prNumber, _headSha, _result) { throw new Error("Not implemented"); }
}
