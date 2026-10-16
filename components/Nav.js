
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";


const LINKS = [
  { href: "/", label: "Review queue" },
  { href: "/suspicious-access", label: "Suspicious access" },
  { href: "/graph", label: "Permission graph" },
  { href: "/audit", label: "Audit log" },
];


export default function Nav() {
  const path = usePathname();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <Logo size={30} />
          AccessLease
        </Link>

        <nav>
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? path === "/" || path.startsWith("/findings")
                : path.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "active" : ""}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
