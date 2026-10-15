// Backend route that talks to the Groq API.
// The API key stays on the server and is never sent to the browser.
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Please provide a prompt." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing. Add it to .env.local (or Vercel env vars)." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [
          // Change this to fit your project (e.g. "You are a farming assistant...")
          { role: "system", content: "You are a helpful assistant. Keep answers clear and concise." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "AI request failed." },
        { status: response.status }
      );
    }

    const text = data.choices?.[0]?.message?.content || "No response received.";
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: "Server error: " + err.message }, { status: 500 });
  }
}