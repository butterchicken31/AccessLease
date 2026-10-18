"use client";

// Company policy workspace: paste policy text, extract candidate rules with the
// existing POST /api/policies/extract endpoint, then review them.
//
// What is and isn't connected:
//   - Extraction IS real: it calls /api/policies/extract.
//   - Editing and approving are NOT persisted. They live in React state in this
//     tab only, and approved rules are not enforced by any audit. The UI says so.
//   - To wire up saving later, give the "Save approved rules" button below a
//     handler that sends rules where status === "approved".

import { useEffect, useMemo, useRef, useState } from "react";
import RuleCard from "./RuleCard";
import styles from "./policy.module.css";
import { describeError, extractPolicy } from "./extractPolicy";
import { SAMPLE_POLICY_TEXT, SAMPLE_RESULT } from "./sampleData";
import {
  POLICY_MAX_CHARS,
  POLICY_MIN_CHARS,
  canApprove,
  fmtCount,
  hasChanged,
  isEdited,
  normalizeRules,
  validatePolicyText,
  viewOf,
} from "./ruleModel";

const STEPS = ["Import policy", "Review candidates", "Approve rules"];

const FILTERS = [
  { key: "all", label: "All candidates", tone: "" },
  { key: "pending", label: "Pending review", tone: "amber" },
  { key: "approved", label: "Approved", tone: "green" },
  { key: "unsupported", label: "Unsupported", tone: "" },
];

function Skeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeleton}>
          <div className={styles.skelLine} style={{ width: "38%" }} />
          <div className={styles.skelLine} style={{ width: "72%", height: 16 }} />
          <div className={styles.skelLine} style={{ width: "94%" }} />
          <div className={styles.skelLine} style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onSample }) {
  return (
    <div className={styles.empty}>
      <svg
        className={styles.emptyIcon}
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
      <h3 className={styles.emptyTitle}>No candidate rules yet</h3>
      <p className={styles.emptyText}>
        Paste your company’s access policy and choose{" "}
        <b>Extract candidate rules</b>. Each rule appears here with the exact
        sentence it came from, so you can check it before it is used.
      </p>
      <p className={styles.emptyText} style={{ marginTop: 14 }}>
        <button type="button" onClick={onSample}>
          Preview with sample results
        </button>
      </p>
    </div>
  );
}

export default function PolicyWorkspace() {
  const [text, setText] = useState("");
  const [rules, setRules] = useState([]);
  const [meta, setMeta] = useState(null); // null until the first result
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [filter, setFilter] = useState("all");
  const [onlyClarify, setOnlyClarify] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  // Cancel any in-flight request if the page is left.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Tick the "how long has this taken" counter while extracting.
  useEffect(() => {
    if (!loading) return undefined;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const announce = (message) => setAnnouncement(message);

  const trimmed = text.trim();
  const hasReviewWork = rules.some(
    (r) => r.status === "approved" || r.edited || r.ack
  );

  const counts = useMemo(() => {
    const c = { all: rules.length, pending: 0, approved: 0, unsupported: 0, clarify: 0 };
    for (const r of rules) {
      c[viewOf(r)] += 1;
      if (r.needsClarification) c.clarify += 1;
    }
    return c;
  }, [rules]);

  const reviewable = counts.pending + counts.approved;
  const allApproved = reviewable > 0 && counts.pending === 0;
  const stage = !meta ? 0 : allApproved ? 3 : 1;
  const stale = meta !== null && meta.extractedText !== trimmed;

  const visible = rules.filter(
    (r) =>
      (filter === "all" || viewOf(r) === filter) &&
      (!onlyClarify || r.needsClarification)
  );

  function resetViewFilters() {
    setFilter("all");
    setOnlyClarify(false);
  }

  // ----- Import actions -----

  async function handleExtract(e) {
    e?.preventDefault?.();
    if (loading) return;

    const problem = validatePolicyText(trimmed);
    if (problem) {
      setFieldError(problem);
      textareaRef.current?.focus();
      return;
    }

    if (
      hasReviewWork &&
      !window.confirm(
        "Extracting again replaces the current candidate rules, including any edits and approvals you’ve made here. Continue?"
      )
    ) {
      return;
    }

    setFieldError("");
    setError(null);
    setElapsed(0);
    setLoading(true);
    announce("Extracting candidate rules. This can take up to a minute.");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await extractPolicy(trimmed, controller.signal);
      const next = normalizeRules(data.rules);

      setRules(next);
      setMeta({
        source: "ai",
        policyName:
          typeof data.policyName === "string" && data.policyName.trim()
            ? data.policyName.trim()
            : "Imported company policy",
        message: typeof data.message === "string" ? data.message : "",
        extractedText: trimmed,
      });
      resetViewFilters();
      announce(
        next.length
          ? `Extracted ${next.length} candidate ${next.length === 1 ? "rule" : "rules"}. None are approved yet.`
          : "Extraction finished, but no rules were found."
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        announce("Extraction cancelled.");
      } else {
        const described = describeError(err);
        setError(described);
        announce(`Extraction failed. ${described.title}.`);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleClear() {
    if (loading) return;
    if (
      hasReviewWork &&
      !window.confirm(
        "Clear the policy text and discard all candidate rules, including your edits and approvals?"
      )
    ) {
      return;
    }
    setText("");
    setRules([]);
    setMeta(null);
    setError(null);
    setFieldError("");
    resetViewFilters();
    announce("Cleared the policy text and results.");
    textareaRef.current?.focus();
  }

  function fillSampleText() {
    if (
      trimmed &&
      trimmed !== SAMPLE_POLICY_TEXT.trim() &&
      !window.confirm("Replace the text in the box with the sample policy?")
    ) {
      return;
    }
    setText(SAMPLE_POLICY_TEXT);
    setFieldError("");
    textareaRef.current?.focus();
  }

  function previewSample() {
    if (
      ((trimmed && trimmed !== SAMPLE_POLICY_TEXT.trim()) || hasReviewWork) &&
      !window.confirm(
        "Load the sample policy and sample results? This replaces the current text and any rules on this page."
      )
    ) {
      return;
    }
    setText(SAMPLE_POLICY_TEXT);
    setRules(normalizeRules(SAMPLE_RESULT.rules));
    setMeta({
      source: "sample",
      policyName: SAMPLE_RESULT.policyName,
      message: SAMPLE_RESULT.message,
      extractedText: SAMPLE_POLICY_TEXT.trim(),
    });
    setError(null);
    setFieldError("");
    resetViewFilters();
    announce(
      "Loaded sample results. They are illustrative and were not extracted from your policy."
    );
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleExtract(e);
  }

  // Select a rule's excerpt inside the policy text box. Returns false if the
  // text is no longer there (for example the reviewer edited the policy).
  function locateExcerpt(excerpt) {
    const el = textareaRef.current;
    if (!el || !excerpt) return false;
    const start = el.value.indexOf(excerpt);
    if (start === -1) return false;
    el.blur();
    el.setSelectionRange(start, start + excerpt.length);
    el.focus(); // focusing after selecting scrolls the selection into view
    return true;
  }

  // ----- Review actions (local state only; nothing is sent anywhere) -----

  const patchRule = (id, fn) =>
    setRules((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

  const find = (id) => rules.find((r) => r.id === id);

  function approve(id) {
    const r = find(id);
    if (!r || !canApprove(r)) return;
    patchRule(id, (x) => (canApprove(x) ? { ...x, status: "approved" } : x));
    announce(
      `Approved “${r.title}”. This is local only; nothing is saved or enforced.`
    );
  }

  function returnToReview(id) {
    const r = find(id);
    if (!r) return;
    patchRule(id, (x) => ({ ...x, status: "pending" }));
    announce(`Returned “${r.title}” to review.`);
  }

  function setAck(id, value) {
    patchRule(id, (x) => ({ ...x, ack: value }));
  }

  function saveEdits(id, value) {
    const r = find(id);
    if (!r) return;
    if (!hasChanged(r, value)) {
      announce("No changes to save.");
      return;
    }
    patchRule(id, (x) => {
      const next = { ...x, ...value, status: "pending", ack: false };
      return { ...next, edited: isEdited(next) };
    });
    announce(
      r.status === "approved"
        ? `Saved changes to “${value.title}”. Its approval was cleared, so review it again.`
        : `Saved changes to “${value.title}”.`
    );
  }

  function revert(id) {
    const r = find(id);
    if (!r) return;
    patchRule(id, (x) => ({
      ...x,
      ...x.original,
      status: "pending",
      ack: false,
      edited: false,
    }));
    announce(`Restored the extracted version of “${r.title}”.`);
  }

  // ----- Render -----

  const countClass =
    trimmed.length > POLICY_MAX_CHARS
      ? styles.countOver
      : trimmed.length > 0 && trimmed.length < POLICY_MIN_CHARS
        ? styles.countWarn
        : "";

  return (
    <>
      <div className={styles.compactHero}>
      <section className="hero">
        <div>
          <h1>Company policy</h1>
          <p>
            Paste your written access policy and AccessLease suggests candidate
            rules, each tied to the sentence it came from. Review, edit and
            approve them before anything is relied on.
          </p>
          <div className="hero-meta">
            <span className="pill">AI-assisted extraction</span>
            <span className="pill">Human review required</span>
            <span className="pill">Approvals not saved or enforced yet</span>
          </div>
        </div>
      </section>
      </div>

      <div className="steps" role="list" aria-label="Progress">
        {STEPS.map((label, i) => (
          <div
            key={label}
            role="listitem"
            className={`step ${i < stage ? "done" : ""} ${i === stage ? "now" : ""}`}
            aria-current={i === stage ? "step" : undefined}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className={styles.layout}>
        {/* ---------- Import ---------- */}
        <section
          className={`card ${styles.importPanel}`}
          aria-labelledby="policy-import-title"
        >
          <h2 id="policy-import-title" className={styles.panelTitle}>
            Import policy text
          </h2>
          <p className={styles.helpText} id="policy-help">
            Paste your access or security policy. It’s sent to the AI extraction
            service, so leave out credentials and personal data.
          </p>

          <form onSubmit={handleExtract} noValidate>
            <label htmlFor="policy-text">Policy text</label>
            <textarea
              id="policy-text"
              ref={textareaRef}
              className={styles.policyInput}
              value={text}
              readOnly={loading}
              onChange={(e) => {
                setText(e.target.value);
                if (fieldError) setFieldError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="Paste your company’s access or security policy here…"
              aria-describedby={`policy-help policy-count${fieldError ? " policy-error" : ""}`}
              aria-invalid={fieldError ? true : undefined}
              spellCheck={false}
            />

            <div className={styles.countRow}>
              <span id="policy-count" className={countClass}>
                {fmtCount(trimmed.length)} / {fmtCount(POLICY_MAX_CHARS)} characters
              </span>
              <span>Minimum {POLICY_MIN_CHARS}</span>
            </div>

            {fieldError && (
              <p id="policy-error" className={styles.fieldError} role="alert">
                {fieldError}
              </p>
            )}

            <div className={styles.actionsRow}>
              <button
                type="submit"
                className={`primary ${loading ? styles.btnBusy : ""}`}
                aria-disabled={loading ? true : undefined}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Extracting…
                  </>
                ) : (
                  "Extract candidate rules"
                )}
              </button>

              {loading && (
                <button type="button" onClick={handleCancel}>
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={handleClear}
                disabled={loading || (!text && !meta)}
              >
                Clear
              </button>
            </div>
          </form>

          <p className={styles.shortcut}>
            Tip: press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (<kbd>⌘</kbd> +{" "}
            <kbd>Enter</kbd> on Mac) to extract.
          </p>

          <div className={styles.tryRow}>
            <span>No policy handy?</span>
            <button
              type="button"
              className={styles.btnSm}
              onClick={fillSampleText}
              disabled={loading}
            >
              Use sample policy
            </button>
            <button
              type="button"
              className={styles.btnSm}
              onClick={previewSample}
              disabled={loading}
            >
              Preview sample results
            </button>
          </div>
        </section>

        {/* ---------- Results ---------- */}
        <section
          className={styles.results}
          aria-labelledby="policy-results-title"
          aria-busy={loading}
        >
          <h2 id="policy-results-title" className={styles.resultsTitle}>
            Candidate rules
          </h2>

          {loading && (
            <>
              <p className={styles.loadingNote}>
                <span className={styles.spinner} aria-hidden="true" />
                <span>
                  Extracting candidate rules… {elapsed}s. This can take up to a
                  minute.
                </span>
              </p>
              <Skeleton />
            </>
          )}

          {!loading && error && (
            <div className={styles.errorBox} role="alert">
              <h3 className={styles.errorTitle}>
                <span aria-hidden="true">✕ </span>
                {error.title}
              </h3>
              <p className={styles.errorText}>{error.message}</p>
              {error.hint && <p className={styles.errorHint}>{error.hint}</p>}
              <div className={styles.actionsRow}>
                <button type="button" className="primary" onClick={handleExtract}>
                  Try again
                </button>
                {error.setup && (
                  <button type="button" onClick={previewSample}>
                    Preview sample results
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && !meta && !error && <EmptyState onSample={previewSample} />}

          {!loading && meta && rules.length === 0 && (
            <div className={styles.empty}>
              <h3 className={styles.emptyTitle}>No access rules found</h3>
              <p className={styles.emptyText}>
                The extractor didn’t find any rules it could tie to this text.
                Check that you pasted the policy itself, or try a more specific
                section.
              </p>
            </div>
          )}

          {!loading && meta && rules.length > 0 && (
            <>
              <div className={styles.metaRow}>
                <span
                  className={`${styles.sourcePill} ${
                    meta.source === "sample"
                      ? styles.sourceSample
                      : styles.sourceAi
                  }`}
                >
                  {meta.source === "sample" ? "Sample data" : "AI extraction"}
                </span>
                <span className={styles.policyName}>{meta.policyName}</span>
              </div>

              {meta.source === "sample" ? (
                <div className={`${styles.notice} ${styles.noticeSample}`}>
                  <span className={styles.noticeIcon} aria-hidden="true">
                    ⚠
                  </span>
                  <p>
                    <b>Sample data.</b> These candidates are illustrative. They
                    were not extracted from your policy.
                  </p>
                </div>
              ) : (
                <div className={styles.success}>
                  <span aria-hidden="true">✓</span>
                  <span>
                    Extraction complete: {rules.length} candidate{" "}
                    {rules.length === 1 ? "rule" : "rules"} found.
                  </span>
                </div>
              )}

              <div className={styles.notice}>
                <span className={styles.noticeIcon} aria-hidden="true">
                  ⓘ
                </span>
                <p>
                  {meta.message || "Review every candidate rule before use."}{" "}
                  Edits and approvals stay in this browser tab. Saving them and
                  enforcing rules in audits isn’t connected yet, so audit
                  results are unchanged.
                </p>
              </div>

              {stale && (
                <div className={`${styles.notice} ${styles.noticeStale}`}>
                  <span className={styles.noticeIcon} aria-hidden="true">
                    ⚠
                  </span>
                  <p>
                    The policy text has changed since these rules were
                    extracted. Run extraction again to refresh them.
                  </p>
                </div>
              )}

              <p className={styles.progressLine}>
                {counts.approved} of {reviewable} supported{" "}
                {reviewable === 1 ? "rule" : "rules"} approved (local only)
              </p>

              <div className={styles.stats} role="group" aria-label="Filter rules">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`stat ${f.tone} ${filter === f.key ? "on" : ""}`}
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    <span className={`n ${styles.statN}`}>{counts[f.key]}</span>
                    <span className={`l ${styles.statL}`}>{f.label}</span>
                  </button>
                ))}
              </div>

              <div className="toolbar">
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={onlyClarify}
                    onChange={(e) => setOnlyClarify(e.target.checked)}
                  />
                  Needs clarification only ({counts.clarify})
                </label>
                <span className={styles.grow} />
                <span id="save-note" className={styles.saveNote}>
                  Saving isn’t connected yet
                </span>
                <button type="button" disabled aria-describedby="save-note">
                  Save approved rules
                </button>
              </div>

              {visible.length === 0 ? (
                <div className={styles.empty}>
                  <h3 className={styles.emptyTitle}>No rules match these filters</h3>
                  <p className={styles.emptyText}>
                    <button type="button" onClick={resetViewFilters}>
                      Show all candidates
                    </button>
                  </p>
                </div>
              ) : (
                <ol className={styles.ruleList} aria-label="Candidate rules">
                  {visible.map((rule) => (
                    <li key={rule.id}>
                      <RuleCard
                        rule={rule}
                        onApprove={approve}
                        onReturnToReview={returnToReview}
                        onAck={setAck}
                        onSaveEdits={saveEdits}
                        onRevert={revert}
                        onLocate={locateExcerpt}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>

      {/* Screen-reader announcements for actions that have no other feedback. */}
      <div
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </>
  );
}
