import styles from "./MetricCard.module.css";

export default function MetricCard({ label, value, sub, subUp, highlight }) {
  return (
    <div className={`${styles.card} ${highlight ? styles.highlight : ""}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value ?? "—"}</div>
      {sub && (
        <div className={`${styles.sub} ${subUp ? styles.up : styles.neutral}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
