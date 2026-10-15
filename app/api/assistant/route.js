// POST /api/assistant { query }
// 1) Searches the findings locally (lib/search.js). 2) If a Groq key exists, asks the AI to
// answer in plain English USING ONLY those results. If AI fails, the search results still show.
import { NextResponse } from "next/server";
import { getFindings } from "../../../lib/store.js";
import { searchFindings } from "../../../lib/search.js";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const query = String(body?.query || "").trim().slice(0, 300);
  if (query.length < 2) return NextResponse.json({ error: "Type a question first." }, { status: 400 });

  const { findings, summary, asOf } = getFindings();
  const found = searchFindings(findings, query);
  const results = found.matches.map((f) => ({
    id: f.id, identity: f.identity, identityType: f.identityType, resource: f.resource, role: f.role,
    status: f.status, score: f.priorityScore, issues: f.issues, expiresAt: f.expiresAt, owner: f.owner,
    workflow: f.workflow.label, explanation: f.explanation.slice(0, 320),
  }));

  let answer = null;
  let note = null;
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    note = "AI is not set up (no GROQ_API_KEY), so these are search results only.";
  } else {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          max_tokens: 1500,
          messages: [
            {
              role: "system",
              content:
                "You are the AccessLease audit assistant for a mock institutional access register. Answer ONLY from the JSON data given. " +
                "Never invent people, grants or facts. If the data does not contain the answer, say so plainly. " +
                "Quote finding ids like F-G-02. Keep it under 120 words. Always keep 'confirmed violation' (data proves a broken rule) " +
                "separate from 'needs review' (data missing). You advise; humans decide. Never tell the user to skip the review workflow.",
            },
            {
              role: "user",
              content: `Question: ${query}\nAudit date: ${asOf.slice(0, 10)}\nRegister summary: ${JSON.stringify(summary)}\nMatching findings (${found.total} total, up to 8 shown):\n${JSON.stringify(results)}`,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "AI request failed");
      answer = data.choices?.[0]?.message?.content?.trim() || null;
      if (!answer) note = "The AI returned an empty answer. Showing search results only.";
    } catch (e) {
      note = "The AI is unavailable right now, so these are search results only.";
    }
  }
  return NextResponse.json({ answer, note, total: found.total, results });
}
