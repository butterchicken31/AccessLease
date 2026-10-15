import { NextResponse } from "next/server";
import { getFinding } from "../../../../lib/store.js";
export const dynamic = "force-dynamic";

// GET /api/findings/F-G-02 -> one finding in full detail
export async function GET(_req, { params }) {
  const { id } = await params;
  const f = getFinding(decodeURIComponent(id));
  if (!f) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  return NextResponse.json(f);
}
