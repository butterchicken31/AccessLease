
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useTheme } from "./ThemeProvider";

const LINKS = [
  { href: "/", label: "Review queue" },
  { href: "/suspicious-access", label: "Suspicious access" },
  { href: "/graph", label: "Permission graph" },
  { href: "/audit", label: "Audit log" },
  { href: "/policy", label: "Company policy" },
];

export default function Nav() {
  const path = usePathname();
  const { theme, toggleTheme, ready } = useTheme();

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

        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          disabled={!ready}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          {ready ? (theme === "dark" ? "Light mode" : "Dark mode") : "Theme"}
        </button>
      </div>
    </header>
  );
}
