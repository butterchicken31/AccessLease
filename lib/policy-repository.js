
import { getPolicyDatabase } from "./policy-db.js";
import { randomUUID } from "node:crypto";

function now() {
  return new Date().toISOString();
}

export function createPolicy({ name, sourceText }) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof sourceText !== "string" ||
    !sourceText.trim()
  ) {
    throw new Error("Policy name and source text are required.");
  }

  const db = getPolicyDatabase();
  const timestamp = now();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO policies
      (id, name, source_text, status, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?)
  `).run(id, name.trim(), sourceText.trim(), timestamp, timestamp);

  return getPolicy(id);
}

export function getPolicy(id) {
  const db = getPolicyDatabase();

  const policy = db.prepare(
    "SELECT * FROM policies WHERE id = ?"
  ).get(id);

  if (!policy) return null;

  const rules = db.prepare(`
    SELECT * FROM policy_rules
    WHERE policy_id = ?
    ORDER BY created_at, id
  `).all(id);

  return {
    ...policy,
    rules: rules.map((rule) => ({
      ...rule,
      parameters: JSON.parse(rule.parameters_json),
    })),
  };
}

export function listPolicies() {
  return getPolicyDatabase()
    .prepare(`
      SELECT id, name, status, created_at, updated_at, approved_at
      FROM policies
      ORDER BY created_at DESC
    `)
    .all();
}

export function addPolicyRule(policyId, rule) {
  const db = getPolicyDatabase();
  const policy = db.prepare(
    "SELECT id FROM policies WHERE id = ?"
  ).get(policyId);

  if (!policy) throw new Error("Policy not found.");

  const {
    title,
    description,
    ruleType,
    parameters = {},
    sourceExcerpt,
    confidence = null,
  } = rule;

  if (
    typeof title !== "string" || !title.trim() ||
    typeof description !== "string" || !description.trim() ||
    typeof ruleType !== "string" || !ruleType.trim() ||
    typeof sourceExcerpt !== "string" || !sourceExcerpt.trim() ||
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters) ||
    (confidence !== null &&
      (typeof confidence !== "number" ||
       !Number.isFinite(confidence) ||
       confidence < 0 || confidence > 1))
  ) {
    throw new Error("Invalid policy rule.");
  }

  const id = randomUUID();
  const timestamp = now();

  db.prepare(`
    INSERT INTO policy_rules (
      id, policy_id, title, description, rule_type,
      parameters_json, source_excerpt, confidence,
      status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?)
  `).run(
    id, policyId, title.trim(), description.trim(),
    ruleType.trim(), JSON.stringify(parameters),
    sourceExcerpt.trim(), confidence, timestamp
  );

  return getPolicy(policyId);
}

export function reviewPolicyRule(ruleId, decision) {
  if (!["approved", "rejected"].includes(decision)) {
    throw new Error("Decision must be approved or rejected.");
  }

  const db = getPolicyDatabase();
  const rule = db.prepare(
    "SELECT * FROM policy_rules WHERE id = ?"
  ).get(ruleId);

  if (!rule) throw new Error("Rule not found.");

  if (rule.status !== "candidate") {
    throw new Error("Only candidate rules can be reviewed.");
  }

  const timestamp = now();

  db.prepare(`
    UPDATE policy_rules
    SET status = ?, approved_at = ?
    WHERE id = ?
  `).run(decision, decision === "approved" ? timestamp : null, ruleId);

  db.prepare(`
    UPDATE policies
    SET updated_at = ?
    WHERE id = ?
  `).run(timestamp, rule.policy_id);

  return getPolicy(rule.policy_id);
}

export function getApprovedRules(policyId) {
  return getPolicyDatabase()
    .prepare(`
      SELECT * FROM policy_rules
      WHERE policy_id = ? AND status = 'approved'
      ORDER BY created_at, id
    `)
    .all(policyId)
    .map((rule) => ({
      ...rule,
      parameters: JSON.parse(rule.parameters_json),
    }));
}
