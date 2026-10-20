// Server wrapper so this page gets its own tab title. All interactivity is in
// the client component.
import PolicyWorkspace from "./PolicyWorkspace";

export const metadata = {
  title: "Company policy · AccessLease",
  description:
    "Import a company policy and review the access-control rules extracted from it.",
};

export default function PolicyPage() {
  return <PolicyWorkspace />;
}
