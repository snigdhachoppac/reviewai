import styles from "./IssueBreakdown.module.css";

const CATEGORIES = [
  { key: "security_issues", label: "Security", color: "var(--red)" },
  { key: "arch_issues", label: "Architecture", color: "var(--purple)" },
  { key: "perf_issues", label: "Performance", color: "var(--amber)" },
  { key: "style_issues", label: "Style / clarity", color: "var(--blue)" },
];

export default function IssueBreakdown({ metrics, loading }) {
  if (loading) return <div className={styles.skeleton} />;
  if (!metrics) return null;

  const max = Math.max(...CATEGORIES.map((c) => metrics[c.key] || 0), 1);

  return (
    <div className={styles.wrap}>
      {CATEGORIES.map((cat) => {
        const count = metrics[cat.key] || 0;
        const pct = Math.round((count / max) * 100);
        return (
          <div key={cat.key} className={styles.row}>
            <div className={styles.labelRow}>
              <span className={styles.label}>{cat.label}</span>
              <span className={styles.count}>{count}</span>
            </div>
            <div className={styles.track}>
              <div
                className={styles.fill}
                style={{ width: `${pct}%`, background: cat.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
