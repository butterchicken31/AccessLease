"use client";
// Review queue: summary cards, dataset switcher, and the priority-ordered table (Deliverable 1).
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge, WorkflowBadge, ScoreBar, ISSUE_LABELS, fmtDate, getJSON } from "../components/ui";

const FILTERS = [
  { key: "open", label: "Open items" },
  { key: "violation", label: "Confirmed violations" },
  { key: "needs_review", label: "Needs review" },
  { key: "compliant", label: "Compliant" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "Everything" },
];

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getJSON("/api/findings")); setErr(""); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function switchDataset(key) {
    setBusy(true);
    try { await getJSON("/api/dataset", { method: "POST", body: { key } }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !data) return <p className="err">Could not load findings: {err}. Is the backend running?</p>;
  if (!data) return <p className="sub">Loading…</p>;

  const { summary, findings } = data;
  const closedWf = ["revoked", "exception_accepted"];
  const rows = findings.filter((f) => {
    if (filter === "all") return true;
    if (filter === "open") return ["violation", "needs_review"].includes(f.status) && !closedWf.includes(f.workflow.state);
    return f.status === filter;
  });

  return (
    <>
      <h1>Review queue</h1>
      <p className="sub">
        {data.dataset.name} · audited as of <span className="mono">{data.asOf.slice(0, 10)}</span> · highest risk first
      </p>

      <div className="grid4">
        <button className={`stat red ${filter === "violation" ? "on" : ""}`} onClick={() => setFilter("violation")}>
          <div className="n">{summary.violation}</div><div className="l">Confirmed violations</div>
        </button>
        <button className={`stat amber ${filter === "needs_review" ? "on" : ""}`} onClick={() => setFilter("needs_review")}>
          <div className="n">{summary.needs_review}</div><div className="l">Needs review (missing data)</div>
        </button>
        <button className={`stat green ${filter === "compliant" ? "on" : ""}`} onClick={() => setFilter("compliant")}>
          <div className="n">{summary.compliant}</div><div className="l">Compliant</div>
        </button>
        <button className={`stat ${filter === "resolved" ? "on" : ""}`} onClick={() => setFilter("resolved")}>
          <div className="n">{summary.resolved}</div><div className="l">Resolved (revoked)</div>
        </button>
      </div>

      <div className="toolbar">
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? "sel" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
        <span className="spacer" />
        <button disabled={busy} onClick={() => switchDataset("demo")}>Demo data</button>
        <button disabled={busy} onClick={() => switchDataset("edge")}>Edge-case stress test</button>
        <button disabled={busy} onClick={() => switchDataset("reset")}>Reset workflow</button>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="card tablewrap" style={{ padding: 4 }}>
        <table>
          <thead>
            <tr><th>Priority</th><th>Who</th><th>Resource</th><th>Role</th><th>Verdict</th><th>Issues</th><th>Expires</th><th>Workflow</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="sub">Nothing in this view.</td></tr>}
            {rows.map((f) => (
              <tr key={f.id} className={`click ${["compliant", "resolved"].includes(f.status) ? "dim" : ""}`} onClick={() => router.push(`/findings/${encodeURIComponent(f.id)}`)}>
                <td><ScoreBar score={f.priorityScore} /></td>
                <td>
                  <Link href={`/findings/${encodeURIComponent(f.id)}`} onClick={(e) => e.stopPropagation()}><b>{f.identity}</b></Link>
                  <div className="sub mono" style={{ margin: 0 }}>{f.itemId} · {f.kind === "delegation" ? "delegated" : f.accessType}</div>
                </td>
                <td>{f.resource}</td>
                <td>{f.role}</td>
                <td><StatusBadge status={f.status} /></td>
                <td><div className="chips">{f.issues.map((i) => <span key={i} className="chip">{ISSUE_LABELS[i] || i}</span>)}</div></td>
                <td className="mono">{fmtDate(f.expiresAt)}</td>
                <td><WorkflowBadge label={f.workflow.label} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
