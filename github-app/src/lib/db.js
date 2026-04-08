import pg from "pg";

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

db.on("error", (err) => console.error("DB pool error:", err));

// Run this once on startup to create tables
export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id            SERIAL PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      pr_number     INTEGER NOT NULL,
      pr_title      TEXT,
      author_login  TEXT,
      head_sha      TEXT NOT NULL,
      overall_score INTEGER NOT NULL DEFAULT 0,
      review_event  TEXT,
      summary       TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (repo_full_name, pr_number, head_sha)
    );

    CREATE TABLE IF NOT EXISTS review_comments (
      id            SERIAL PRIMARY KEY,
      review_id     INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      file_path     TEXT NOT NULL,
      line_number   INTEGER,
      category      TEXT NOT NULL,
      severity      TEXT NOT NULL,
      title         TEXT NOT NULL,
      suggestion    TEXT NOT NULL,
      code_example  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_repo ON reviews(repo_full_name);
    CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_review ON review_comments(review_id);
    CREATE INDEX IF NOT EXISTS idx_comments_category ON review_comments(category, severity);
    CREATE INDEX IF NOT EXISTS idx_comments_file ON review_comments(file_path);
  `);

  console.log("✅ DB migrations complete");
}
