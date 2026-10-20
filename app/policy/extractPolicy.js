// Client for POST /api/policies/extract.
//
// Why not components/ui.js getJSON? Extraction can take up to a minute, so the
// page needs to cancel it (AbortSignal), and it needs the HTTP status to show a
// useful explanation. getJSON does neither. Otherwise this behaves the same:
// JSON in, JSON out, and the server's `error` string becomes the message.

export class ExtractError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ExtractError";
    this.status = status;
  }
}

export async function extractPolicy(policyText, signal) {
  let res;

  try {
    res = await fetch("/api/policies/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyText }),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ExtractError(
      "Couldn’t reach the server. Check your connection and that the app is still running.",
      0
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ExtractError(
      typeof data?.error === "string" && data.error
        ? data.error
        : `Request failed (${res.status})`,
      res.status
    );
  }

  if (!Array.isArray(data?.rules)) {
    throw new ExtractError(
      "The server responded, but not with a list of rules.",
      res.status
    );
  }

  return data;
}

// Turns a failure into { title, message, hint, setup } for the error panel.
// `setup` is true when the cause is missing server configuration.
export function describeError(err) {
  const message = err?.message || "Something went wrong.";
  const status = err?.status ?? 0;

  if (/GROQ_API_KEY/i.test(message)) {
    return {
      title: "AI extraction isn’t set up yet",
      message,
      hint: "Restart the dev server after adding it. You can still preview this page with sample results.",
      setup: true,
    };
  }

  if (status === 400) {
    return {
      title: "That policy text can’t be used",
      message,
      hint: "Adjust the text and try again.",
    };
  }

  if (status === 413) {
    return {
      title: "Policy text is too long",
      message,
      hint: "Split the policy into sections and extract them one at a time.",
    };
  }

  if (status === 504) {
    return {
      title: "Extraction timed out",
      message,
      hint: "Long policies can take too long. Try a shorter section, or try again.",
    };
  }

  if (status === 502) {
    return {
      title: "The extraction service had a problem",
      message,
      hint: "This is usually temporary. Try again in a moment.",
    };
  }

  if (status === 0) {
    return { title: "Can’t reach the server", message, hint: "" };
  }

  return {
    title: "Extraction failed",
    message,
    hint: "Try again. If it keeps failing, check the server logs.",
  };
}
