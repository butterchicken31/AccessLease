// Pure helpers for the Company policy page: rule types, normalisation of the
// extraction response, and validation of reviewer edits. No React in here, so
// it can be tested on its own.

// Mirrors SUPPORTED_RULE_TYPES in app/api/policies/extract/route.js.
// If the endpoint gains a rule type, add it here so it gets a readable label.
export const RULE_TYPES = [
  { value: "expiry", label: "Expiry required" },
  { value: "required_metadata", label: "Required metadata" },
  { value: "owner", label: "Owner required" },
  { value: "least_privilege", label: "Least privilege" },
  { value: "maximum_duration", label: "Maximum duration" },
  { value: "inactive_identity", label: "Inactive identity" },
  { value: "delegation", label: "Delegation" },
  { value: "duplicate_records", label: "Duplicate records" },
  { value: "unsupported", label: "Unsupported" },
];

export const RULE_TYPE_LABELS = Object.fromEntries(
  RULE_TYPES.map((t) => [t.value, t.label])
);

// Limits enforced by the endpoint (checked against the trimmed text).
export const POLICY_MIN_CHARS = 50;
export const POLICY_MAX_CHARS = 30000;

// Field limits the endpoint applies to each rule; edits respect them too.
export const TITLE_MAX = 160;
export const DESCRIPTION_MAX = 1000;

export const fmtCount = (n) => Number(n).toLocaleString("en-US");

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const str = (v) => (typeof v === "string" ? v.trim() : "");

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isPlainObject(v)) {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])])
    );
  }
  return v;
}

// Order-independent JSON, used to tell whether an edit really changed anything.
export const stable = (v) => JSON.stringify(sortKeys(v));

const editable = (r) => ({
  title: r.title,
  description: r.description,
  ruleType: r.ruleType,
  parameters: r.parameters,
});

export function validatePolicyText(trimmed) {
  if (trimmed.length < POLICY_MIN_CHARS) {
    return `Add at least ${POLICY_MIN_CHARS} characters of policy text (currently ${trimmed.length}).`;
  }
  if (trimmed.length > POLICY_MAX_CHARS) {
    return `Policy text is too long. The limit is ${fmtCount(POLICY_MAX_CHARS)} characters (currently ${fmtCount(trimmed.length)}).`;
  }
  return "";
}

// Turns the endpoint's rules into UI rules. The endpoint already sanitises its
// output; this keeps the page from crashing if the contract drifts.
//
// Review state is owned by the UI only: whatever `approved` says in the
// response, a rule starts as pending until a reviewer approves it here.
export function normalizeRules(rawRules) {
  const seen = new Set();

  return (Array.isArray(rawRules) ? rawRules : []).map((raw, i) => {
    const r = isPlainObject(raw) ? raw : {};

    let id = str(r.id) || `CAND-${String(i + 1).padStart(3, "0")}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);

    const sourceExcerpt = str(r.sourceExcerpt);
    const excerptVerified = sourceExcerpt !== "" && r.excerptVerified !== false;

    const base = {
      title: str(r.title) || `Candidate rule ${i + 1}`,
      description: str(r.description),
      ruleType: RULE_TYPE_LABELS[r.ruleType] ? r.ruleType : "unsupported",
      parameters: isPlainObject(r.parameters) ? r.parameters : {},
    };

    return {
      id,
      ...base,
      sourceExcerpt: excerptVerified ? sourceExcerpt : "",
      excerptVerified,
      confidence: ["high", "medium", "low"].includes(r.confidence)
        ? r.confidence
        : "low",
      // Same rule as the endpoint: unclear unless explicitly clear AND sourced.
      needsClarification: r.needsClarification !== false || !excerptVerified,
      clarificationQuestion: str(r.clarificationQuestion),
      // UI-only review state (nothing here is saved or enforced).
      status: "pending", // "pending" | "approved"
      ack: false, // reviewer confirmed the clarification question
      edited: false,
      original: JSON.parse(JSON.stringify(base)),
    };
  });
}

// "pending" | "approved" | "unsupported", as shown to the reviewer.
export const viewOf = (rule) =>
  rule.ruleType === "unsupported" ? "unsupported" : rule.status;

export const canApprove = (rule) =>
  rule.ruleType !== "unsupported" &&
  rule.status === "pending" &&
  (!rule.needsClarification || rule.ack);

export const hasChanged = (rule, value) =>
  stable(editable(rule)) !== stable(editable({ ...rule, ...value }));

export const isEdited = (rule) => stable(editable(rule)) !== stable(rule.original);

export const parametersToText = (p) =>
  p && Object.keys(p).length ? JSON.stringify(p, null, 2) : "{}";

export function formatParam(value) {
  if (Array.isArray(value)) return value.map(formatParam).join(", ");
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

// Validates the edit form. Returns { errors, value }; `value` is only usable
// when `errors` is empty.
export function validateDraft(draft) {
  const errors = {};

  const title = draft.title.trim();
  if (!title) errors.title = "Enter a title for this rule.";
  else if (title.length > TITLE_MAX)
    errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  const description = draft.description.trim();
  if (description.length > DESCRIPTION_MAX)
    errors.description = `Keep the description to ${fmtCount(DESCRIPTION_MAX)} characters or fewer.`;

  let parameters = {};
  const raw = draft.parametersText.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) parameters = parsed;
      else
        errors.parameters =
          'Parameters must be a JSON object, for example {"maxDays": 30}.';
    } catch {
      errors.parameters =
        'Parameters must be valid JSON, for example {"maxDays": 30}.';
    }
  }

  const ruleType = RULE_TYPE_LABELS[draft.ruleType]
    ? draft.ruleType
    : "unsupported";

  return { errors, value: { title, description, ruleType, parameters } };
}
