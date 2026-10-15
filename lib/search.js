// Local search over findings. NO AI here: plain keyword matching, so it always works.
// The AI assistant (app/api/assistant/route.js) only phrases an answer from these results.

const STOP = new Set(("the a an of for to and or is are was were who whom what which show me find list all any has have had on in at by whose give tell about please can you do does " +
  "access grant grants permission permissions people person user users everyone anyone everything with that this them their there where when how many much").split(" "));

// Words that mean a filter, not a name.
const INTENTS = [
  { words: ["admin", "admins", "administrator"], test: (f) => /admin/i.test(f.role) },
  { words: ["expired", "stale", "overdue", "expire", "expires"], test: (f) => f.issues.includes("stale") },
  { words: ["ownerless", "owner", "owners", "unowned", "nobody"], test: (f) => f.issues.includes("ownerless") },
  { words: ["violation", "violations", "violating", "violated"], test: (f) => f.status === "violation" },
  { words: ["review", "missing", "incomplete", "unknown"], test: (f) => f.status === "needs_review" },
  { words: ["delegation", "delegations", "delegated", "delegate"], test: (f) => f.kind === "delegation" },
  { words: ["inactive", "left", "departed", "former"], test: (f) => f.issues.includes("inactive_identity") },
  { words: ["compliant", "safe", "fine", "clean"], test: (f) => f.status === "compliant" },
  { words: ["revoked", "resolved", "removed"], test: (f) => f.status === "resolved" },
  { words: ["duplicate", "duplicates"], test: (f) => f.issues.includes("duplicate") },
  ...["visitor", "contractor", "student", "staff", "faculty", "service"].map((t) => ({
    words: [t, t + "s"], test: (f) => f.identityType === t,
  })),
];

const haystack = (f) =>
  [f.id, f.itemId, f.identity, f.identityType, f.resource, f.role, f.owner, f.purpose, f.status, f.kind, ...f.issues]
    .filter(Boolean).join(" ").toLowerCase();

export function searchFindings(findings, query, limit = 8) {
  const tokens = String(query || "").toLowerCase().replace(/[^a-z0-9\-~. ]/g, " ").split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

  const active = [];
  const used = new Set();
  for (const it of INTENTS) {
    if (tokens.some((t) => it.words.includes(t))) { active.push(it); it.words.forEach((w) => used.add(w)); }
  }
  const nameTokens = tokens.filter((t) => !used.has(t));

  const pool = findings.filter((f) => active.every((it) => it.test(f)));
  let scored = pool.map((f) => {
    const hay = haystack(f);
    return { f, hits: nameTokens.filter((t) => hay.includes(t)).length };
  });
  if (nameTokens.length) scored = scored.filter((s) => s.hits > 0);
  scored.sort((a, b) => b.hits - a.hits || b.f.priorityScore - a.f.priorityScore);

  return { matches: scored.slice(0, limit).map((s) => s.f), total: scored.length, filters: active.length, nameTokens };
}
