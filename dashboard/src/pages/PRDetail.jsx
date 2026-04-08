import { useParams, Link } from "react-router-dom";
import { MOCK_PRS } from "../hooks/useApi.js";
import styles from "./PRDetail.module.css";

const MOCK_COMMENTS = [
  {
    id: 1, file_path: "src/auth/jwt.js", line_number: 42,
    category: "security", severity: "critical",
    title: "jwt.decode() skips signature verification",
    suggestion: "jwt.decode() only base64-decodes the token without verifying the signature — any attacker can forge a token with arbitrary claims. Replace with jwt.verify(token, SECRET) which both validates the signature and checks expiry.",
    code_example: "const decoded = jwt.verify(token, process.env.JWT_SECRET, {\n  algorithms: ['HS256'],\n});",
    language: "js",
  },
  {
    id: 2, file_path: "src/auth/jwt.js", line_number: 67,
    category: "architecture", severity: "warning",
    title: "Token refresh logic leaks into controller layer",
    suggestion: "The refresh token rotation logic is implemented directly in the route handler. This violates single-responsibility — extract it into a dedicated AuthService.rotateRefreshToken() method to make it independently testable and reusable.",
    code_example: null,
  },
  {
    id: 3, file_path: "src/middleware/auth.js", line_number: 18,
    category: "security", severity: "warning",
    title: "Missing token expiry check on refresh path",
    suggestion: "The /auth/refresh route does not validate that the incoming refresh token has not expired before issuing a new access token. Add an expiry check or rely on jwt.verify() with the expiresIn option.",
    code_example: null,
  },
  {
    id: 4, file_path: "src/auth/jwt.js", line_number: 91,
    category: "performance", severity: "info",
    title: "Redundant DB lookup on every authenticated request",
    suggestion: "The user record is fetched from the database on every request to validate the token, but this information is already embedded in the JWT payload. Consider caching user data in Redis with a short TTL, or trusting the JWT claims directly for non-sensitive operations.",
    code_example: null,
  },
];

const SEVERITY = {
  critical: { label: "Critical", color: "var(--red)", bg: "var(--red-bg)" },
  warning:  { label: "Warning",  color: "var(--amber)", bg: "var(--amber-bg)" },
  info:     { label: "Info",     color: "var(--blue)", bg: "var(--blue-bg)" },
  suggestion: { label: "Suggestion", color: "var(--purple)", bg: "var(--purple-bg)" },
};

function CommentCard({ comment }) {
  const sev = SEVERITY[comment.severity] || SEVERITY.info;
  return (
    <div className={styles.comment}>
      <div className={styles.commentHeader}>
        <div className={styles.commentMeta}>
          <span className={styles.sevBadge} style={{ background: sev.bg, color: sev.color }}>
            {sev.label}
          </span>
          <span className={styles.category}>{comment.category}</span>
          <span className={styles.filePath}>
            {comment.file_path}
            {comment.line_number && <span className={styles.line}>:{comment.line_number}</span>}
          </span>
        </div>
      </div>
      <h3 className={styles.commentTitle}>{comment.title}</h3>
      <p className={styles.commentBody}>{comment.suggestion}</p>
      {comment.code_example && (
        <pre className={styles.codeBlock}>
          <code>{comment.code_example}</code>
        </pre>
      )}
    </div>
  );
}

export default function PRDetail() {
  const { id } = useParams();
  const pr = MOCK_PRS.find((p) => p.id === Number(id)) || MOCK_PRS[0];
  const comments = MOCK_COMMENTS;

  const scoreColor =
    pr.overall_score >= 85 ? "var(--green)" :
    pr.overall_score >= 65 ? "var(--amber)" : "var(--red)";

  const grouped = comments.reduce((acc, c) => {
    (acc[c.severity] = acc[c.severity] || []).push(c);
    return acc;
  }, {});

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>← Back to dashboard</Link>

      <div className={styles.prHeader}>
        <div className={styles.prInfo}>
          <div className={styles.repoTag}>{pr.repo_full_name} #{pr.pr_number}</div>
          <h1 className={styles.prTitle}>{pr.pr_title}</h1>
          <div className={styles.prMeta}>
            <span>by {pr.author_login}</span>
            <span className={styles.dot}>·</span>
            <span>{comments.length} issues found</span>
          </div>
        </div>
        <div className={styles.scoreCircle} style={{ borderColor: scoreColor, color: scoreColor }}>
          <div className={styles.scoreNum}>{pr.overall_score}</div>
          <div className={styles.scoreLabel}>score</div>
        </div>
      </div>

      <div className={styles.summaryBar}>
        {Object.entries(SEVERITY).map(([key, cfg]) => {
          const count = grouped[key]?.length || 0;
          if (!count) return null;
          return (
            <div key={key} className={styles.summaryItem}>
              <span className={styles.summaryCount} style={{ color: cfg.color }}>{count}</span>
              <span className={styles.summaryLabel}>{cfg.label}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.comments}>
        {["critical", "warning", "info", "suggestion"].map((sev) =>
          (grouped[sev] || []).map((c) => <CommentCard key={c.id} comment={c} />)
        )}
      </div>
    </div>
  );
}
