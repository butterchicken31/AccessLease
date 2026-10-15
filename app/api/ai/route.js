import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Please provide a prompt." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey || apiKey === "YOUR_REAL_GROQ_API_KEY") {
      return NextResponse.json(
        { error: "Configure a valid GROQ_API_KEY in .env.local." },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          temperature: 1,
          max_completion_tokens: 2048,
          top_p: 1,
          stream: true,
          reasoning_effort: "medium",
          stop: null,
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      console.error("Groq API error:", response.status, data);

      return NextResponse.json(
        { error: data?.error?.message || "AI request failed." },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "No response received from Groq." },
        { status: 502 }
      );
    }

    // Groq streams chunks; collect them into the existing JSON response.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let text = "";

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();

          if (!payload || payload === "[DONE]") continue;

          try {
            const chunk = JSON.parse(payload);
            text += chunk.choices?.[0]?.delta?.content || "";
          } catch {
            // Ignore malformed individual chunks.
          }
        }
      }

      buffer += decoder.decode();

      // Process any remaining complete SSE event.
      for (const line of buffer.split("\n")) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();

        if (!payload || payload === "[DONE]") continue;

        try {
          const chunk = JSON.parse(payload);
          text += chunk.choices?.[0]?.delta?.content || "";
        } catch {
          // Ignore malformed trailing chunks.
        }
      }
    } finally {
      reader.releaseLock();
    }

    return NextResponse.json({
      text: text || "No response received.",
    });
  } catch (error) {
    console.error("AI route error:", error);

    return NextResponse.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}