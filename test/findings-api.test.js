const assert = require("node:assert/strict");
const test = require("node:test");
const { accessPolicy } = require("../data/access-policies");
const { mockAccessGrants } = require("../data/mock-access-grants");
const { auditAccessGrants } = require("../lib/access-audit");

let getFindings;
let getFinding;

const findingKeys = [
  "id",
  "grantId",
  "identity",
  "resource",
  "role",
  "status",
  "issues",
  "missingFields",
  "priorityScore",
  "evidence",
  "policyRule",
  "explanation",
  "suggestedAction",
];
const findingStatuses = new Set(["violation", "needs_review", "compliant"]);
const findingIssues = new Set([
  "stale",
  "over_broad",
  "ownerless",
  "missing_metadata",
]);
const suggestedActions = new Set(["revoke", "extend", "escalate", "ignore"]);

test.before(async () => {
  ({ GET: getFindings } = await import("../app/api/findings/route.js"));
  ({ GET: getFinding } = await import("../app/api/findings/[id]/route.js"));
});

test("GET /api/findings returns engine-generated findings in the expected structure", async () => {
  const response = await getFindings();
  const body = await response.json();
  const expected = auditAccessGrants(mockAccessGrants, {
    getNow: () => new Date(),
    policy: accessPolicy,
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.deepEqual(body, expected);
  assert.ok(body.length > 0);

  for (const finding of body) {
    assert.deepEqual(Object.keys(finding).sort(), [...findingKeys].sort());
    assert.match(finding.id, /^F-\d{3,}$/);
    assert.equal(typeof finding.grantId, "string");
    assert.equal(typeof finding.identity, "string");
    assert.equal(typeof finding.resource, "string");
    assert.equal(typeof finding.role, "string");
    assert.ok(findingStatuses.has(finding.status));
    assert.ok(Array.isArray(finding.issues));
    assert.ok(finding.issues.every((issue) => findingIssues.has(issue)));
    assert.ok(Array.isArray(finding.missingFields));
    assert.ok(Number.isInteger(finding.priorityScore));
    assert.ok(Array.isArray(finding.evidence));
    assert.ok(finding.evidence.every((item) => typeof item === "string"));
    assert.equal(typeof finding.policyRule, "string");
    assert.equal(typeof finding.explanation, "string");
    assert.ok(suggestedActions.has(finding.suggestedAction));
  }
});

test("GET /api/findings/[id] returns an existing finding", async () => {
  const listResponse = await getFindings();
  const findings = await listResponse.json();
  const expected = findings[0];
  const response = await getFinding(
    new Request(`http://localhost/api/findings/${expected.id}`),
    { params: Promise.resolve({ id: expected.id }) }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
});

test("GET /api/findings/[id] returns JSON 404 for an unknown finding ID", async () => {
  const response = await getFinding(
    new Request("http://localhost/api/findings/F-UNKNOWN"),
    { params: Promise.resolve({ id: "F-UNKNOWN" }) }
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Finding not found." });
});

test("findings endpoints return safe JSON errors when audit evaluation fails", async () => {
  const originalRules = accessPolicy.rules;
  const originalConsoleError = console.error;
  accessPolicy.rules = null;
  console.error = () => {};

  try {
    const listResponse = await getFindings();
    assert.equal(listResponse.status, 500);
    assert.deepEqual(await listResponse.json(), {
      error: "Unable to generate findings.",
    });

    const detailResponse = await getFinding(
      new Request("http://localhost/api/findings/F-001"),
      { params: Promise.resolve({ id: "F-001" }) }
    );
    assert.equal(detailResponse.status, 500);
    assert.deepEqual(await detailResponse.json(), {
      error: "Unable to retrieve finding.",
    });
  } finally {
    accessPolicy.rules = originalRules;
    console.error = originalConsoleError;
  }
});
