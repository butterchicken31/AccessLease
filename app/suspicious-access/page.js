
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  StatusBadge,
  ScoreBar,
} from "../../components/ui";

export default function SuspiciousAccessPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/suspicious-access")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load detections");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="sub">Loading access signals...</p>;

  return (
    <>
      <section className="hero">
        <div>
          <h1>Suspicious Access Signals</h1>
          <p>
            Find access records that may need additional security review.
          </p>
          <div className="hero-meta">
            <span className="pill">{data.dataset.name}</span>
            <span className="pill">
              Checked {data.asOf.slice(0, 10)}
            </span>
            <span className="pill">
              {data.total} records flagged for review
            </span>
          </div>
        </div>
      </section>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3>How to interpret these results</h3>
        <p className="sub">{data.disclaimer}</p>
        <p className="sub">
          Signals are based on existing policy findings and recorded access
          data. Review the evidence before taking action.
        </p>
      </div>

      <h2>Detection results</h2>

      <div className="card tablewrap" style={{ padding: 4 }}>
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Identity</th>
              <th>Resource</th>
              <th>Signals</th>
              <th>Verdict</th>
              <th>Review</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data.detections.length === 0 && (
              <tr>
                <td colSpan={7} className="sub">
                  No matching signals found in this dataset.
                </td>
              </tr>
            )}

            {data.detections.map((item) => (
              <tr key={item.id}>
                <td><ScoreBar score={item.priorityScore} /></td>
                <td>
                  <b>{item.identity}</b>
                  <div className="sub mono">{item.itemId}</div>
                </td>
                <td>
                  {item.resource}
                  <div className="sub">{item.role}</div>
                </td>
                <td>
                  <div className="chips">
                    {item.signals.map((signal) => (
                      <span className="chip" key={signal.code}>
                        {signal.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td><StatusBadge status={item.status} /></td>
                <td>{item.reviewState}</td>
                <td>
                  <Link href={`/findings/${encodeURIComponent(item.id)}`}>
                    Review finding →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
