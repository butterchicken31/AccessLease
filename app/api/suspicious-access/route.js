
import { NextResponse } from "next/server";
import { getFindings } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

const SIGNALS = {
  stale: "Expired access",
  duplicate: "Potential duplicate access",
  over_broad: "Overly broad access",
  inactive_identity: "Inactive identity",
  orphaned_delegation: "Delegation needs checking",
};

export async function GET() {
  const data = getFindings();

  const detections = data.findings
    .filter((finding) => {
      const issues = finding.issues || [];

      return (
        ["violation", "needs_review"].includes(finding.status) ||
        issues.some((issue) => Object.hasOwn(SIGNALS, issue))
      );
    })
    .map((finding) => {
      const signals = (finding.issues || [])
        .filter((issue) => Object.hasOwn(SIGNALS, issue))
        .map((issue) => ({
          code: issue,
          label: SIGNALS[issue],
        }));

      if (finding.status === "violation" && signals.length === 0) {
        signals.push({
          code: "policy_violation",
          label: "Existing policy violation",
        });
      }

      if (finding.status === "needs_review" && signals.length === 0) {
        signals.push({
          code: "missing_data",
          label: "Missing information",
        });
      }

      return {
        id: finding.id,
        itemId: finding.itemId,
        identity: finding.identity,
        resource: finding.resource,
        role: finding.role,
        status: finding.status,
        priorityScore: finding.priorityScore,
        explanation: finding.explanation,
        signals,
        reviewState: finding.workflow?.label || "Not reviewed",
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return NextResponse.json({
    asOf: data.asOf,
    dataset: data.dataset,
    total: detections.length,
    detections,
    disclaimer:
      "These are review signals from the access register, not proof of malicious activity.",
  });
}
