# AccessLease

An audit tool that finds temporary access permissions that never expired.

Built for Code-e-Manipal 2.0 (Cybersecurity track).

## What it does
- Loads a mock dataset of identities, roles, resources and grants
- Checks every grant against a policy
- Flags stale, over-broad and ownerless grants
- Separates confirmed violations from missing data that needs review
- Shows a priority-ordered review queue, a policy explanation per finding,
  a simulated revocation workflow, and an audit log

## Access audit engine
The framework-independent audit engine is in `lib/access-audit.js`. Call
`auditAccessGrants(grants, { getNow })` to evaluate grants; omitting `grants`
uses the fictional dataset in `data/mock-access-grants.js`. The policy rules
are in `data/access-policies.js`. Missing owners are violations because the
policy explicitly requires an owner; missing purpose or change-ticket metadata
is reported for manual review instead.

Run the engine tests with `npm test`.

The findings API returns the generated findings as a JSON array at
`GET /api/findings`; `GET /api/findings/[id]` returns one finding or a JSON
404 response if the ID does not exist.

## Run locally
npm install
npm run dev
Open http://localhost:3000

## Team
Arjun Atroley(Leader)\n
Divy Purswani\n
Dhruav Khosa\n
Raghav Gupta\n
Daksh Negi\n
Vedansh Jakhetiya\n
