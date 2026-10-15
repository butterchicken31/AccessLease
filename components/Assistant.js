"use client";
// "Ask AccessLease" box: search people, resources and findings in plain English.
import { useState } from "react";
import Link from "next/link";
import { StatusBadge, getJSON } from "./ui";

const EXAMPLES = ["Who has admin access?", "Show expired visitors", "Find Meera", "Ownerless grants", "Delegations with problems"];

export default function Assistant() {
  const [q, setQ] = useState("");
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(text) {
    const query = (text ?? q).trim();
    if (query.length < 2) return;
    setQ(query); setBusy(true); setErr("");
    try { setOut(await getJSON("/api/assistant", { method: "POST", body: { query } })); }
    catch (e) { setErr(e.message); setOut(null); }
    finally { setBusy(false); }
  }

  return (
    <section className="card assistant" aria-label="Ask AccessLease">
      <h2>Ask AccessLease</h2>
      <div className="ask-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Search people, resources or problems, e.g. “who has admin access?”" aria-label="Ask a question" />
        <button className="primary" disabled={busy || q.trim().length < 2} onClick={() => ask()}>{busy ? "Searching…" : "Ask"}</button>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        {EXAMPLES.map((e) => <button key={e} className="chipbtn" onClick={() => ask(e)}>{e}</button>)}
      </div>

      {err && <p className="err">{err}</p>}
      {out && (
        <div className="ask-out">
          {out.answer && (
            <div className="ai-answer">
              <span className="badge b-blue">AI-assisted · verify in the evidence</span>
              <p>{out.answer}</p>
            </div>
          )}
          {out.note && <p className="sub">{out.note}</p>}
          {out.results.length === 0 ? <p className="sub">No matching records.</p> : (
            <ul className="ask-list">
              {out.results.map((r) => (
                <li key={r.id}>
                  <Link href={`/findings/${encodeURIComponent(r.id)}`}><b>{r.identity}</b> → {r.resource}</Link>
                  <span className="sub"> · {r.role} · {r.identityType} · score {r.score}</span> <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
          {out.total > out.results.length && <p className="sub">Showing {out.results.length} of {out.total} matches.</p>}
        </div>
      )}
    </section>
  );
}
