import { NextResponse } from "next/server";
import { getFindings } from "../../../lib/store.js";
export const dynamic = "force-dynamic";

// GET /api/findings -> summary + all findings sorted by priority (highest first)
export async function GET() {
  return NextResponse.json(getFindings());
}
