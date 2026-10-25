"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", emoji: "🏠" },
  { href: "/medications", label: "Medications", emoji: "💊" },
  { href: "/recipients", label: "Recipients", emoji: "👤" },
  { href: "/history", label: "History", emoji: "📋" },
  { href: "/settings", label: "Settings", emoji: "⚙️" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 border-b border-white/10" style={{ backgroundColor: "var(--nav-bg)" }}>
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-2 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
            style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}
          >
            Q
          </div>
          <span className="font-bold text-white hidden sm:block" style={{ fontSize: "var(--nav-font-size)" }}>
            Quare Care
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex gap-1 overflow-x-auto flex-1">
          {NAV_ITEMS.map(({ href, label, emoji }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                style={{
                  fontSize: "var(--nav-font-size)",
                  backgroundColor: isActive ? "var(--nav-active-bg)" : "transparent",
                  color: isActive ? "var(--nav-active-color)" : "var(--nav-color)",
                }}
              >
                <span>{emoji}</span>
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
