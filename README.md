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

## Run locally
npm install
npm run dev
Open http://localhost:3000

## Team
Arjun Atroley(Leader)
Divy Purswani
Dhruav Khosa
Raghav Gupta
Daksh Negi
Vedansh Jakhetiya
