"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const LINKS = [
  { href: "/", label: "Review queue" },
  { href: "/graph", label: "Permission graph" },
  { href: "/audit", label: "Audit log" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand"><Logo size={30} />AccessLease</Link>
        <nav>
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/findings") : path.startsWith(l.href);
            return <Link key={l.href} href={l.href} className={active ? "active" : ""}>{l.label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
