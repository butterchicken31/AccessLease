import { NextResponse } from "next/server";
import { applyReview } from "../../../lib/store.js";
export const dynamic = "force-dynamic";

// POST /api/review  { findingId, action, reviewer, reason, newExpiry? }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const out = applyReview(body || {});
  const { status, ...rest } = out;
  return NextResponse.json(rest, { status });
}
