"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { label: string; href: string };

// Active when the path matches exactly, or is a sub-route (but "/admin"
// only matches itself, not every /admin/* page).
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = nav.find((n) => isActive(pathname, n.href));

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <>
      {/* Desktop: inline nav */}
      <nav className="hidden sm:flex items-center gap-6">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            prefetch={false}
            className={`text-xs font-bold tracking-[0.15em] uppercase transition-colors ${
              isActive(pathname, n.href) ? "text-white" : "text-white/55 hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        ))}
        <Link
          href="/"
          target="_blank"
          className="text-xs font-bold tracking-[0.15em] uppercase text-white/40 hover:text-white transition-colors"
        >
          View site →
        </Link>
        <button
          onClick={logout}
          className="text-xs font-bold tracking-[0.15em] uppercase text-white/40 hover:text-red transition-colors"
        >
          Logout
        </button>
      </nav>

      {/* Mobile: hamburger toggle showing the current page label */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden flex items-center gap-2 text-white"
        aria-label="Menu"
        aria-expanded={open}
      >
        <span className="text-xs font-bold tracking-[0.15em] uppercase text-white/90">
          {current?.label ?? "Menu"}
        </span>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile: full-width dropdown with big tap targets */}
      {open && (
        <div className="sm:hidden absolute left-0 right-0 top-full z-50 bg-ink border-t border-white/10 shadow-xl">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              prefetch={false}
              onClick={() => setOpen(false)}
              className={`block px-5 py-4 text-sm font-bold tracking-[0.15em] uppercase border-b border-white/5 ${
                isActive(pathname, n.href)
                  ? "bg-red text-white"
                  : "text-white/80 active:bg-white/10"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/"
            target="_blank"
            onClick={() => setOpen(false)}
            className="block px-5 py-4 text-sm font-bold tracking-[0.15em] uppercase text-white/50 border-b border-white/5"
          >
            View site →
          </Link>
          <button
            onClick={logout}
            className="block w-full text-left px-5 py-4 text-sm font-bold tracking-[0.15em] uppercase text-white/50 active:bg-white/10"
          >
            Logout
          </button>
        </div>
      )}
    </>
  );
}
