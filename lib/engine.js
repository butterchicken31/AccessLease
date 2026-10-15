// RULE ENGINE. Plain JavaScript, no website code, no AI. Same data in = same findings out.
// analyze(dataset, policy, now) -> array of findings.
//
// Core idea: every check returns an "issue" with verdict "violation" (the data PROVES a rule
// is broken) or "review" (data is missing/unverifiable, so a human must look).
// Missing data is NEVER turned into a violation.

const DAY = 86400000;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const fmt = (d) => d.toISOString().slice(0, 10);

// Reads a date safely. Date-only values ("2026-10-15") count as valid until the END of that day.
export function parseDate(value, endOfDay = true) {
  if (blank(value)) return { state: "missing", date: null };
  const s = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(dateOnly ? `${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : s);
  if (isNaN(d.getTime())) return { state: "invalid", date: null, raw: s };
  return { state: "ok", date: d };
}

const toMap = (list) => {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((x) => {
    if (x && typeof x === "object" && !blank(x.id) && !m.has(x.id)) m.set(x.id, x);
  });
  return m;
};

// Copies records, gives blank ids a name, and renames duplicate ids (E-01 -> E-01~2).
function normalize(list, prefix) {
  const seen = new Map();
  return (Array.isArray(list) ? list : []).map((raw, index) => {
    const item = raw && typeof raw === "object" ? { ...raw } : {};
    item._index = index;
    if (blank(item.id)) {
      item.id = `${prefix}-UNNAMED-${index + 1}`;
      item._noId = true;
    } else if (seen.has(item.id)) {
      const n = seen.get(item.id) + 1;
      seen.set(item.id, n);
      item.id = `${item.id}~${n}`;
      item._dupId = true;
    } else seen.set(item.id, 1);
    return item;
  });
}

const mk = (type, rule, verdict, severity, message, evidence = [], missing = []) => ({
  type, rule, verdict, severity, message, evidence, missing,
});
const isClosed = (x) => ["revoked", "closed", "disabled"].includes(String(x?.status || "").toLowerCase());

// ---------- checks shared by grants and delegations ----------
function commonChecks(ctx, v) {
  const { identities, roles, resources, policy, now } = ctx;
  const L = policy.limits || {};
  const out = [];
  const idn = identities.get(v.identityId);
  const idType = idn?.type || "default";

  // P-07 / P-02: who holds this access?
  if (!idn) {
    out.push(mk("missing_metadata", "P-02", "review", 4, "The identity holding this access is missing or not in the directory, so it cannot be verified.", [`identityId = ${blank(v.identityId) ? "(blank)" : v.identityId}`], ["identityId"]));
  } else if (String(idn.status).toLowerCase() === "inactive") {
    out.push(mk("inactive_identity", "P-07", "violation", 8, `${idn.name || idn.id} is marked inactive in the directory but still holds active access.`, [`identity ${idn.id} status = inactive`, `access status = ${v.item.status || "active"}`]));
  }

  // P-01 / P-02: expiry
  const { expires, granted } = v;
  if (expires.state === "missing") {
    if (v.needsExpiry) out.push(mk("missing_metadata", "P-02", "review", 4, "Temporary access has no expiry date recorded, so staleness cannot be proven.", ["expiresAt = (blank)"], ["expiresAt"]));
  } else if (expires.state === "invalid") {
    out.push(mk("missing_metadata", "P-02", "review", 4, "The expiry date is not a readable date, so staleness cannot be proven.", [`expiresAt = "${expires.raw}"`], ["expiresAt"]));
  } else if (granted.state === "ok" && expires.date < granted.date) {
    out.push(mk("missing_metadata", "P-02", "review", 3, "The expiry date is earlier than the start date. The record looks wrong, so a human must confirm the real dates.", [`grantedAt = ${fmt(granted.date)}`, `expiresAt = ${fmt(expires.date)}`], ["expiresAt"]));
  } else if (expires.date < now) {
    const ms = now - expires.date;
    const days = Math.floor(ms / DAY);
    const overdue = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.max(1, Math.floor(ms / 3600000))} hour(s)`;
    const issue = mk("stale", "P-01", "violation", clamp(6 + Math.floor(days / 60), 6, 9),
      `Access expired on ${fmt(expires.date)} but is still active (${overdue} overdue).`,
      [`expiresAt = ${expires.date.toISOString()}`, `evaluated at ${now.toISOString()}`, `overdue by ${overdue}`, `status = ${v.item.status || "active"}`]);
    issue.days = days;
    out.push(issue);
  }

  // P-04: permanent access for temporary identity types
  if (!v.needsExpiry && (L.temporaryIdentityTypes || []).includes(idType)) {
    out.push(mk("over_broad", "P-04", "violation", 7, `A ${idType} holds permanent access, but ${idType}s may only hold temporary access.`, [`type = permanent`, `identity type = ${idType}`]));
  }

  // P-05: maximum duration
  if (v.needsExpiry && expires.state === "ok" && granted.state === "ok" && expires.date >= granted.date) {
    const days = Math.floor((expires.date - granted.date) / DAY);
    const max = L.maxTemporaryDays?.[idType] ?? L.maxTemporaryDays?.default ?? 90;
    if (days > max) out.push(mk("over_broad", "P-05", "violation", 5, `Access was granted for ${days} days but the limit for a ${idType} is ${max} days.`, [`grantedAt = ${fmt(granted.date)}`, `expiresAt = ${fmt(expires.date)}`, `duration = ${days} days (limit ${max})`]));
  }

  // P-03: owner
  if (blank(v.ownerId)) {
    out.push(mk("ownerless", "P-03", "review", 5, "No owner is recorded, so nobody is accountable for approving or removing this access.", ["ownerId = (blank)"], ["ownerId"]));
  } else if (v.ownerId === v.identityId) {
    out.push(mk("ownerless", "P-03", "violation", 6, "The grantee is recorded as their own owner (self-approved access).", [`ownerId = ${v.ownerId}`, `identityId = ${v.identityId}`]));
  } else {
    const o = identities.get(v.ownerId);
    if (!o) out.push(mk("ownerless", "P-03", "review", 4, `Owner "${v.ownerId}" is not in the directory, so the owner cannot be verified.`, [`ownerId = ${v.ownerId} (not found)`], ["ownerId"]));
    else if (String(o.status).toLowerCase() === "inactive") out.push(mk("ownerless", "P-03", "violation", 7, `The recorded owner ${o.name || o.id} is inactive, so nobody accountable remains.`, [`owner ${o.id} status = inactive`]));
  }

  // P-02: purpose
  if (blank(v.item.purpose)) out.push(mk("missing_metadata", "P-02", "review", 3, "No purpose or justification is recorded.", ["purpose = (blank)"], ["purpose"]));

  // P-04: privilege level
  if (!v.skipRole) {
    const role = roles.get(v.roleId);
    if (!role) {
      out.push(mk("missing_metadata", "P-02", "review", 4, "The role is missing or unknown, so the level of access cannot be judged.", [`roleId = ${blank(v.roleId) ? "(blank)" : v.roleId}`], ["roleId"]));
    } else {
      const lvl = Number(role.level) || 0;
      const max = L.maxLevelByIdentityType?.[idType] ?? L.maxLevelByIdentityType?.default ?? 2;
      if (v.needsExpiry && lvl >= (L.adminLevel ?? 3) && L.adminAllowedTemporary === false) {
        out.push(mk("over_broad", "P-04", "violation", 8, `Temporary access carries ${role.name} rights, but temporary access may not be admin.`, [`role = ${role.name} (level ${lvl})`, "access is temporary"]));
      } else if (lvl > max) {
        out.push(mk("over_broad", "P-04", "violation", 7, `${role.name} (level ${lvl}) is above the maximum level ${max} allowed for a ${idType}.`, [`role level = ${lvl}`, `max for ${idType} = ${max}`]));
      }
    }
  }

  // P-02: resource
  if (!v.skipResource && !resources.get(v.resourceId)) {
    out.push(mk("missing_metadata", "P-02", "review", 4, "The resource is missing or unknown, so the impact cannot be judged.", [`resourceId = ${blank(v.resourceId) ? "(blank)" : v.resourceId}`], ["resourceId"]));
  }
  return out;
}

// ---------- delegation chain ----------
function resolveChain(d, ctx) {
  const chain = [d.id];
  const seen = new Set([d.id]);
  let cur = d;
  let depth = 1;
  for (;;) {
    const src = cur.fromGrantId;
    if (blank(src)) return { chain, root: null, reason: "missing", depth };
    if (seen.has(src)) return { chain: [...chain, src], root: null, reason: "cycle", depth };
    if (ctx.grantMap.has(src)) return { chain: [...chain, src], root: ctx.grantMap.get(src), depth };
    if (ctx.delMap.has(src)) { seen.add(src); chain.push(src); cur = ctx.delMap.get(src); depth++; continue; }
    return { chain: [...chain, src], root: null, reason: "unknown", depth };
  }
}

function delegationChecks(d, ctx, res) {
  const { policy, now, identities } = ctx;
  const L = policy.limits || {};
  const out = [];
  const chainTxt = res.chain.join(" -> ");

  if (res.reason === "cycle") {
    out.push(mk("orphaned_delegation", "P-06", "violation", 8, `Circular delegation chain: ${chainTxt}. Nobody actually holds the original access.`, [`chain = ${chainTxt}`]));
  } else if (res.reason) {
    out.push(mk("orphaned_delegation", "P-06", "review", 4, `The source of this delegation (${blank(d.fromGrantId) ? "blank" : d.fromGrantId}) cannot be found, so it cannot be verified.`, [`fromGrantId = ${blank(d.fromGrantId) ? "(blank)" : d.fromGrantId} (not found)`], ["fromGrantId"]));
  } else {
    if (res.depth > (L.maxDelegationDepth ?? 1)) {
      out.push(mk("orphaned_delegation", "P-06", "violation", 6, `Access was passed on ${res.depth} times (${chainTxt}); the limit is ${L.maxDelegationDepth ?? 1}.`, [`chain = ${chainTxt}`, `depth = ${res.depth} (limit ${L.maxDelegationDepth ?? 1})`]));
    }
    // every source in the chain must itself still be valid
    const sources = res.chain.slice(1).map((id) => ctx.grantMap.get(id) || ctx.delMap.get(id)).filter(Boolean);
    for (const s of sources) {
      const exp = parseDate(s.expiresAt, true);
      let why = null;
      if (isClosed(s)) why = `was revoked`;
      else if (exp.state === "ok" && exp.date < now) why = `expired on ${fmt(exp.date)}`;
      if (why) out.push(mk("orphaned_delegation", "P-06", "violation", 8, `The source ${s.id} ${why}, so access delegated from it should no longer exist.`, [`source ${s.id} ${why}`, `chain = ${chainTxt}`]));
    }
    // delegation must not outlive the root grant
    const rootExp = parseDate(res.root.expiresAt, true);
    const dExp = parseDate(d.expiresAt, true);
    if (rootExp.state === "ok" && dExp.state === "ok" && dExp.date > rootExp.date) {
      out.push(mk("orphaned_delegation", "P-06", "violation", 6, `The delegation runs until ${fmt(dExp.date)} but its source ${res.root.id} ends ${fmt(rootExp.date)}.`, [`delegation expiresAt = ${fmt(dExp.date)}`, `source expiresAt = ${fmt(rootExp.date)}`]));
    }
    // source holder inactive
    const holder = identities.get(res.root.identityId);
    if (holder && String(holder.status).toLowerCase() === "inactive") {
      out.push(mk("orphaned_delegation", "P-06", "violation", 7, `The original holder ${holder.name || holder.id} is inactive, so access delegated from them is orphaned.`, [`holder ${holder.id} status = inactive`]));
    }
    // delegator should be the holder of the immediate source
    const imm = ctx.grantMap.get(d.fromGrantId) || ctx.delMap.get(d.fromGrantId);
    const immHolder = imm ? (imm.identityId ?? imm.toIdentityId) : null;
    if (!blank(d.fromIdentityId) && immHolder && immHolder !== d.fromIdentityId) {
      out.push(mk("orphaned_delegation", "P-06", "review", 4, `The delegator ${d.fromIdentityId} does not hold the source ${d.fromGrantId} (holder is ${immHolder}).`, [`fromIdentityId = ${d.fromIdentityId}`, `source holder = ${immHolder}`]));
    }
  }
  // delegator inactive
  const delegator = identities.get(d.fromIdentityId);
  if (delegator && String(delegator.status).toLowerCase() === "inactive") {
    out.push(mk("inactive_identity", "P-07", "violation", 7, `The delegator ${delegator.name || delegator.id} is inactive.`, [`delegator ${delegator.id} status = inactive`]));
  }
  return out;
}

// ---------- turning issues into a finding ----------
function explain(ctx, f) {
  const lines = f.checks.map((c) => `${c.rule} (${c.ruleTitle}): ${c.message}`);
  const head = `${f.identity} holds ${f.role} on ${f.resource}.`;
  if (f.status === "compliant") return `${head} No policy rule is broken and no required information is missing.`;
  const miss = f.missingFields.length ? f.missingFields.join(", ") : "";
  let verdict;
  if (f.status === "violation") {
    verdict = "Confirmed violation: the recorded data itself proves the rule(s) above are broken." + (miss ? ` Some information is also missing (${miss}) and needs a reviewer.` : "");
  } else {
    verdict = `Needs review: no rule is proven broken, but required information is missing or cannot be verified (${miss || "see checks"}). A human must confirm before any action.`;
  }
  return `${head} ${lines.join(" ")} ${verdict}`;
}

function suggest(f) {
  if (f.status === "compliant" || f.status === "resolved") return { action: "ignore", recommendation: "No action needed." };
  if (f.status === "needs_review") return { action: "escalate", recommendation: "Ask the owner or a security lead to supply the missing information, then re-check." };
  const types = new Set(f.issues);
  if (f.kind === "grant" && types.size === 1 && types.has("stale") && f.overdueDays <= 14) return { action: "extend", recommendation: "Only just expired. If the work is genuinely ongoing, the owner can justify a short extension; otherwise revoke." };
  return { action: "revoke", recommendation: "Notify the owner, allow a short grace period, then revoke." };
}

function assemble(ctx, item, kind, v, issues, chain) {
  const { identities, roles, resources, policy } = ctx;
  const idn = identities.get(v.identityId);
  const role = roles.get(v.roleId);
  const res = resources.get(v.resourceId);
  const ruleInfo = new Map((policy.rules || []).map((r) => [r.id, r]));

  const hasV = issues.some((i) => i.verdict === "violation");
  const hasR = issues.some((i) => i.verdict === "review");
  const status = hasV ? "violation" : hasR ? "needs_review" : "compliant";
  const maxSev = Math.max(0, ...issues.map((i) => i.severity));
  const overdueDays = Math.max(0, ...issues.map((i) => i.days || 0));

  const parts = [
    { label: "Severity of the worst issue", weight: 0.4, value: maxSev / 10 },
    { label: "Sensitivity of the resource", weight: 0.25, value: (res?.sensitivity ?? 2) / 3 },
    { label: "Power of the role", weight: 0.2, value: (role?.level ?? 1.5) / 3 },
    { label: "How long overdue", weight: 0.15, value: clamp(overdueDays / 180, 0, 1) },
  ];
  const confidence = hasV ? 1 : 0.6;
  const raw = parts.reduce((s, p) => s + p.weight * p.value, 0);
  const score = status === "compliant" ? 0 : Math.round(100 * raw * confidence);

  const checks = issues.map((i) => ({
    rule: i.rule, ruleTitle: ruleInfo.get(i.rule)?.title || i.rule, ruleText: ruleInfo.get(i.rule)?.text || "",
    verdict: i.verdict, type: i.type, severity: i.severity, message: i.message, evidence: i.evidence,
  }));

  const f = {
    id: `F-${item.id}`, itemId: item.id, kind, index: item._index,
    grantId: item.id,
    identityId: v.identityId ?? null, resourceId: v.resourceId ?? null, roleId: v.roleId ?? null, ownerId: v.ownerId ?? null,
    identity: idn?.name || idn?.id || v.identityId || "(unknown identity)",
    identityType: idn?.type || "unknown",
    resource: res?.name || v.resourceId || "(unknown resource)",
    role: role?.name || v.roleId || "(unknown role)",
    owner: v.ownerId ? (identities.get(v.ownerId)?.name || v.ownerId) : null,
    purpose: item.purpose || null,
    grantedAt: item.grantedAt || null, expiresAt: item.expiresAt || null,
    accessType: kind === "delegation" ? "delegated" : (item.type || "temporary"),
    status,
    issues: [...new Set(issues.map((i) => i.type))],
    missingFields: [...new Set(issues.flatMap((i) => i.missing))],
    checks,
    evidence: issues.flatMap((i) => i.evidence.map((e) => `[${i.rule}] ${e}`)),
    policyRule: issues[0]?.rule || null,
    policyRules: [...new Set(issues.map((i) => i.rule))],
    priorityScore: score,
    scoreBreakdown: { parts, confidence, note: status === "needs_review" ? "Needs-review items are scored at 60% because the data is incomplete." : "Confirmed violations are scored at full confidence." },
    overdueDays,
    chain: chain || [item.id],
  };
  f.explanation = explain(ctx, f);
  const s = suggest(f);
  f.suggestedAction = s.action;
  f.recommendation = s.recommendation;
  return f;
}

function resolvedFinding(ctx, item, kind, v, chain) {
  const f = assemble(ctx, item, kind, v, [], chain);
  f.status = "resolved";
  f.priorityScore = 0;
  f.explanation = `${f.identity}'s access to ${f.resource} is revoked (status = revoked). Nothing left to review.`;
  f.suggestedAction = "ignore";
  f.recommendation = "Already revoked.";
  return f;
}

function evalGrant(g, ctx) {
  const v = {
    item: g, identityId: g.identityId, resourceId: g.resourceId, roleId: g.roleId, ownerId: g.ownerId,
    needsExpiry: g.type !== "permanent", expires: parseDate(g.expiresAt, true), granted: parseDate(g.grantedAt, false),
  };
  if (isClosed(g)) return resolvedFinding(ctx, g, "grant", v);
  const issues = commonChecks(ctx, v);
  const key = [g.identityId, g.resourceId, g.roleId].join("|");
  if (!blank(g.identityId) && !blank(g.resourceId) && !blank(g.roleId) && ctx.firstByKey.get(key) !== g.id) {
    issues.push(mk("duplicate", "P-08", "review", 2, `Another active grant already gives this identity the same role on the same resource (${ctx.firstByKey.get(key)}).`, [`duplicate of ${ctx.firstByKey.get(key)}`]));
  }
  if (g._dupId) issues.push(mk("duplicate", "P-08", "review", 3, `The record id "${g._origId || g.id.split("~")[0]}" is used more than once.`, ["duplicate record id"], ["id"]));
  if (g._noId) issues.push(mk("missing_metadata", "P-08", "review", 3, "This record has no id.", ["id = (blank)"], ["id"]));
  return assemble(ctx, g, "grant", v, issues);
}

function evalDelegation(d, ctx) {
  const res = resolveChain(d, ctx);
  const root = res.root;
  const v = {
    item: d, identityId: d.toIdentityId, resourceId: root?.resourceId, roleId: root?.roleId,
    ownerId: blank(d.ownerId) ? root?.ownerId : d.ownerId,
    needsExpiry: true, expires: parseDate(d.expiresAt, true), granted: parseDate(d.grantedAt, false),
    skipRole: !root, skipResource: !root,
  };
  if (isClosed(d)) return resolvedFinding(ctx, d, "delegation", v, res.chain);
  const issues = [...commonChecks(ctx, v), ...delegationChecks(d, ctx, res)];
  if (d._dupId) issues.push(mk("duplicate", "P-08", "review", 3, "This delegation id is used more than once.", ["duplicate record id"], ["id"]));
  if (d._noId) issues.push(mk("missing_metadata", "P-08", "review", 3, "This record has no id.", ["id = (blank)"], ["id"]));
  return assemble(ctx, d, "delegation", v, issues, res.chain);
}

// A crash on one bad record must never stop the audit.
function safe(fn, item, kind, ctx) {
  try { return fn(); } catch (err) {
    const v = { item, identityId: item.identityId ?? item.toIdentityId, resourceId: item.resourceId, roleId: item.roleId, ownerId: item.ownerId };
    return assemble(ctx, item, kind, v, [mk("missing_metadata", "P-02", "review", 4, `This record could not be evaluated (${err.message}). A human must check it.`, ["engine could not read record"])]);
  }
}

export function analyze(dataset, policy, now = new Date()) {
  const ds = dataset && typeof dataset === "object" ? dataset : {};
  const grants = normalize(ds.grants, "G");
  const delegations = normalize(ds.delegations, "D");
  const ctx = {
    identities: toMap(ds.identities), roles: toMap(ds.roles), resources: toMap(ds.resources),
    grantMap: new Map(grants.map((g) => [g.id, g])), delMap: new Map(delegations.map((d) => [d.id, d])),
    policy: policy || {}, now, firstByKey: new Map(),
  };
  for (const g of grants) {
    if (isClosed(g) || blank(g.identityId) || blank(g.resourceId) || blank(g.roleId)) continue;
    const k = [g.identityId, g.resourceId, g.roleId].join("|");
    if (!ctx.firstByKey.has(k)) ctx.firstByKey.set(k, g.id);
  }
  return [
    ...grants.map((g) => safe(() => evalGrant(g, ctx), g, "grant", ctx)),
    ...delegations.map((d) => safe(() => evalDelegation(d, ctx), d, "delegation", ctx)),
  ];
}
