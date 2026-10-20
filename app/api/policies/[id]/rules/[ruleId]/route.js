
import { NextResponse } from "next/server";
import {
  getPolicy,
  reviewPolicyRule,
} from "../../../../../../lib/policy-repository.js";

export const runtime = "nodejs";

// PATCH /api/policies/:id/rules/:ruleId
// Persist a review decision for a candidate rule.
export async function PATCH(request, { params }) {
  try {
    const { id, ruleId } = await params;
    const body = await request.json();

    if (!["approved", "rejected"].includes(body?.decision)) {
      return NextResponse.json(
        { error: "Decision must be approved or rejected." },
        { status: 400 }
      );
    }

    const policy = getPolicy(id);

    if (!policy) {
      return NextResponse.json(
        { error: "Policy not found." },
        { status: 404 }
      );
    }

    const ruleBelongsToPolicy = policy.rules.some(
      (rule) => rule.id === ruleId
    );

    if (!ruleBelongsToPolicy) {
      return NextResponse.json(
        { error: "Rule not found in this policy." },
        { status: 404 }
      );
    }

    const updatedPolicy = reviewPolicyRule(ruleId, body.decision);

    return NextResponse.json({
      policyId: id,
      rule: updatedPolicy.rules.find((rule) => rule.id === ruleId),
      message: `Rule ${body.decision}.`,
    });
  } catch (error) {
    if (error?.message === "Only candidate rules can be reviewed.") {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Failed to review policy rule:", error);

    return NextResponse.json(
      { error: "Could not save the rule review." },
      { status: 500 }
    );
  }
}
