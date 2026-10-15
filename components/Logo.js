"use client";
// Shows /public/logo.png. If the file is missing, shows a small coloured square instead (no broken image).
import { useState } from "react";

export default function Logo({ size = 32 }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="logo-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="AccessLease logo" style={{ height: size, width: "auto" }} onError={() => setFailed(true)} />;
}
