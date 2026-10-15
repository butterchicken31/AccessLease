// ONE place that decides "today". The demo date is fixed so the demo data always
// shows the same results. Set DEMO_DATE=live in .env.local to use the real clock.
const DEFAULT_NOW = "2026-10-15T09:00:00Z";

export function getNow() {
  const v = process.env.DEMO_DATE;
  if (v === "live") return new Date();
  const d = new Date(v || DEFAULT_NOW);
  return isNaN(d.getTime()) ? new Date(DEFAULT_NOW) : d;
}
