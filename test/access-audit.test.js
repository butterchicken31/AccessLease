const assert = require("node:assert/strict");
const test = require("node:test");
const { auditAccessGrants } = require("../lib/access-audit");
const { mockAccessGrants } = require("../data/mock-access-grants");

const fixedNow = () => new Date("2026-10-15T12:00:00.000Z");

function auditOne(grant) {
  return auditAccessGrants([grant], { getNow: fixedNow })[0];
}

function validGrant(overrides = {}) {
  return {
    id: "G-TEST",
    identity: "Riya Sen",
    resource: "Test Workspace",
    role: "Reader",
    permissions: ["workspace:read"],
    owner: "Aarav Mehta",
    purpose: "Temporary test access",
    changeTicket: "CHG-7001",
    startDate: "2026-10-01",
    endDate: "2026-11-01",
    status: "active",
    delegatesTo: [],
    ...overrides,
  };
}

test("detects an active grant past its end date with date-based evidence", () => {
  const finding = auditOne(validGrant({ endDate: "2026-01-12" }));

  assert.equal(finding.status, "violation");
  assert.deepEqual(finding.issues, ["stale"]);
  assert.deepEqual(finding.evidence, [
    "Expired 12 Jan 2026.",
    "Still active on 15 Oct 2026.",
  ]);
  assert.equal(finding.suggestedAction, "revoke");
});

test("detects permissions matching configured broad-access patterns", () => {
  const finding = auditOne(validGrant({ permissions: ["reports:read", "admin:write"] }));

  assert.equal(finding.status, "violation");
  assert.deepEqual(finding.issues, ["over_broad"]);
  assert.match(finding.evidence[0], /admin:write/);
});

test("treats a missing required owner as an explicit violation", () => {
  const finding = auditOne(validGrant({ owner: null }));

  assert.equal(finding.status, "violation");
  assert.deepEqual(finding.issues, ["ownerless"]);
  assert.deepEqual(finding.missingFields, ["owner"]);
});

test("missing non-owner metadata requires review, not a confirmed violation", () => {
  const finding = auditOne(validGrant({ purpose: " ", changeTicket: "" }));

  assert.equal(finding.status, "needs_review");
  assert.deepEqual(finding.issues, ["missing_metadata"]);
  assert.deepEqual(finding.missingFields, ["changeTicket", "purpose"]);
});

test("does not classify a grant expiring today as stale and reports compliance", () => {
  const finding = auditOne(validGrant({ endDate: "2026-10-15" }));

  assert.equal(finding.status, "compliant");
  assert.deepEqual(finding.issues, []);
  assert.equal(finding.priorityScore, 0);
  assert.equal(finding.suggestedAction, "ignore");
});

test("invalid dates require review without claiming the grant is stale", () => {
  const finding = auditOne(validGrant({ endDate: "2026-02-30" }));

  assert.equal(finding.status, "needs_review");
  assert.deepEqual(finding.issues, []);
  assert.match(finding.evidence.join(" "), /Invalid endDate/);
});

test("unrecognized grant states require review instead of appearing compliant", () => {
  const finding = auditOne(validGrant({ status: "actve" }));

  assert.equal(finding.status, "needs_review");
  assert.match(finding.evidence.join(" "), /Unrecognized grant status/);
});

test("missing required dates are review metadata under the time-bound policy", () => {
  const finding = auditOne(validGrant({ endDate: undefined }));

  assert.equal(finding.status, "needs_review");
  assert.deepEqual(finding.issues, ["missing_metadata"]);
  assert.deepEqual(finding.missingFields, ["endDate"]);
  assert.equal(finding.policyRule, "P-01");
});

test("handles malformed entries and rejects a non-array audit input", () => {
  const findings = auditAccessGrants([null, validGrant({ permissions: "all" })], {
    getNow: fixedNow,
  });

  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.status === "needs_review"));
  assert.ok(findings.every((finding) => finding.evidence.length > 0));
  assert.throws(() => auditAccessGrants(null, { getNow: fixedNow }), TypeError);
});

test("reports sparse array slots as malformed records", () => {
  const grants = new Array(1);
  const findings = auditAccessGrants(grants, { getNow: fixedNow });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, "needs_review");
  assert.equal(findings[0].grantId, "");
});

test("handles cyclic object references in malformed input safely", () => {
  const grant = validGrant();
  grant.permissions = "all";
  grant.unexpectedReference = grant;

  assert.equal(auditOne(grant).status, "needs_review");
});

test("collapses duplicate grant IDs into one ambiguous review finding", () => {
  const first = validGrant();
  const second = validGrant({ resource: "Another Workspace" });
  const findings = auditAccessGrants([first, second], { getNow: fixedNow });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].grantId, "G-TEST");
  assert.equal(findings[0].status, "needs_review");
  assert.equal(findings[0].resource, "");
  assert.match(findings[0].evidence[0], /appears 2 times/);
});

test("produces stable IDs and output for the same input and injected clock", () => {
  const first = auditAccessGrants(mockAccessGrants, { getNow: fixedNow });
  const second = auditAccessGrants(mockAccessGrants, { getNow: fixedNow });
  const reordered = auditAccessGrants([...mockAccessGrants].reverse(), { getNow: fixedNow });

  assert.deepEqual(first, second);
  assert.deepEqual(first, reordered);
  assert.deepEqual(first.map(({ id }) => id), first.map((_, index) => `F-${String(index + 1).padStart(3, "0")}`));
});

test("detects circular delegation without recursing indefinitely", () => {
  const first = validGrant({ id: "G-CYCLE-1", delegatesTo: ["G-CYCLE-2"] });
  const second = validGrant({ id: "G-CYCLE-2", delegatesTo: ["G-CYCLE-1"] });
  const findings = auditAccessGrants([first, second], { getNow: fixedNow });

  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.status === "needs_review"));
  assert.ok(findings.every((finding) => finding.evidence.some((item) => item.includes("Delegation cycle"))));
});

test("all mock records produce findings using only documented status and action values", () => {
  const findings = auditAccessGrants(mockAccessGrants, { getNow: fixedNow });
  const statuses = new Set(["violation", "needs_review", "compliant"]);
  const actions = new Set(["revoke", "extend", "escalate", "ignore"]);
  const issues = new Set(["stale", "over_broad", "ownerless", "missing_metadata"]);

  assert.equal(findings.length, mockAccessGrants.length);
  for (const finding of findings) {
    assert.ok(statuses.has(finding.status));
    assert.ok(actions.has(finding.suggestedAction));
    assert.ok(finding.issues.every((issue) => issues.has(issue)));
    assert.ok(Number.isInteger(finding.priorityScore));
    assert.ok(finding.evidence.length > 0 || finding.status === "compliant");
  }
});
