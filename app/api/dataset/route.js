import { NextResponse } from "next/server";
import { loadDataset, currentDataset } from "../../../lib/store.js";
export const dynamic = "force-dynamic";

// GET  /api/dataset              -> which dataset is loaded
// POST /api/dataset { key }      -> key = "demo" | "edge" | "reset"
export async function GET() {
  return NextResponse.json(currentDataset());
}
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { status, ...rest } = loadDataset(body?.key);
  return NextResponse.json(rest, { status });
}
