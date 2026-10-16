
"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge, getJSON } from "./ui";

const EXAMPLES = [
  "Who has admin access?",
  "Show expired visitors",
  "Find Meera",
  "Ownerless grants",
  "Delegations with problems",
];

function ChatLogo({ className = "" }) {
  return (
    <img
      src="/logo.png"
      alt="AccessLease"
      className={className}
    />
  );
}

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask(text) {
    const query = (text ?? q).trim();
    if (query.length < 2 || busy) return;

    setQ("");
    setErr("");
    setMessages((old) => [...old, { type: "user", text: query }]);
    setBusy(true);

    try {
      const out = await getJSON("/api/assistant", {
        method: "POST",
        body: { query },
      });

      setMessages((old) => [
        ...old,
        {
          type: "assistant",
          text: out.answer,
          note: out.note,
          results: out.results || [],
          total: out.total || 0,
        },
      ]);
    } catch (e) {
      setErr(e.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="support-widget">
      {open && (
        <section className="support-panel" aria-label="AccessLease AI chat">
          <header className="support-header">
            <div className="support-avatar">
              <ChatLogo />
            </div>

            <div className="support-heading">
              <strong>AccessLease AI</strong>
              <span>
                <i className="support-online" />
                AI audit assistant
              </span>
            </div>

            <button
              className="support-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          <div className="support-messages">
            {messages.length === 0 && (
              <div className="support-welcome">
                <div className="support-welcome-icon">
                  <ChatLogo />
                </div>

                <h3>Hey there</h3>
                <p>
                  I can help you explore access findings, identify review
                  signals, and search your mock audit register.
                </p>

                <span className="support-label">TRY ASKING</span>

                <div className="support-suggestions">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      onClick={() => ask(example)}
                      disabled={busy}
                    >
                      {example} <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                className={`support-message-row ${message.type}`}
                key={index}
              >
                {message.type === "assistant" && (
                  <span className="support-mini-avatar">
                    <ChatLogo />
                  </span>
                )}

                <div className={`support-bubble ${message.type}`}>
                  {message.type === "user" ? (
                    message.text
                  ) : (
                    <>
                      {message.text && <p>{message.text}</p>}

                      {message.note && (
                        <p className="support-note">{message.note}</p>
                      )}

                      {message.results.length === 0 ? (
                        <p className="support-note">
                          No matching records.
                        </p>
                      ) : (
                        <div className="support-results">
                          <strong>Matching findings</strong>

                          {message.results.map((result) => (
                            <Link
                              key={result.id}
                              href={`/findings/${encodeURIComponent(result.id)}`}
                              onClick={() => setOpen(false)}
                              className="support-result"
                            >
                              <span>
                                <b>{result.identity}</b>
                                <small>
                                  {result.resource} · {result.role}
                                </small>
                              </span>

                              <span className="support-result-score">
                                {result.score}
                              </span>

                              <StatusBadge status={result.status} />
                            </Link>
                          ))}

                          {message.total > message.results.length && (
                            <small className="support-note">
                              Showing {message.results.length} of{" "}
                              {message.total} matches.
                            </small>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="support-message-row assistant">
                <span className="support-mini-avatar">
                  <ChatLogo />
                </span>

                <div className="support-bubble assistant support-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {err && <p className="support-error">{err}</p>}
          </div>

          <form
            className="support-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Ask about access..."
              aria-label="Ask AccessLease AI"
              disabled={busy}
            />

            <button type="submit" disabled={busy || q.trim().length < 2}>
              ↑
            </button>
          </form>

          <div className="support-disclaimer">
            AI-assisted · Verify findings against the evidence
          </div>
        </section>
      )}

      <button
        className={`support-launcher ${open ? "is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close AccessLease AI" : "Open AccessLease AI"}
        title="Ask AccessLease AI"
      >
        {open ? "×" : <ChatLogo />}
        {!open && <span className="support-launcher-dot" />}
      </button>
    </div>
  );
}
