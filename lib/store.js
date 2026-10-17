
import { createHash } from "crypto";
import policy from "../data/policy.json";
import demoData from "../data/dataset.json";
import edgeData from "../data/edgeCases.json";
import { analyze, parseDate } from "./engine.js";
import { getNow } from "./now.js";
import { STATE_LABELS, actionsFor } from "./workflow.js";


const DATASETS = { demo: demoData, edge: edgeData };
const CLOSED = ["revoked", "exception_accepted"];

const fresh = (key) => ({
  key,
  dataset: structuredClone(DATASETS[key]),
  workflow: {},
});

function root() {
  if (!globalThis.__accesslease) {
    globalThis.__accesslease = {
      s: fresh("demo"),
      audit: [],
    };
  }
  return globalThis.__accesslease;
}

function hashEntry(entry) {
  const { hash, ...rest } = entry;
  return createHash("sha256")
    .update(JSON.stringify(rest))
    .digest("hex");
}

function appendAudit(partial, timestamp = getNow()) {
  const r = root();
  const prevHash = r.audit.length
    ? r.audit[r.audit.length - 1].hash
    : "GENESIS";
  const iso = timestamp.toISOString();

  const entry = {
    seq: r.audit.length + 1,
    ts: iso,
    asOf: iso,
    ...partial,
    prevHash,
  };

  entry.hash = hashEntry(entry);
  r.audit.push(entry);
  return entry;
}

function verify(entries) {
  let prev = "GENESIS";

  for (const entry of entries) {
    if (
      entry.prevHash !== prev ||
      hashEntry(entry) !== entry.hash
    ) {
      return { valid: false, brokenAt: entry.seq };
    }
    prev = entry.hash;
  }

  return { valid: true, brokenAt: null };
}

export function getAudit({ simulateTamper = false } = {}) {
  const entries = root().audit.map((entry) => ({ ...entry }));
  const real = verify(entries);
  let tamper = null;

  if (simulateTamper && entries.length) {
    const copy = entries.map((entry) => ({ ...entry }));
    copy[0].reason = (copy[0].reason || "") + " (edited later)";
    tamper = verify(copy);
  }

  return {
    entries: entries.reverse(),
    chainValid: real.valid,
    brokenAt: real.brokenAt,
    tamperTest: tamper,
  };
}

export function getFindings() {
  const { s } = root();
  const now = getNow();

  const findings = analyze(s.dataset, policy, now).map((f) => {
    const wf = s.workflow[f.itemId];
    const state =
      f.status === "resolved"
        ? "revoked"
        : wf?.state || (f.status === "compliant" ? "none" : "flagged");

    let allowed = [];

    if (["violation", "needs_review"].includes(f.status)) {
      allowed = actionsFor(state).filter(
        (a) => a.action !== "emergency_revoke" || f.status === "violation"
      );
    }

    return {
      ...f,
      workflow: {
        state,
        label: STATE_LABELS[state] || state,
        updatedAt: wf?.updatedAt || null,
      },
      allowedActions: allowed,
    };
  });

  const open = (f) =>
    ["violation", "needs_review"].includes(f.status) &&
    !CLOSED.includes(f.workflow.state);

  findings.sort(
    (a, b) =>
      Number(open(b)) - Number(open(a)) ||
      b.priorityScore - a.priorityScore
  );

  const count = (status) =>
    findings.filter((f) => f.status === status).length;

  return {
    asOf: now.toISOString(),
    dataset: { key: s.key, name: s.dataset.meta?.name || s.key },
    summary: {
      total: findings.length,
      violation: count("violation"),
      needs_review: count("needs_review"),
      compliant: count("compliant"),
      resolved: count("resolved"),
      exceptions: findings.filter(
        (f) => f.workflow.state === "exception_accepted"
      ).length,
    },
    findings,
  };
}

export const getFinding = (id) =>
  getFindings().findings.find((f) => f.id === id) || null;

export function applyReview({
  findingId,
  action,
  reviewer,
  reason,
  newExpiry,
}) {
  const { s } = root();
  const now = getNow();
  const before = getFindings().findings;
  const f = before.find((x) => x.id === findingId);

  if (!f) return { status: 404, error: "Finding not found." };
  if (!reviewer || String(reviewer).trim().length < 2) {
    return { status: 400, error: "Reviewer name is required." };
  }
  if (!reason || String(reason).trim().length < 5) {
    return {
      status: 400,
      error: "A reason (at least 5 characters) is required.",
    };
  }

  const allowed = f.allowedActions.find((a) => a.action === action);
  if (!allowed) {
    return {
      status: 409,
      error: `"${action}" is not allowed while the item is in state "${f.workflow.label}".`,
    };
  }

  const list =
    f.kind === "delegation" ? s.dataset.delegations : s.dataset.grants;
  const item = list[f.index];
  const changes = [];

  if (action === "revoke" || action === "emergency_revoke") {
    changes.push({
      field: `${f.itemId}.status`,
      before: item.status || "active",
      after: "revoked",
    });
    item.status = "revoked";
  }

  if (action === "extend") {
    const p = parseDate(newExpiry, true);
    const max = policy.limits?.maxExtensionDays ?? 30;

    if (p.state !== "ok") {
      return { status: 400, error: "Pick a valid new expiry date." };
    }
    if (p.date <= now) {
      return { status: 400, error: "The new expiry must be in the future." };
    }
    if (p.date > new Date(now.getTime() + max * 86400000)) {
      return {
        status: 400,
        error: `Policy allows extending at most ${max} days from today.`,
      };
    }

    changes.push({
      field: `${f.itemId}.expiresAt`,
      before: item.expiresAt || "(none)",
      after: String(newExpiry),
    });
    item.expiresAt = String(newExpiry);
  }

  const to = allowed.to;
  s.workflow[f.itemId] = { state: to, updatedAt: now.toISOString() };

  const entry = appendAudit(
    {
      reviewer: String(reviewer).trim(),
      action,
      itemId: f.itemId,
      findingId: f.id,
      fromState: f.workflow.state,
      toState: to,
      reason: String(reason).trim(),
      changes,
    },
    now
  );

  const after = getFindings().findings;
  const wasBad = new Set(
    before.filter((x) => x.status === "violation").map((x) => x.id)
  );
  const newViolations = after
    .filter((x) => x.status === "violation" && !wasBad.has(x.id))
    .map((x) => x.id);

  return {
    status: 200,
    ok: true,
    entry,
    finding: after.find((x) => x.id === findingId),
    newViolations,
  };
}

export function loadDataset(key) {
  const r = root();
  const target = key === "reset" ? r.s.key : key;

  if (!DATASETS[target]) {
    return { status: 400, error: "Unknown dataset." };
  }

  r.s = fresh(target);
  appendAudit({
    reviewer: "system",
    action: key === "reset" ? "reset_dataset" : "load_dataset",
    itemId: "-",
    findingId: "-",
    fromState: "-",
    toState: "-",
    reason: `Dataset "${target}" loaded; workflow state cleared`,
    changes: [],
  });

  return {
    status: 200,
    ok: true,
    dataset: { key: target, name: r.s.dataset.meta?.name },
  };
}

export function currentDataset() {
  const { s } = root();
  return {
    key: s.key,
    name: s.dataset.meta?.name,
    description: s.dataset.meta?.description,
    available: Object.keys(DATASETS),
  };
}

export function getGraph() {
  const { findings } = getFindings();
  const { s } = root();

  const idMap = new Map(
    (s.dataset.identities || []).map((i) => [i.id, i])
  );
  const resMap = new Map(
    (s.dataset.resources || []).map((r) => [r.id, r])
  );

  const edges = findings
    .filter(
      (f) =>
        f.identityId &&
        f.resourceId &&
        idMap.has(f.identityId) &&
        resMap.has(f.resourceId)
    )
    .map((f) => ({
      findingId: f.id,
      itemId: f.itemId,
      kind: f.kind,
      from: f.identityId,
      to: f.resourceId,
      status: f.status,
      role: f.role,
      score: f.priorityScore,
    }));

  const ids = new Set(edges.map((e) => e.from));
  const resources = new Set(edges.map((e) => e.to));

  return {
    identities: [...ids].map((id) => ({
      id,
      name: idMap.get(id).name || id,
      type: idMap.get(id).type,
      status: idMap.get(id).status,
    })),
    resources: [...resources].map((id) => ({
      id,
      name: resMap.get(id).name || id,
      sensitivity: resMap.get(id).sensitivity,
    })),
    edges,
  };
}
