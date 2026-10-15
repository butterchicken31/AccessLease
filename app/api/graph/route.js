import { NextResponse } from "next/server";
import { getGraph } from "../../../lib/store.js";
export const dynamic = "force-dynamic";

// GET /api/graph -> nodes (identities, resources) and edges (grants/delegations) with status
export async function GET() {
  return NextResponse.json(getGraph());
}
