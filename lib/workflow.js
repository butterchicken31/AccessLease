// Simulated revocation workflow: a small state machine.
// A grant cannot jump from "flagged" to "revoked" unless it is an emergency revoke.
export const STATE_LABELS = {
  flagged: "Flagged",
  owner_notified: "Owner notified",
  grace_period: "Grace period",
  escalated: "Escalated",
  extended: "Extension granted",
  exception_accepted: "Exception accepted",
  revoked: "Revoked",
  none: "No action needed",
};

export const ACTIONS = {
  notify_owner: { label: "Notify owner", tone: "neutral" },
  start_grace: { label: "Start grace period", tone: "neutral" },
  revoke: { label: "Revoke access", tone: "danger" },
  emergency_revoke: { label: "Emergency revoke", tone: "danger" },
  extend: { label: "Extend expiry", tone: "neutral", needsExpiry: true },
  escalate: { label: "Escalate to security lead", tone: "neutral" },
  accept_exception: { label: "Accept as exception", tone: "neutral" },
};

export const TRANSITIONS = {
  flagged: { notify_owner: "owner_notified", escalate: "escalated", accept_exception: "exception_accepted", emergency_revoke: "revoked" },
  owner_notified: { start_grace: "grace_period", extend: "extended", escalate: "escalated", accept_exception: "exception_accepted", emergency_revoke: "revoked" },
  grace_period: { revoke: "revoked", extend: "extended", escalate: "escalated", accept_exception: "exception_accepted" },
  escalated: { notify_owner: "owner_notified", revoke: "revoked", extend: "extended", accept_exception: "exception_accepted" },
  extended: { notify_owner: "owner_notified", revoke: "revoked" },
  exception_accepted: {},
  revoked: {},
};

export function actionsFor(state) {
  const t = TRANSITIONS[state] || {};
  return Object.entries(t).map(([action, to]) => ({ action, to, ...ACTIONS[action] }));
}
