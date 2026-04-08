import { useState } from "react";
import MetricCard from "../components/MetricCard.jsx";
import PRList from "../components/PRList.jsx";
import TrendChart from "../components/TrendChart.jsx";
import IssueBreakdown from "../components/IssueBreakdown.jsx";
import {
  MOCK_METRICS, MOCK_PRS, MOCK_TREND,
} from "../hooks/useApi.js";
import styles from "./Dashboard.module.css";

// Toggle this to false to use the real API hooks
const USE_MOCK = true;

export default function Dashboard() {
  const [days, setDays] = useState(30);

  // In production, swap these with the real hooks:
  // const { data: metrics, loading: mLoading } = useMetrics(null, days);
  // const { data: prs, loading: pLoading } = usePRs(null, 20);
  // const { data: trend, loading: tLoading } = useTrend(null, days);
  const metrics = MOCK_METRICS;
  const prs = MOCK_PRS;
  const trend = MOCK_TREND;
  const loading = false;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.sub}>Code quality across all repositories</p>
        </div>
        <select
          className={styles.select}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className={styles.metrics}>
        <MetricCard
          label="PRs reviewed"
          value={metrics?.total_reviews?.toLocaleString()}
          sub="↑ 18% vs last period"
          subUp
          highlight
        />
        <MetricCard
          label="Issues caught"
          value={metrics?.total_issues?.toLocaleString()}
          sub={`${metrics?.critical_count} critical`}
        />
        <MetricCard
          label="Avg quality score"
          value={metrics?.avg_score}
          sub="Target: 85"
          subUp={metrics?.avg_score >= 85}
        />
        <MetricCard
          label="Security fixes"
          value={metrics?.security_issues}
          sub="Auto-flagged by AI"
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Open pull requests</h2>
              <span className={styles.badge}>{prs.length} active</span>
            </div>
            <PRList prs={prs} loading={loading} />
          </section>
        </div>

        <div className={styles.sideCol}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Quality trend</h2>
            </div>
            <TrendChart data={trend} loading={loading} />
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Issue breakdown</h2>
            </div>
            <IssueBreakdown metrics={metrics} loading={loading} />
          </section>
        </div>
      </div>
    </div>
  );
}
