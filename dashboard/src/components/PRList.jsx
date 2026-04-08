import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import styles from "./PRList.module.css";

const SEVERITY_COLORS = {
  security: { bg: "var(--red-bg)", color: "var(--red)" },
  architecture: { bg: "var(--purple-bg)", color: "var(--purple)" },
  performance: { bg: "var(--amber-bg)", color: "var(--amber)" },
  style: { bg: "var(--blue-bg)", color: "var(--blue)" },
  correctness: { bg: "var(--amber-bg)", color: "var(--amber)" },
};

const EVENT_CONFIG = {
  REQUEST_CHANGES: { label: "Changes requested", color: "var(--red)" },
  APPROVE: { label: "Approved", color: "var(--green)" },
  COMMENT: { label: "Reviewed", color: "var(--blue)" },
};

function ScoreBadge({ score }) {
  const color =
    score >= 85 ? "var(--green)" :
    score >= 65 ? "var(--amber)" :
    "var(--red)";
  return (
    <div className={styles.score} style={{ color, borderColor: color + "40" }}>
      {score}
    </div>
  );
}

function Avatar({ login }) {
  const initials = login
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
  const hue = login.charCodeAt(0) * 17 % 360;
  return (
    <div
      className={styles.avatar}
      style={{ background: `hsl(${hue} 40% 20%)`, color: `hsl(${hue} 70% 70%)` }}
    >
      {initials}
    </div>
  );
}

export default function PRList({ prs, loading }) {
  if (loading) {
    return (
      <div className={styles.wrap}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {prs.map((pr) => {
        const event = EVENT_CONFIG[pr.review_event] || EVENT_CONFIG.COMMENT;
        return (
          <Link key={pr.id} to={`/pr/${pr.id}`} className={styles.row}>
            <Avatar login={pr.author_login} />

            <div className={styles.meta}>
              <div className={styles.title}>{pr.pr_title}</div>
              <div className={styles.sub}>
                <span className={styles.repo}>{pr.repo_full_name}</span>
                <span className={styles.dot}>·</span>
                <span>#{pr.pr_number}</span>
                <span className={styles.dot}>·</span>
                <span>{formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}</span>
              </div>

              {pr.categories?.length > 0 && (
                <div className={styles.tags}>
                  {pr.critical_count > 0 && (
                    <span className={styles.tag} style={{ background: "var(--red-bg)", color: "var(--red)" }}>
                      🔴 {pr.critical_count} critical
                    </span>
                  )}
                  {pr.categories.map((cat) => {
                    const s = SEVERITY_COLORS[cat] || SEVERITY_COLORS.style;
                    return (
                      <span key={cat} className={styles.tag} style={{ background: s.bg, color: s.color }}>
                        {cat}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.right}>
              <ScoreBadge score={pr.overall_score} />
              <div className={styles.event} style={{ color: event.color }}>
                {event.label}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
