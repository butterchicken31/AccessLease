"use client";
// Small shared UI pieces + the fetch helper. Frontend-owned.

export const STATUS = {
  violation: { label: "Confirmed violation", cls: "b-red" },
  needs_review: { label: "Needs review", cls: "b-amber" },
  compliant: { label: "Compliant", cls: "b-green" },
  resolved: { label: "Resolved", cls: "b-grey" },
};

export const ISSUE_LABELS = {
  stale: "Stale",
  over_broad: "Over-broad",
  ownerless: "Owner problem",
  missing_metadata: "Missing data",
  orphaned_delegation: "Delegation problem",
  inactive_identity: "Inactive identity",
  duplicate: "Duplicate",
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: "b-grey" };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function WorkflowBadge({ label }) {
  return <span className="badge b-blue">{label}</span>;
}

export function ScoreBar({ score }) {
  const tone = score >= 70 ? "hi" : score >= 40 ? "mid" : "lo";
  return (
    <div className="score" title={`Priority score ${score} / 100`}>
      <div className="score-track"><div className={`score-fill ${tone}`} style={{ width: `${score}%` }} /></div>
      <span className="mono">{score}</span>
    </div>
  );
}

export const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

export async function getJSON(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
