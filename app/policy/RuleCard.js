"use client";

// One candidate rule: its source excerpt, confidence, clarification warning and
// the review controls (edit / approve). Review state lives in the parent and is
// held in memory only. Nothing here calls a backend.

import { useEffect, useRef, useState } from "react";
import styles from "./policy.module.css";
import {
  RULE_TYPES,
  RULE_TYPE_LABELS,
  DESCRIPTION_MAX,
  TITLE_MAX,
  canApprove,
  formatParam,
  parametersToText,
  validateDraft,
  viewOf,
  fmtCount,
} from "./ruleModel";

// Every state has a text label and a glyph as well as a colour.
const VIEW = {
  pending: { label: "Pending review", glyph: "◔", cls: styles.badgePending },
  approved: {
    label: "Approved · local only",
    glyph: "✓",
    cls: styles.badgeApproved,
  },
  unsupported: { label: "Unsupported", glyph: "⊘", cls: styles.badgeUnsupported },
};

const CONFIDENCE = {
  high: { label: "High confidence", bars: 3 },
  medium: { label: "Medium confidence", bars: 2 },
  low: { label: "Low confidence", bars: 1 },
};

function Confidence({ level }) {
  const c = CONFIDENCE[level] || CONFIDENCE.low;
  return (
    <span className={`${styles.conf} ${level === "low" ? styles.confLow : ""}`}>
      <span className={styles.confBars} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= c.bars ? styles.confOn : undefined} />
        ))}
      </span>
      {c.label}
    </span>
  );
}

export default function RuleCard({
  rule,
  onApprove,
  onReturnToReview,
  onAck,
  onSaveEdits,
  onRevert,
  onLocate,
}) {
  const view = viewOf(rule);
  const status = VIEW[view];
  const unsupported = view === "unsupported";
  const approvable = canApprove(rule);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [locateMsg, setLocateMsg] = useState("");

  const editBtnRef = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const paramsRef = useRef(null);
  const wasEditing = useRef(false);

  // Move focus into the form when it opens, and back to "Edit" when it closes.
  useEffect(() => {
    if (editing && !wasEditing.current) titleRef.current?.focus();
    if (!editing && wasEditing.current) editBtnRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const idBase = rule.id;
  const hintId = `${idBase}-hint`;

  function openEdit() {
    setDraft({
      title: rule.title,
      description: rule.description,
      ruleType: rule.ruleType,
      parametersText: parametersToText(rule.parameters),
    });
    setErrors({});
    setEditing(true);
  }

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function submitEdit(e) {
    e.preventDefault();
    const { errors: found, value } = validateDraft(draft);
    const keys = Object.keys(found);

    if (keys.length) {
      setErrors(found);
      const target = { title: titleRef, description: descRef, parameters: paramsRef }[
        keys[0]
      ];
      target?.current?.focus();
      return;
    }

    onSaveEdits(rule.id, value);
    setEditing(false);
  }

  function handleLocate() {
    const found = onLocate(rule.sourceExcerpt);
    setLocateMsg(
      found ? "" : "Couldn’t find this excerpt in the current policy text."
    );
  }

  let hint = "";
  if (unsupported) hint = "Unsupported rules can’t be approved.";
  else if (view === "approved")
    hint = "Approved here only. Not saved or enforced.";
  else if (!approvable) hint = "Confirm the clarification above to approve.";

  return (
    <article
      className={`${styles.rule} ${styles[`rule_${view}`]}`}
      aria-labelledby={`${idBase}-title`}
    >
      <div className={styles.ruleMeta}>
        <span className="chip mono">{rule.id}</span>
        <span className="chip">{RULE_TYPE_LABELS[rule.ruleType]}</span>
        {rule.edited && <span className="chip">Edited</span>}
        <Confidence level={rule.confidence} />
        <span className={styles.grow} />
        <span className={`badge ${status.cls}`}>
          <span aria-hidden="true">{status.glyph} </span>
          {status.label}
        </span>
      </div>

      <h3 id={`${idBase}-title`} className={styles.ruleTitle}>
        {rule.title}
      </h3>
      {rule.description && <p className={styles.ruleDesc}>{rule.description}</p>}

      <div className={styles.sectionLabel}>
        <span>Source excerpt</span>
        {rule.excerptVerified && (
          <button
            type="button"
            className={styles.btnSm}
            onClick={handleLocate}
            aria-label={`Find the excerpt for ${rule.id} in the policy text`}
          >
            Find in policy
          </button>
        )}
      </div>
      {rule.excerptVerified ? (
        <blockquote className={styles.excerpt}>“{rule.sourceExcerpt}”</blockquote>
      ) : (
        <p className={styles.excerptMissing}>
          <b>Source not verified.</b> The quoted text couldn’t be found in your
          policy, so there is no evidence for this rule. Check it carefully
          before approving.
        </p>
      )}
      {locateMsg && (
        <p className={styles.locateMsg} role="status">
          {locateMsg}
        </p>
      )}

      <div className={styles.sectionLabel}>
        <span>Parameters</span>
      </div>
      {Object.keys(rule.parameters).length ? (
        <ul className={styles.params}>
          {Object.entries(rule.parameters).map(([k, v]) => (
            <li key={k} className={`${styles.param} mono`}>
              <span className={styles.paramKey}>{k}:</span> {formatParam(v)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noParams}>
          None stated in the policy. Nothing has been assumed.
        </p>
      )}

      {rule.needsClarification && (
        <div className={styles.clarify}>
          <div className={styles.clarifyHead}>
            <span aria-hidden="true">⚠ </span>Needs clarification
          </div>
          <p className={styles.clarifyText}>
            {rule.clarificationQuestion ||
              (rule.excerptVerified
                ? "The extractor flagged this rule for a human to check before it is used."
                : "No verified source text backs this rule, so a human needs to confirm it is real.")}
          </p>
          {!unsupported && (
            <label className={`${styles.checkLabel} ${styles.clarifyAck}`}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={rule.ack}
                disabled={view === "approved" || editing}
                onChange={(e) => onAck(rule.id, e.target.checked)}
              />
              I’ve reviewed this and it’s resolved
            </label>
          )}
        </div>
      )}

      {unsupported && (
        <p className={styles.unsupportedNote}>
          <b>Not enforceable.</b> This doesn’t map to a rule type AccessLease can
          check, so it can’t be approved. If the extractor got the type wrong,
          edit the rule and choose a supported one.
        </p>
      )}

      {editing ? (
        <form className={styles.editForm} onSubmit={submitEdit} noValidate>
          <label htmlFor={`${idBase}-f-title`}>Title</label>
          <input
            id={`${idBase}-f-title`}
            ref={titleRef}
            value={draft.title}
            onChange={(e) => setField("title", e.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${idBase}-e-title` : undefined}
            className={errors.title ? styles.invalid : undefined}
          />
          {errors.title && (
            <p id={`${idBase}-e-title`} className={styles.fieldError} role="alert">
              {errors.title}
            </p>
          )}

          <label htmlFor={`${idBase}-f-type`}>Rule type</label>
          <select
            id={`${idBase}-f-type`}
            value={draft.ruleType}
            onChange={(e) => setField("ruleType", e.target.value)}
          >
            {RULE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <label htmlFor={`${idBase}-f-desc`}>Description</label>
          <textarea
            id={`${idBase}-f-desc`}
            ref={descRef}
            className={`${styles.editDesc} ${errors.description ? styles.invalid : ""}`}
            value={draft.description}
            onChange={(e) => setField("description", e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? `${idBase}-e-desc` : undefined}
          />
          {errors.description && (
            <p id={`${idBase}-e-desc`} className={styles.fieldError} role="alert">
              {errors.description}
            </p>
          )}

          <label htmlFor={`${idBase}-f-params`}>Parameters (JSON)</label>
          <textarea
            id={`${idBase}-f-params`}
            ref={paramsRef}
            className={`mono ${styles.editParams} ${errors.parameters ? styles.invalid : ""}`}
            value={draft.parametersText}
            onChange={(e) => setField("parametersText", e.target.value)}
            spellCheck={false}
            aria-invalid={errors.parameters ? true : undefined}
            aria-describedby={`${idBase}-h-params${errors.parameters ? ` ${idBase}-e-params` : ""}`}
          />
          <p id={`${idBase}-h-params`} className={styles.fieldHelp}>
            Only values stated in the policy. Use {"{}"} for none. Limits: title{" "}
            {TITLE_MAX} characters, description {fmtCount(DESCRIPTION_MAX)}.
          </p>
          {errors.parameters && (
            <p id={`${idBase}-e-params`} className={styles.fieldError} role="alert">
              {errors.parameters}
            </p>
          )}

          <p className={styles.fieldHelp}>
            The source excerpt is evidence and can’t be edited. Changing a rule
            clears its approval and confirmation.
          </p>

          <div className={styles.actionsRow}>
            <button type="submit" className="primary">
              Save changes
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {rule.edited && (
              <button
                type="button"
                onClick={() => {
                  onRevert(rule.id);
                  setEditing(false);
                }}
              >
                Revert to extracted version
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className={styles.ruleActions}>
          <button
            type="button"
            ref={editBtnRef}
            onClick={openEdit}
            aria-label={`Edit rule: ${rule.title}`}
          >
            Edit rule
          </button>

          {view === "approved" ? (
            <button
              type="button"
              onClick={() => onReturnToReview(rule.id)}
              aria-label={`Return to review: ${rule.title}`}
              aria-describedby={hintId}
            >
              Return to review
            </button>
          ) : (
            <button
              type="button"
              className={approvable ? "primary" : undefined}
              disabled={!approvable}
              onClick={() => onApprove(rule.id)}
              aria-label={`Approve rule: ${rule.title}`}
              aria-describedby={hint ? hintId : undefined}
            >
              Approve rule
            </button>
          )}

          {hint && (
            <span id={hintId} className={styles.hint}>
              {hint}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
