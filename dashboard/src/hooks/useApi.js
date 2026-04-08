import { useState, useEffect } from "react";

const BASE = "/api";

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function useMetrics(repo, days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days });
    if (repo) params.set("repo", repo);
    apiFetch(`/metrics?${params}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [repo, days]);

  return { data, loading, error };
}

export function usePRs(repo, limit = 20) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ limit });
    if (repo) params.set("repo", repo);
    apiFetch(`/prs?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [repo, limit]);

  return { data, loading };
}

export function usePRComments(reviewId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reviewId) return;
    apiFetch(`/prs/${reviewId}/comments`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [reviewId]);

  return { data, loading };
}

export function useTrend(repo, days = 30) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ days });
    if (repo) params.set("repo", repo);
    apiFetch(`/trend?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [repo, days]);

  return { data, loading };
}

export function useTopIssues(repo, days = 30) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ days });
    if (repo) params.set("repo", repo);
    apiFetch(`/top-issues?${params}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [repo, days]);

  return { data, loading };
}

// Mock data for development / demo without a real backend
export const MOCK_METRICS = {
  total_reviews: 1284,
  total_issues: 847,
  security_issues: 32,
  arch_issues: 58,
  perf_issues: 41,
  style_issues: 89,
  avg_score: 87,
  critical_count: 12,
};

export const MOCK_PRS = [
  { id: 1, repo_full_name: "acme/backend", pr_number: 412, pr_title: "feat: add JWT refresh token rotation logic", author_login: "slee", overall_score: 54, review_event: "REQUEST_CHANGES", issue_count: 3, critical_count: 1, categories: ["security", "architecture"], created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
  { id: 2, repo_full_name: "acme/frontend", pr_number: 389, pr_title: "refactor: replace Redux with Zustand store", author_login: "mrodriguez", overall_score: 91, review_event: "APPROVE", issue_count: 1, critical_count: 0, categories: ["performance", "style"], created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
  { id: 3, repo_full_name: "acme/backend", pr_number: 403, pr_title: "fix: N+1 query in user feed endpoint", author_login: "tnguyen", overall_score: 78, review_event: "COMMENT", issue_count: 2, critical_count: 0, categories: ["performance"], created_at: new Date(Date.now() - 1000 * 60 * 200).toISOString() },
  { id: 4, repo_full_name: "acme/frontend", pr_number: 411, pr_title: "chore: upgrade next.js to 15.2, fix breaking changes", author_login: "kobi", overall_score: 83, review_event: "COMMENT", issue_count: 2, critical_count: 0, categories: ["security", "style"], created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString() },
  { id: 5, repo_full_name: "acme/backend", pr_number: 398, pr_title: "feat: rate limiting middleware for public endpoints", author_login: "slee", overall_score: 95, review_event: "APPROVE", issue_count: 0, critical_count: 0, categories: [], created_at: new Date(Date.now() - 1000 * 60 * 500).toISOString() },
];

export const MOCK_TREND = Array.from({ length: 14 }, (_, i) => ({
  day: new Date(Date.now() - (13 - i) * 86400000).toISOString(),
  avg_score: 72 + Math.floor(Math.random() * 20),
  pr_count: 3 + Math.floor(Math.random() * 8),
}));

export const MOCK_TOP_ISSUES = [
  { title: "Missing input validation", category: "security", severity: "critical", occurrences: 8 },
  { title: "N+1 query pattern", category: "performance", severity: "warning", occurrences: 7 },
  { title: "God object anti-pattern", category: "architecture", severity: "warning", occurrences: 5 },
  { title: "Unhandled promise rejection", category: "correctness", severity: "warning", occurrences: 5 },
  { title: "Hardcoded credentials", category: "security", severity: "critical", occurrences: 4 },
  { title: "Missing error boundary", category: "architecture", severity: "info", occurrences: 4 },
  { title: "Overly long function", category: "style", severity: "suggestion", occurrences: 11 },
];
