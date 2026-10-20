
import { NextResponse } from "next/server";
import {
  createPolicy,
  listPolicies,
} from "../../../lib/policy-repository.js";

export const runtime = "nodejs";

// GET /api/policies — list saved policies
export async function GET() {
  try {
    const policies = listPolicies();

    return NextResponse.json({ policies });
  } catch (error) {
    console.error("Failed to list policies:", error);

    return NextResponse.json(
      { error: "Could not load policies." },
      { status: 500 }
    );
  }
}

// POST /api/policies — save a new policy as a draft
export async function POST(request) {
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
    const { name, sourceText } = body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof sourceText !== "string" ||
      !sourceText.trim()
    ) {
      return NextResponse.json(
        { error: "Policy name and source text are required." },
        { status: 400 }
      );
    }

    if (name.length > 120 || sourceText.length > 30000) {
      return NextResponse.json(
        { error: "Policy name or source text exceeds the allowed limit." },
        { status: 413 }
      );
    }

    const policy = createPolicy({ name, sourceText });

    return NextResponse.json(
      {
        policy,
        message: "Policy saved as a draft.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create policy:", error);

    return NextResponse.json(
      { error: "Could not save the policy." },
      { status: 500 }
    );
  }
}
