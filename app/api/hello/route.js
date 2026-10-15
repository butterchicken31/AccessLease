// Simple example API route. Visit /api/hello to test the backend.
// Add more routes by making new folders: app/api/<name>/route.js
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Backend is working", time: new Date().toISOString() });
}
