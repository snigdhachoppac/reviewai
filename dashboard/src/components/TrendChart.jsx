import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import styles from "./TrendChart.module.css";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.ttDate}>{label}</div>
      <div className={styles.ttScore}>{payload[0]?.value} / 100</div>
      <div className={styles.ttPrs}>{payload[1]?.value} PRs</div>
    </div>
  );
}

export default function TrendChart({ data, loading }) {
  if (loading) return <div className={styles.skeleton} />;

  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(d.day), "MMM d"),
  }));

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={formatted} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[40, 100]}
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={80} stroke="var(--green-dim)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="avg_score"
            stroke="var(--green)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--green)", stroke: "var(--bg-base)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="pr_count"
            stroke="var(--text-muted)"
            strokeWidth={1}
            dot={false}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.lineGreen} /> Quality score
        </span>
        <span className={styles.legendItem}>
          <span className={styles.lineDashed} /> PR volume
        </span>
      </div>
    </div>
  );
}
