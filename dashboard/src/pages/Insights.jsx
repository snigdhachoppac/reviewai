import { MOCK_TOP_ISSUES, MOCK_TREND } from "../hooks/useApi.js";
import TrendChart from "../components/TrendChart.jsx";
import styles from "./Insights.module.css";

const SEV_COLOR = {
  critical: "var(--red)",
  warning: "var(--amber)",
  info: "var(--blue)",
  suggestion: "var(--purple)",
};

const CAT_COLOR = {
  security: "var(--red-bg)",
  architecture: "var(--purple-bg)",
  performance: "var(--amber-bg)",
  style: "var(--blue-bg)",
  correctness: "var(--amber-bg)",
};

const AI_INSIGHTS = [
  {
    icon: "🔴",
    title: "Auth module is a hotspot",
    body: "3 security issues in the past 2 weeks all originate in src/auth/. Consider a dedicated security review of this module before the next release.",
  },
  {
    icon: "🟡",
    title: "Error boundaries consistently missing",
    body: "Frontend PRs repeatedly lack React error boundaries around async components. Add this to your PR template as a required checklist item.",
  },
  {
    icon: "🟢",
    title: "Query performance improving",
    body: "N+1 query patterns dropped 40% since AI flagging was enabled. The fix rate for performance issues is now 87%.",
  },
  {
    icon: "🔵",
    title: "Score trending up",
    body: "Average team quality score has risen 6 points over 30 days. Architecture issues — the hardest to fix — are down 22%.",
  },
];

export default function Insights() {
  const issues = MOCK_TOP_ISSUES;
  const trend = MOCK_TREND;
  const max = Math.max(...issues.map((i) => i.occurrences), 1);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Insights</h1>
        <p className={styles.sub}>Patterns and trends across your engineering team</p>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top recurring issues</h2>
          <div className={styles.issueList}>
            {issues.map((issue, i) => (
              <div key={i} className={styles.issueRow}>
                <div className={styles.issueLeft}>
                  <span
                    className={styles.issueCat}
                    style={{ background: CAT_COLOR[issue.category] || "var(--blue-bg)" }}
                  >
                    {issue.category}
                  </span>
                  <span className={styles.issueTitle}>{issue.title}</span>
                </div>
                <div className={styles.issueRight}>
                  <div className={styles.issueBar}>
                    <div
                      className={styles.issueBarFill}
                      style={{
                        width: `${(issue.occurrences / max) * 100}%`,
                        background: SEV_COLOR[issue.severity] || "var(--blue)",
                      }}
                    />
                  </div>
                  <span
                    className={styles.issueCount}
                    style={{ color: SEV_COLOR[issue.severity] || "var(--blue)" }}
                  >
                    {issue.occurrences}×
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.sideCol}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Quality over time</h2>
            <TrendChart data={trend} loading={false} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>AI team insights</h2>
            <div className={styles.insightList}>
              {AI_INSIGHTS.map((ins, i) => (
                <div key={i} className={styles.insight}>
                  <span className={styles.insightIcon}>{ins.icon}</span>
                  <div>
                    <div className={styles.insightTitle}>{ins.title}</div>
                    <div className={styles.insightBody}>{ins.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
