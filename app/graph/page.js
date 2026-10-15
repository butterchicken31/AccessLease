"use client";
// Permission graph: identities (left) -> resources (right). Line colour = verdict. Dashed = delegated.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getJSON } from "../../components/ui";

const COLORS = { violation: "#c4262e", needs_review: "#e08a00", compliant: "#2e9b5a", resolved: "#8a96a6" };
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function GraphPage() {
  const router = useRouter();
  const [g, setG] = useState(null);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState(null);
  const [onlyBad, setOnlyBad] = useState(false);

  useEffect(() => { getJSON("/api/graph").then(setG).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!g) return <p className="sub">Loading…</p>;

  const edges = g.edges.filter((e) => !onlyBad || ["violation", "needs_review"].includes(e.status));
  const idIds = new Set(edges.map((e) => e.from));
  const rsIds = new Set(edges.map((e) => e.to));
  const ids = g.identities.filter((i) => idIds.has(i.id));
  const rss = g.resources.filter((r) => rsIds.has(r.id));
  const rowH = 44, top = 24, W = 900, xL = 230, xR = 670;
  const H = Math.max(ids.length, rss.length) * rowH + top + 20;
  const yOf = (list, id) => top + list.findIndex((n) => n.id === id) * rowH + 14;

  return (
    <>
      <h1>Permission graph</h1>
      <p className="sub">Who can reach what. Click a line to open its finding.</p>
      <div className="legend">
        <span><i style={{ borderColor: COLORS.violation }} />Confirmed violation</span>
        <span><i style={{ borderColor: COLORS.needs_review }} />Needs review</span>
        <span><i style={{ borderColor: COLORS.compliant }} />Compliant</span>
        <span><i style={{ borderColor: COLORS.resolved }} />Revoked</span>
        <span><i style={{ borderColor: "#888", borderTopStyle: "dashed" }} />Delegated access</span>
        <label style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" style={{ width: "auto" }} checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> Show only problems</label>
      </div>
      <div className="card tablewrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640 }} role="img" aria-label="Permission graph">
          {edges.map((e) => {
            const y1 = yOf(ids, e.from), y2 = yOf(rss, e.to);
            const on = hover === e.findingId;
            return (
              <path key={e.findingId} d={`M ${xL} ${y1} C ${(xL + xR) / 2} ${y1}, ${(xL + xR) / 2} ${y2}, ${xR} ${y2}`}
                fill="none" stroke={COLORS[e.status]} strokeWidth={on ? 5 : 2.5} strokeDasharray={e.kind === "delegation" ? "7 5" : undefined}
                opacity={hover && !on ? 0.25 : 0.9} style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(e.findingId)} onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/findings/${encodeURIComponent(e.findingId)}`)}>
                <title>{`${e.itemId} · ${e.role} · ${e.status} · score ${e.score}`}</title>
              </path>
            );
          })}
          {ids.map((n) => (
            <g key={n.id}>
              <text x={xL - 10} y={yOf(ids, n.id) + 4} textAnchor="end" fontSize="13" fontWeight="600">{short(n.name, 24)}</text>
              <text x={xL - 10} y={yOf(ids, n.id) + 18} textAnchor="end" fontSize="10" opacity="0.6">{n.type}{n.status === "inactive" ? " · INACTIVE" : ""}</text>
              <circle cx={xL} cy={yOf(ids, n.id)} r="6" fill={n.status === "inactive" ? "#c4262e" : "#1f4fd8"} />
            </g>
          ))}
          {rss.map((n) => (
            <g key={n.id}>
              <circle cx={xR} cy={yOf(rss, n.id)} r="6" fill="#17202b" />
              <text x={xR + 12} y={yOf(rss, n.id) + 4} fontSize="13" fontWeight="600">{short(n.name, 26)}</text>
              <text x={xR + 12} y={yOf(rss, n.id) + 18} fontSize="10" opacity="0.6">sensitivity {n.sensitivity ?? "?"}/3</text>
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}
