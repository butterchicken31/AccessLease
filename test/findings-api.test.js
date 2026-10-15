const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const nextCli = require.resolve("next/dist/bin/next");
const findingStatuses = new Set([
  "violation",
  "needs_review",
  "compliant",
  "resolved",
]);
const suggestedActions = new Set(["revoke", "extend", "escalate", "ignore"]);

let serverProcess;
let baseUrl;
let findingsResponse;

async function findAvailablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startNextServer() {
  const port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        DEMO_DATE: "2026-10-15T09:00:00.000Z",
        PORT: String(port),
      },
      stdio: "ignore",
    }
  );

  let startupError;
  serverProcess.once("error", (error) => {
    startupError = error;
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited during startup with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/findings`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        findingsResponse = await response.json();
        return;
      }
    } catch {
      await delay(250);
    }
  }

  throw new Error("Timed out waiting for the Next.js findings endpoint.");
}

async function stopNextServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;

  const exit = new Promise((resolve) => serverProcess.once("exit", resolve));
  serverProcess.kill("SIGTERM");
  const stopped = await Promise.race([exit.then(() => true), delay(5_000).then(() => false)]);
  if (!stopped) {
    serverProcess.kill("SIGKILL");
    await exit;
  }
}

test.before(startNextServer, { timeout: 150_000 });
test.after(stopNextServer, { timeout: 10_000 });

test("GET /api/findings returns the current summary and findings structure", () => {
  assert.ok(findingsResponse);
  assert.match(findingsResponse.asOf, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(findingsResponse.dataset).sort(), ["key", "name"]);
  assert.equal(typeof findingsResponse.dataset.key, "string");
  assert.equal(typeof findingsResponse.dataset.name, "string");
  assert.deepEqual(Object.keys(findingsResponse.summary).sort(), [
    "compliant",
    "exceptions",
    "needs_review",
    "resolved",
    "total",
    "violation",
  ]);
  assert.ok(Array.isArray(findingsResponse.findings));
});

test("summary total matches the findings and records contain valid fields", () => {
  const { findings, summary } = findingsResponse;
  assert.equal(summary.total, findings.length);
  assert.equal(
    summary.violation + summary.needs_review + summary.compliant + summary.resolved,
    summary.total
  );
  assert.ok(findings.length > 0);

  for (const finding of findings) {
    assert.match(finding.id, /^F-/);
    assert.equal(typeof finding.itemId, "string");
    assert.ok(["grant", "delegation"].includes(finding.kind));
    assert.equal(typeof finding.identity, "string");
    assert.equal(typeof finding.resource, "string");
    assert.equal(typeof finding.role, "string");
    assert.ok(findingStatuses.has(finding.status));
    assert.ok(Array.isArray(finding.issues));
    assert.ok(Array.isArray(finding.missingFields));
    assert.ok(Array.isArray(finding.checks));
    assert.ok(Array.isArray(finding.evidence));
    assert.ok(Number.isFinite(finding.priorityScore));
    assert.ok(suggestedActions.has(finding.suggestedAction));
    assert.equal(typeof finding.explanation, "string");
    assert.ok(finding.workflow && typeof finding.workflow.state === "string");
    assert.ok(Array.isArray(finding.allowedActions));
  }
});

test("GET /api/findings/[id] returns the corresponding finding", async () => {
  const expected = findingsResponse.findings[0];
  const response = await fetch(`${baseUrl}/api/findings/${encodeURIComponent(expected.id)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
});

test("unknown or malformed finding IDs return a JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/findings/not-a-finding-id`);

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
});

test("review and audit timestamps use the deterministic centralized clock", async () => {
  const target = findingsResponse.findings.find(
    (finding) =>
      finding.status === "violation" &&
      finding.allowedActions.some((allowed) => allowed.action === "notify_owner")
  );
  assert.ok(target, "expected an open violation with a notify_owner action");

  const reviewResponse = await fetch(`${baseUrl}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      findingId: target.id,
      action: "notify_owner",
      reviewer: "Test Reviewer",
      reason: "Verify deterministic event and workflow timestamps.",
    }),
  });
  assert.equal(reviewResponse.status, 200);
  const review = await reviewResponse.json();
  const expectedTimestamp = "2026-10-15T09:00:00.000Z";

  assert.equal(review.entry.ts, expectedTimestamp);
  assert.equal(review.entry.asOf, expectedTimestamp);
  assert.equal(review.finding.workflow.updatedAt, expectedTimestamp);

  const auditResponse = await fetch(`${baseUrl}/api/audit`);
  assert.equal(auditResponse.status, 200);
  const audit = await auditResponse.json();
  assert.equal(audit.entries[0].ts, expectedTimestamp);
  assert.equal(audit.entries[0].asOf, expectedTimestamp);
});

test("reset reloads the active dataset, clears workflow state, and records an audit event", async () => {
  const loadEdge = await fetch(`${baseUrl}/api/dataset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "edge" }),
  });
  assert.equal(loadEdge.status, 200);
  assert.equal((await loadEdge.json()).dataset.key, "edge");

  const currentEdge = await fetch(`${baseUrl}/api/dataset`);
  assert.equal((await currentEdge.json()).key, "edge");

  const edgeFindingsResponse = await fetch(`${baseUrl}/api/findings`);
  const edgeFindings = await edgeFindingsResponse.json();
  const target = edgeFindings.findings.find((finding) =>
    finding.allowedActions.some((allowed) => allowed.action === "notify_owner")
  );
  assert.ok(target, "expected an edge finding that can be moved into workflow state");

  const review = await fetch(`${baseUrl}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      findingId: target.id,
      action: "notify_owner",
      reviewer: "Dataset Reset Test",
      reason: "Set workflow state before checking reset behavior.",
    }),
  });
  assert.equal(review.status, 200);
  const reviewedFinding = (await review.json()).finding;
  assert.equal(reviewedFinding.workflow.state, "owner_notified");

  const reset = await fetch(`${baseUrl}/api/dataset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "reset" }),
  });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).dataset.key, "edge");

  const currentAfterReset = await fetch(`${baseUrl}/api/dataset`);
  assert.equal((await currentAfterReset.json()).key, "edge");

  const findingsAfterReset = await fetch(`${baseUrl}/api/findings`);
  const resetFinding = (await findingsAfterReset.json()).findings.find(
    (finding) => finding.id === target.id
  );
  assert.equal(resetFinding.workflow.state, "flagged");
  assert.equal(resetFinding.workflow.updatedAt, null);

  const auditResponse = await fetch(`${baseUrl}/api/audit`);
  const audit = await auditResponse.json();
  assert.equal(audit.chainValid, true);
  assert.equal(audit.entries[0].action, "reset_dataset");
  assert.equal(audit.entries[0].reason, 'Dataset "edge" loaded; workflow state cleared');
});
