"use client";
// "use client" = this page runs in the browser (needed for useState and click handlers).

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      // Calls OUR backend route (app/api/ai/route.js), never the AI provider directly.
      // This keeps the API key hidden on the server.
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setAnswer(data.text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Hackathon Starter</h1>
      <p className="sub">Replace this page with your idea. The AI call below already works.</p>

      <div className="card">
        <label htmlFor="prompt">Ask something</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type a question or task..."
        />
        <button onClick={handleSubmit} disabled={loading || !prompt.trim()}>
          {loading ? "Thinking..." : "Get answer"}
        </button>

        {error && <p className="result error">{error}</p>}
        {answer && <p className="result">{answer}</p>}
      </div>
    </main>
  );
}
