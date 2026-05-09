import Link from "next/link";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Admin · SickMotos" };

const NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Manual blocks", href: "/admin/blocks" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white">
      <header className="bg-ink text-white">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/admin" className="flex items-baseline gap-3">
            <span className="font-barlow font-black uppercase text-xl tracking-tight">
              SickMotos
            </span>
            <span className="text-[10px] tracking-[0.3em] uppercase text-white/40">
              Admin
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-xs font-bold tracking-[0.15em] uppercase text-white/70 hover:text-white transition-colors"
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
            <LogoutButton />
          </nav>
        </div>
        <nav className="sm:hidden flex items-center gap-5 px-5 pb-3 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-xs font-bold tracking-[0.15em] uppercase text-white/70 hover:text-white whitespace-nowrap"
            >
              {n.label}
            </Link>
          ))}
          <LogoutButton />
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
