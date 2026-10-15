import { NextResponse } from "next/server";
import { getAudit } from "../../../lib/store.js";
export const dynamic = "force-dynamic";

// GET /api/audit            -> audit log (newest first) + chain check
// GET /api/audit?tamper=1   -> also tests what happens if an old entry were edited
export async function GET(request) {
  const tamper = new URL(request.url).searchParams.get("tamper") === "1";
  return NextResponse.json(getAudit({ simulateTamper: tamper }));
}
