"use client";
// Finding detail: evidence, policy explanation (Deliverable 2) and the simulated revocation workflow.
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusBadge, WorkflowBadge, ISSUE_LABELS, fmtDate, getJSON } from "../../../components/ui";

const PATH = [
  { key: "flagged", label: "Flagged" },
  { key: "owner_notified", label: "Owner notified" },
  { key: "grace_period", label: "Grace period" },
  { key: "revoked", label: "Revoked" },
];
const BANNER = {
  violation: ["red", "Confirmed violation: the recorded data proves a policy rule is broken."],
  needs_review: ["amber", "Needs review: data is missing or unverifiable, so this is NOT a confirmed violation. A human must check."],
  compliant: ["green", "Compliant: no rule broken and no required data missing."],
  resolved: ["grey", "Resolved: this access has been revoked."],
};

export default function FindingPage() {
  const params = useParams();
  const id = decodeURIComponent(params.id);
  const [f, setF] = useState(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setF(await getJSON(`/api/findings/${encodeURIComponent(id)}`)); setErr(""); } catch (e) { setErr(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const out = await getJSON("/api/review", { method: "POST", body: { findingId: f.id, action: selected.action, reviewer, reason, newExpiry: selected.needsExpiry ? newExpiry : undefined } });
      setMsg({ ok: true, text: `Done: ${selected.label}. Recorded in the audit log as entry #${out.entry.seq}.`, extra: out.newViolations });
      setSelected(null); setReason(""); setNewExpiry("");
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  if (err) return <><p className="err">{err}</p><Link href="/">← Back to queue</Link></>;
  if (!f) return <p className="sub">Loading…</p>;

  const [tone, bannerText] = BANNER[f.status];
  const idx = PATH.findIndex((p) => p.key === f.workflow.state);
  const sideState = idx === -1 && f.workflow.state !== "none";

  return (
    <>
      <p><Link href="/">← Back to queue</Link></p>
      <h1>{f.identity} → {f.resource}</h1>
      <p className="sub"><span className="mono">{f.itemId}</span> · {f.role} · {f.kind === "delegation" ? "delegated access" : `${f.accessType} grant`}</p>
      <div className={`banner ${tone}`}>{bannerText}</div>

      <div className="cols">
        <div>
          <div className="card">
            <h2>Why this was flagged</h2>
            <p style={{ marginTop: 0 }}>{f.explanation}</p>
            <p className="sub" style={{ marginBottom: 0 }}><b>Recommended:</b> {f.recommendation}</p>
          </div>

          <div className="card">
            <h2>Policy checks and evidence</h2>
            {f.checks.length === 0 && <p className="sub">No checks failed.</p>}
            {f.checks.map((c, i) => (
              <div key={i} className={`check ${c.verdict}`}>
                <div className="rule">
                  <b>{c.rule}</b> · {c.ruleTitle} · {c.verdict === "violation" ? "Confirmed violation" : "Needs review"} · severity {c.severity}/10
                </div>
                <div>{c.message}</div>
                <ul className="ev">{c.evidence.map((e, j) => <li key={j} className="mono">{e}</li>)}</ul>
                {c.ruleText && <div className="sub" style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>Policy says: {c.ruleText}</div>}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Why this priority score ({f.priorityScore}/100)</h2>
            {f.scoreBreakdown.parts.map((p) => (
              <div key={p.label} className="pbar">
                <span>{p.label} <span className="sub">(weight {Math.round(p.weight * 100)}%)</span></span>
                <span className="mono">{Math.round(p.value * 100)}%</span>
              </div>
            ))}
            <p className="sub" style={{ marginBottom: 0 }}>{f.scoreBreakdown.note}</p>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Record</h2>
            <dl className="kv">
              <dt>Identity</dt><dd>{f.identity} <span className="chip">{f.identityType}</span></dd>
              <dt>Resource</dt><dd>{f.resource}</dd>
              <dt>Role</dt><dd>{f.role}</dd>
              <dt>Owner</dt><dd>{f.owner || <i>none recorded</i>}</dd>
              <dt>Purpose</dt><dd>{f.purpose || <i>none recorded</i>}</dd>
              <dt>Granted</dt><dd className="mono">{fmtDate(f.grantedAt)}</dd>
              <dt>Expires</dt><dd className="mono">{fmtDate(f.expiresAt)}</dd>
              <dt>Issues</dt><dd><div className="chips">{f.issues.length ? f.issues.map((i) => <span key={i} className="chip">{ISSUE_LABELS[i] || i}</span>) : "—"}</div></dd>
              {f.missingFields.length > 0 && (<><dt>Missing</dt><dd className="mono">{f.missingFields.join(", ")}</dd></>)}
              {f.chain.length > 1 && (<><dt>Chain</dt><dd className="mono">{f.chain.join(" → ")}</dd></>)}
            </dl>
          </div>

          <div className="card">
            <h2>Revocation workflow</h2>
            <div className="steps">
              {PATH.map((p, i) => (
                <div key={p.key} className={`step ${i < idx ? "done" : ""} ${i === idx ? "now" : ""}`}>{p.label}</div>
              ))}
            </div>
            {sideState && <p>Current state: <WorkflowBadge label={f.workflow.label} /></p>}

            {f.allowedActions.length === 0 ? (
              <p className="sub" style={{ marginBottom: 0 }}>No actions available in this state.</p>
            ) : (
              <>
                <div className="actions">
                  {f.allowedActions.map((a) => (
                    <button key={a.action} className={`${a.tone === "danger" ? "danger" : ""} ${selected?.action === a.action ? "sel" : ""}`} onClick={() => { setSelected(a); setMsg(null); }}>
                      {a.label}
                    </button>
                  ))}
                </div>
                {selected && (
                  <div style={{ marginTop: 6 }}>
                    <label htmlFor="rv">Your name</label>
                    <input id="rv" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer name" />
                    <label htmlFor="rs">Reason (goes in the audit log)</label>
                    <textarea id="rs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you doing this?" />
                    {selected.needsExpiry && (<><label htmlFor="ne">New expiry date (max 30 days from the audit date)</label><input id="ne" type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} /></>)}
                    <p style={{ marginBottom: 0 }}>
                      <button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : `Confirm: ${selected.label}`}</button>
                    </p>
                  </div>
                )}
              </>
            )}
            {msg && (
              <p className={msg.ok ? "" : "err"} style={{ marginBottom: 0 }}>
                {msg.text}
                {msg.ok && msg.extra?.length > 0 && <> Side effect: this made other access invalid: <b>{msg.extra.join(", ")}</b>.</>}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
