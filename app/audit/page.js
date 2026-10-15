"use client";
// Audit log (Deliverable 3): every reviewer decision, hash-chained so edits are detectable.
import { useEffect, useState } from "react";
import { getJSON } from "../../components/ui";

export default function AuditPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tamper, setTamper] = useState(null);

  useEffect(() => { getJSON("/api/audit").then(setData).catch((e) => setErr(e.message)); }, []);
  async function runTamper() {
    try { const d = await getJSON("/api/audit?tamper=1"); setTamper(d.tamperTest); } catch (e) { setErr(e.message); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="sub">Loading…</p>;

  return (
    <>
      <h1>Audit log</h1>
      <p className="sub">Every reviewer decision and data change, newest first. Each entry stores a fingerprint of the previous one, so changing history breaks the chain.</p>
      <div className="toolbar">
        <span className={`badge ${data.chainValid ? "b-green" : "b-red"}`}>{data.chainValid ? "Chain verified: no tampering" : `Chain broken at entry #${data.brokenAt}`}</span>
        <button onClick={runTamper}>Simulate tampering with an old entry</button>
        {tamper && <span className={tamper.valid ? "" : "err"}>{tamper.valid ? "Edit not detected (unexpected)" : `Edit detected: chain breaks at entry #${tamper.brokenAt}`}</span>}
      </div>

      <div className="card tablewrap" style={{ padding: 4 }}>
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Reviewer</th><th>Action</th><th>Item</th><th>State change</th><th>Reason</th><th>Data change</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {data.entries.length === 0 && <tr><td colSpan={9} className="sub">No decisions yet. Review a finding to create the first entry.</td></tr>}
            {data.entries.map((e) => (
              <tr key={e.seq}>
                <td className="mono">{e.seq}</td>
                <td className="mono">{e.ts.replace("T", " ").slice(0, 19)}</td>
                <td>{e.reviewer}</td>
                <td><span className="chip">{e.action}</span></td>
                <td className="mono">{e.itemId}</td>
                <td className="mono">{e.fromState} → {e.toState}</td>
                <td>{e.reason}</td>
                <td className="mono">{e.changes?.length ? e.changes.map((c, i) => <div key={i}>{c.field}: {c.before} → {c.after}</div>) : "—"}</td>
                <td className="mono" title={e.hash}>{e.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
