// Sample content for previewing the Company policy page without calling the AI
// endpoint. SAMPLE_RESULT has exactly the shape POST /api/policies/extract
// returns. It is illustrative only and the UI always labels it as sample data.

export const SAMPLE_POLICY_TEXT = `Acme Corp - Temporary Access Policy (v2.3)

1. All temporary access must have an expiry date. Access without an expiry date is not permitted.
2. Temporary access may not exceed 30 days without written approval from the Security team.
3. Every access grant must have a named owner who is accountable for reviewing it.
4. Contractors and vendors should receive only the minimum permissions required for their work.
5. Accounts of employees who have left the company must be disabled promptly.
6. Elevated privileges should be reviewed regularly and removed when no longer needed.
7. Delegated access must be documented with a business purpose and a change ticket.
8. Staff must complete annual security awareness training.`;

export const SAMPLE_RESULT = {
  policyName: "Acme Corp Temporary Access Policy",
  message:
    "These are unapproved AI-generated candidates. Review every rule before use.",
  rules: [
    {
      id: "CAND-001",
      title: "Temporary access must have an expiry date",
      description:
        "Every temporary grant needs an end date. Grants with no expiry are not allowed.",
      sourceExcerpt: "All temporary access must have an expiry date.",
      excerptVerified: true,
      ruleType: "expiry",
      parameters: {},
      confidence: "high",
      needsClarification: false,
      clarificationQuestion: "",
      approved: false,
    },
    {
      id: "CAND-002",
      title: "Temporary access limited to 30 days",
      description:
        "Temporary access may not run longer than 30 days unless the Security team approves it in writing.",
      sourceExcerpt:
        "Temporary access may not exceed 30 days without written approval from the Security team.",
      excerptVerified: true,
      ruleType: "maximum_duration",
      parameters: { maxDays: 30, exceptionApprover: "Security team" },
      confidence: "medium",
      needsClarification: true,
      clarificationQuestion:
        "Is there a hard upper limit even when the Security team approves an extension?",
      approved: false,
    },
    {
      id: "CAND-003",
      title: "Every grant needs a named owner",
      description:
        "Each access grant must record an owner who is accountable for reviewing it.",
      sourceExcerpt: "Every access grant must have a named owner",
      excerptVerified: true,
      ruleType: "owner",
      parameters: {},
      confidence: "high",
      needsClarification: false,
      clarificationQuestion: "",
      approved: false,
    },
    {
      id: "CAND-004",
      title: "Least privilege for contractors and vendors",
      description:
        "Contractors and vendors should only hold the minimum permissions their work requires.",
      sourceExcerpt:
        "Contractors and vendors should receive only the minimum permissions required for their work.",
      excerptVerified: true,
      ruleType: "least_privilege",
      parameters: { appliesTo: ["contractor", "vendor"] },
      confidence: "medium",
      needsClarification: true,
      clarificationQuestion:
        "Which permissions count as broader than “minimum required”? A list of permissions to flag would make this checkable.",
      approved: false,
    },
    {
      id: "CAND-005",
      title: "Disable accounts of departed employees promptly",
      description:
        "Accounts belonging to people who have left must be disabled soon after they leave.",
      sourceExcerpt:
        "Accounts of employees who have left the company must be disabled promptly.",
      excerptVerified: true,
      ruleType: "inactive_identity",
      parameters: {},
      confidence: "medium",
      needsClarification: true,
      clarificationQuestion:
        "What does “promptly” mean here: hours, days, or the end of the notice period?",
      approved: false,
    },
    {
      id: "CAND-006",
      title: "Delegated access needs a purpose and change ticket",
      description:
        "Delegated access must be documented with a business purpose and a change ticket.",
      sourceExcerpt:
        "Delegated access must be documented with a business purpose and a change ticket.",
      excerptVerified: true,
      ruleType: "required_metadata",
      parameters: { requiredFields: ["purpose", "changeTicket"] },
      confidence: "high",
      needsClarification: false,
      clarificationQuestion: "",
      approved: false,
    },
    {
      id: "CAND-007",
      title: "Review elevated privileges regularly",
      description:
        "Elevated privileges should be reviewed on a recurring basis and removed when no longer needed.",
      sourceExcerpt:
        "Elevated privileges should be reviewed regularly and removed when no longer needed.",
      excerptVerified: true,
      ruleType: "unsupported",
      parameters: {},
      confidence: "low",
      needsClarification: true,
      clarificationQuestion:
        "How often is “regularly”? Review cadence isn’t a rule type AccessLease can check yet.",
      approved: false,
    },
    {
      id: "CAND-008",
      title: "Annual security awareness training",
      description:
        "All staff must complete security awareness training once a year.",
      sourceExcerpt: "Staff must complete annual security awareness training.",
      excerptVerified: true,
      ruleType: "unsupported",
      parameters: {},
      confidence: "low",
      needsClarification: true,
      clarificationQuestion: "",
      approved: false,
    },
    {
      id: "CAND-009",
      title: "Guest accounts expire after 7 days",
      description:
        "Guest accounts are automatically removed after seven days.",
      // The endpoint blanks the excerpt when the quoted text isn't in the policy.
      sourceExcerpt: "",
      excerptVerified: false,
      ruleType: "expiry",
      parameters: { maxDays: 7 },
      confidence: "low",
      needsClarification: true,
      clarificationQuestion: "",
      approved: false,
    },
  ],
};
