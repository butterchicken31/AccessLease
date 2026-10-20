
import { NextResponse } from "next/server";
import {
  addPolicyRule,
  getPolicy,
} from "../../../../../lib/policy-repository.js";

export const runtime = "nodejs";

function confidenceValue(value) {
  if (typeof value === "number" && value >= 0 && value <= 1) {
    return value;
  }

  return {
    high: 0.9,
    medium: 0.6,
    low: 0.3,
  }[value] ?? null;
}

// GET /api/policies/:id/rules
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const policy = getPolicy(id);

    if (!policy) {
      return NextResponse.json(
        { error: "Policy not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ rules: policy.rules });
  } catch (error) {
    console.error("Failed to load policy rules:", error);

    return NextResponse.json(
      { error: "Could not load policy rules." },
      { status: 500 }
    );
  }
}

// POST /api/policies/:id/rules
// Saves extracted rules as unapproved candidates.
export async function POST(request, { params }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const policy = getPolicy(id);

    if (!policy) {
      return NextResponse.json(
        { error: "Policy not found." },
        { status: 404 }
      );
    }

    const { rules } = body ?? {};

    if (
      !Array.isArray(rules) ||
      rules.length === 0 ||
      rules.length > 30
    ) {
      return NextResponse.json(
        { error: "Provide between 1 and 30 rules." },
        { status: 400 }
      );
    }

    // Validate the entire batch before writing any rules.
    const valid = rules.every((rule) =>
      rule &&
      typeof rule.title === "string" &&
      rule.title.trim() &&
      typeof rule.description === "string" &&
      rule.description.trim() &&
      typeof rule.ruleType === "string" &&
      rule.ruleType.trim() &&
      typeof rule.sourceExcerpt === "string" &&
      rule.sourceExcerpt.trim() &&
      rule.parameters !== null &&
      typeof rule.parameters === "object" &&
      !Array.isArray(rule.parameters)
    );

    if (!valid) {
      return NextResponse.json(
        { error: "One or more rules have invalid fields." },
        { status: 400 }
      );
    }

    // Verify each quoted excerpt against the original policy text.
    if (
      rules.some(
        (rule) => !policy.source_text.includes(rule.sourceExcerpt.trim())
      )
    ) {
      return NextResponse.json(
        { error: "A rule excerpt does not match the saved policy text." },
        { status: 400 }
      );
    }

    const db = (await import("../../../../../lib/policy-db.js"))
      .getPolicyDatabase();

    const savedRules = [];

    // A transaction prevents a partially saved batch if any insert fails.
    db.exec("BEGIN");

    try {
      for (const rule of rules) {
        const updatedPolicy = addPolicyRule(id, {
          title: rule.title,
          description: rule.description,
          ruleType: rule.ruleType,
          parameters: rule.parameters,
          sourceExcerpt: rule.sourceExcerpt,
          confidence: confidenceValue(rule.confidence),
        });

        savedRules.push(updatedPolicy.rules[updatedPolicy.rules.length - 1]);
      }

      db.prepare(`
        UPDATE policies
        SET updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), id);

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return NextResponse.json(
      {
        rules: savedRules,
        message: "Rules saved as unapproved candidates.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to save policy rules:", error);

    return NextResponse.json(
      { error: "Could not save policy rules." },
      { status: 500 }
    );
  }
}
