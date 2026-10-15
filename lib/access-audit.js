const { accessPolicy } = require("../data/access-policies");
const { mockAccessGrants } = require("../data/mock-access-grants");

const ISSUE_ORDER = ["stale", "over_broad", "ownerless", "missing_metadata"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function printableValue(value) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return "[array]";
  return "[non-scalar value]";
}

function getPolicyRule(policy, ruleId) {
  return policy.rules.find((rule) => isRecord(rule) && rule.id === ruleId);
}

function validatePolicy(policy) {
  if (!isRecord(policy) || !Array.isArray(policy.rules)) {
    throw new TypeError("Policy must contain a rules array.");
  }

  const ruleIds = new Set(
    policy.rules.filter(isRecord).map((rule) => rule.id)
  );
  const timeRule = getPolicyRule(policy, "P-01");
  const leastPrivilegeRule = getPolicyRule(policy, "P-02");
  const ownerRule = getPolicyRule(policy, "P-03");
  const metadataRule = getPolicyRule(policy, "P-04");
  if (
    !["P-01", "P-02", "P-03", "P-04", "P-05"].every((id) => ruleIds.has(id)) ||
    !Array.isArray(timeRule.requiredDateFields) ||
    !timeRule.requiredDateFields.every(isNonEmptyString) ||
    !Array.isArray(timeRule.activeStatuses) ||
    !timeRule.activeStatuses.every(isNonEmptyString) ||
    !Array.isArray(timeRule.recognizedStatuses) ||
    !timeRule.recognizedStatuses.every(isNonEmptyString) ||
    !Array.isArray(leastPrivilegeRule.broadPermissionPatterns) ||
    !leastPrivilegeRule.broadPermissionPatterns.every(isNonEmptyString) ||
    !Array.isArray(metadataRule.requiredMetadata) ||
    !metadataRule.requiredMetadata.every(isNonEmptyString) ||
    typeof ownerRule.ownerRequired !== "boolean"
  ) {
    throw new TypeError("Policy is missing a required audit rule or configuration.");
  }
}

function makeFinding(record, options = {}) {
  const evidence = [...new Set(options.evidence || [])];
  const issues = ISSUE_ORDER.filter((issue) => (options.issues || new Set()).has(issue));
  const status =
    issues.some((issue) => issue !== "missing_metadata") || options.violation
      ? "violation"
      : issues.length > 0 || options.needsReview || evidence.length > 0
        ? "needs_review"
        : "compliant";
  let selectedRule;
  if (issues.includes("stale")) selectedRule = "P-01";
  else if (issues.includes("over_broad")) selectedRule = "P-02";
  else if (issues.includes("ownerless")) selectedRule = "P-03";
  else if (issues.includes("missing_metadata")) {
    selectedRule =
      options.ruleIds?.find((ruleId) => ruleId === "P-01" || ruleId === "P-04") || "P-04";
  } else {
    selectedRule = options.ruleIds?.[0] || (status === "compliant" ? "P-01" : "P-05");
  }
  const policyRule = getPolicyRule(options.policy, selectedRule);
  const priorities = {
    stale: 20,
    over_broad: 20,
    ownerless: 15,
    missing_metadata: 0,
  };
  const priorityScore =
    status === "compliant"
      ? 0
      : status === "violation"
        ? Math.min(
            100,
            55 + issues.reduce((total, issue) => total + priorities[issue], 0)
          )
        : Math.min(50, 35 + Math.max(0, evidence.length - 1) * 5);

  let explanation;
  if (status === "compliant") {
    explanation = "No configured policy violation or review condition was found.";
  } else if (status === "violation") {
    const reasons = issues.map((issue) => {
      if (issue === "stale") return "the active grant is past its recorded end date";
      if (issue === "over_broad") return "its permissions match a broad-access pattern";
      if (issue === "ownerless") return "the policy requires an owner and none is recorded";
      return "required metadata is missing and needs review";
    });
    explanation = `The grant violates ${policyRule.id}: ${reasons.join("; ")}.`;
  } else {
    explanation = `The grant needs manual review: ${evidence.join("; ")}.`;
  }

  const suggestedAction =
    status === "compliant"
      ? "ignore"
      : status === "needs_review" ||
          (issues.includes("ownerless") &&
            !issues.includes("stale") &&
            !issues.includes("over_broad"))
        ? "escalate"
        : "revoke";

  return {
    grantId: record.grantId,
    identity: record.identity,
    resource: record.resource,
    role: record.role,
    status,
    issues,
    missingFields: [...new Set(options.missingFields || [])].sort(),
    priorityScore,
    evidence,
    policyRule: policyRule.id,
    explanation,
    suggestedAction,
    sortKey: record.sortKey,
  };
}

function validGrantId(grant) {
  return isRecord(grant) && isNonEmptyString(grant.id) ? grant.id.trim() : null;
}

function commonString(records, field) {
  const values = records.map((record) =>
    isNonEmptyString(record[field]) ? record[field].trim() : ""
  );
  return values.every((value) => value && value === values[0]) ? values[0] : "";
}

function findDelegationCycles(grantsById) {
  const colors = new Map();
  const path = [];
  const pathPositions = new Map();
  const cycleEvidence = new Map();

  for (const rootId of [...grantsById.keys()].sort()) {
    if (colors.get(rootId)) continue;

    colors.set(rootId, 1);
    pathPositions.set(rootId, path.length);
    path.push(rootId);
    const frames = [
      {
        id: rootId,
        targets: [...grantsById.get(rootId).delegatesTo].filter((id) => grantsById.has(id)).sort(),
        nextTarget: 0,
      },
    ];

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.nextTarget >= frame.targets.length) {
        frames.pop();
        path.pop();
        pathPositions.delete(frame.id);
        colors.set(frame.id, 2);
        continue;
      }

      const targetId = frame.targets[frame.nextTarget];
      frame.nextTarget += 1;
      const color = colors.get(targetId) || 0;

      if (color === 0) {
        colors.set(targetId, 1);
        pathPositions.set(targetId, path.length);
        path.push(targetId);
        frames.push({
          id: targetId,
          targets: [...grantsById.get(targetId).delegatesTo]
            .filter((id) => grantsById.has(id))
            .sort(),
          nextTarget: 0,
        });
      } else if (color === 1) {
        const cycle = path.slice(pathPositions.get(targetId));
        const evidence = `Delegation cycle detected: ${[...cycle, targetId].join(" -> ")}.`;
        for (const id of cycle) {
          if (!cycleEvidence.has(id)) cycleEvidence.set(id, new Set());
          cycleEvidence.get(id).add(evidence);
        }
      }
    }
  }

  return cycleEvidence;
}

function auditAccessGrants(
  grants = mockAccessGrants,
  { getNow = () => new Date(), policy = accessPolicy } = {}
) {
  if (!Array.isArray(grants)) {
    throw new TypeError("Access grants must be provided as an array.");
  }
  if (typeof getNow !== "function") {
    throw new TypeError("getNow must be a function that returns a valid Date.");
  }
  validatePolicy(policy);

  const now = getNow();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("getNow must return a valid Date.");
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const groups = new Map();
  const malformed = [];

  for (let index = 0; index < grants.length; index += 1) {
    const grant = grants[index];
    const grantId = validGrantId(grant);
    if (!grantId) {
      malformed.push({ grant, index });
      continue;
    }
    if (!groups.has(grantId)) groups.set(grantId, []);
    groups.get(grantId).push(grant);
  }

  const uniqueGrants = new Map();
  const findings = [];

  for (const [grantId, records] of groups) {
    if (records.length > 1) {
      const record = {
        grantId,
        identity: commonString(records, "identity"),
        resource: commonString(records, "resource"),
        role: commonString(records, "role"),
        sortKey: `${grantId}\u0000duplicate`,
      };
      findings.push(
        makeFinding(record, {
          policy,
          needsReview: true,
          ruleIds: ["P-05"],
          evidence: [
            `Duplicate grant ID ${grantId} appears ${records.length} times; the records are ambiguous.`,
          ],
        })
      );
      continue;
    }
    uniqueGrants.set(grantId, records[0]);
  }

  const validGraph = new Map();
  for (const [grantId, grant] of uniqueGrants) {
    if (
      isRecord(grant) &&
      (!Object.prototype.hasOwnProperty.call(grant, "delegatesTo") ||
        (Array.isArray(grant.delegatesTo) && grant.delegatesTo.every(isNonEmptyString)))
    ) {
      validGraph.set(grantId, {
        delegatesTo: Array.isArray(grant.delegatesTo)
          ? [...new Set(grant.delegatesTo.map((id) => id.trim()))]
          : [],
      });
    }
  }
  const cycles = findDelegationCycles(validGraph);
  const ambiguousIds = new Set(
    [...groups.entries()].filter(([, records]) => records.length > 1).map(([id]) => id)
  );

  for (const [grantId, grant] of uniqueGrants) {
    const record = {
      grantId,
      identity: isRecord(grant) && isNonEmptyString(grant.identity) ? grant.identity.trim() : "",
      resource: isRecord(grant) && isNonEmptyString(grant.resource) ? grant.resource.trim() : "",
      role: isRecord(grant) && isNonEmptyString(grant.role) ? grant.role.trim() : "",
      sortKey: grantId,
    };
    const issues = new Set();
    const missingFields = [];
    const evidence = [];
    const ruleIds = [];
    let needsReview = !isRecord(grant);

    if (!isRecord(grant)) {
      evidence.push("Grant record is not an object.");
      ruleIds.push("P-05");
    } else {
      for (const field of ["identity", "resource", "role"]) {
        if (!isNonEmptyString(grant[field])) {
          needsReview = true;
          evidence.push(`Grant field '${field}' is missing or invalid.`);
          ruleIds.push("P-05");
        }
      }

      if (
        !Array.isArray(grant.permissions) ||
        grant.permissions.some((permission) => !isNonEmptyString(permission))
      ) {
        needsReview = true;
        evidence.push("Grant permissions are missing or malformed.");
        ruleIds.push("P-05");
      } else {
        const broadPatterns = getPolicyRule(policy, "P-02").broadPermissionPatterns;
        const broadPermissions = grant.permissions
          .map((permission) => permission.trim())
          .filter((permission) =>
            broadPatterns.some(
              (pattern) =>
                permission === pattern ||
                (pattern.endsWith(":*") && permission.startsWith(pattern.slice(0, -1)))
            )
          );
        if (broadPermissions.length > 0) {
          issues.add("over_broad");
          evidence.push(`Broad permissions detected: ${[...new Set(broadPermissions)].join(", ")}.`);
          ruleIds.push("P-02");
        }
      }

      const ownerRule = getPolicyRule(policy, "P-03");
      if (ownerRule.ownerRequired && !isNonEmptyString(grant.owner)) {
        if (
          grant.owner === undefined ||
          grant.owner === null ||
          (typeof grant.owner === "string" && !grant.owner.trim())
        ) {
          issues.add("ownerless");
          missingFields.push("owner");
          evidence.push("Required owner is not recorded.");
          ruleIds.push("P-03");
        } else {
          needsReview = true;
          evidence.push("Grant owner has an invalid value.");
          ruleIds.push("P-05");
        }
      }

      const metadataRule = getPolicyRule(policy, "P-04");
      const missingMetadata = metadataRule.requiredMetadata.filter(
        (field) =>
          grant[field] === undefined ||
          grant[field] === null ||
          (typeof grant[field] === "string" && !grant[field].trim())
      );
      const invalidMetadata = metadataRule.requiredMetadata.filter(
        (field) =>
          grant[field] !== undefined &&
          grant[field] !== null &&
          typeof grant[field] !== "string"
      );
      if (missingMetadata.length > 0) {
        issues.add("missing_metadata");
        missingFields.push(...missingMetadata);
        evidence.push(`Required metadata is missing: ${missingMetadata.join(", ")}.`);
        ruleIds.push("P-04");
      }
      if (invalidMetadata.length > 0) {
        needsReview = true;
        evidence.push(`Required metadata has invalid values: ${invalidMetadata.join(", ")}.`);
        ruleIds.push("P-05");
      }

      const dateRule = getPolicyRule(policy, "P-01");
      for (const field of dateRule.requiredDateFields) {
        if (
          grant[field] === undefined ||
          grant[field] === null ||
          (typeof grant[field] === "string" && !grant[field].trim())
        ) {
          issues.add("missing_metadata");
          missingFields.push(field);
          evidence.push(`Required date '${field}' is missing.`);
          ruleIds.push("P-01");
          continue;
        }

        const parsedDate = parseDate(grant[field]);
        if (!parsedDate) {
          needsReview = true;
          evidence.push(`Invalid ${field} value '${printableValue(grant[field])}'.`);
          ruleIds.push("P-01");
        } else if (
          field === "endDate" &&
          typeof grant.status === "string" &&
          dateRule.activeStatuses.includes(grant.status.trim().toLowerCase()) &&
          parsedDate < today
        ) {
          issues.add("stale");
          evidence.push(`Expired ${formatDate(parsedDate)}.`);
          evidence.push(`Still active on ${formatDate(today)}.`);
          ruleIds.push("P-01");
        }
      }

      if (!isNonEmptyString(grant.status)) {
        needsReview = true;
        evidence.push("Grant status is missing or invalid.");
        ruleIds.push("P-05");
      } else {
        const normalizedStatus = grant.status.trim().toLowerCase();
        const timeRule = getPolicyRule(policy, "P-01");
        if (!timeRule.recognizedStatuses.includes(normalizedStatus)) {
          needsReview = true;
          evidence.push(`Unrecognized grant status '${grant.status}'.`);
          ruleIds.push("P-05");
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(grant, "delegatesTo") &&
        (!Array.isArray(grant.delegatesTo) || grant.delegatesTo.some((id) => !isNonEmptyString(id)))
      ) {
        needsReview = true;
        evidence.push("Delegation targets are malformed.");
        ruleIds.push("P-05");
      } else if (Array.isArray(grant.delegatesTo)) {
        const missingTargets = [...new Set(grant.delegatesTo.map((id) => id.trim()))].filter(
          (targetId) => !uniqueGrants.has(targetId)
        );
        const ambiguousTargets = [...new Set(grant.delegatesTo.map((id) => id.trim()))].filter(
          (targetId) => ambiguousIds.has(targetId)
        );
        if (missingTargets.length > 0) {
          needsReview = true;
          evidence.push(`Delegation targets are not present in this audit: ${missingTargets.join(", ")}.`);
          ruleIds.push("P-05");
        }
        if (ambiguousTargets.length > 0) {
          needsReview = true;
          evidence.push(`Delegation targets have ambiguous duplicate IDs: ${ambiguousTargets.join(", ")}.`);
          ruleIds.push("P-05");
        }
      }

      if (cycles.has(grantId)) {
        needsReview = true;
        evidence.push(...cycles.get(grantId));
        ruleIds.push("P-05");
      }
    }

    findings.push(
      makeFinding(record, {
        policy,
        issues,
        missingFields,
        evidence,
        needsReview,
        ruleIds,
      })
    );
  }

  for (const { grant, index } of malformed) {
    const record = {
      grantId: "",
      identity: isRecord(grant) && isNonEmptyString(grant.identity) ? grant.identity.trim() : "",
      resource: isRecord(grant) && isNonEmptyString(grant.resource) ? grant.resource.trim() : "",
      role: isRecord(grant) && isNonEmptyString(grant.role) ? grant.role.trim() : "",
      sortKey: `\uffffmalformed\u0000${String(index).padStart(8, "0")}`,
    };
    const evidence = isRecord(grant)
      ? ["Grant record has no valid ID."]
      : [`Grant record at input index ${index} is not an object or array.`];
    findings.push(
      makeFinding(record, {
        policy,
        needsReview: true,
        evidence,
        ruleIds: ["P-05"],
      })
    );
  }

  findings.sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      left.grantId.localeCompare(right.grantId) ||
      left.sortKey.localeCompare(right.sortKey)
  );

  return findings.map(({ sortKey, ...finding }, index) => ({
    id: `F-${String(index + 1).padStart(3, "0")}`,
    ...finding,
  }));
}

module.exports = { auditAccessGrants };
