import Link from "next/link";
import { cookies } from "next/headers";
import { AdminNav } from "./admin-nav";
import { SESSION_COOKIE_NAME, isValidSession } from "@/lib/admin-session";

export const metadata = { title: "Admin · SickMotos" };

const NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Revenue", href: "/admin/revenue" },
  { label: "Blocks & walk-ins", href: "/admin/blocks" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Visitors", href: "/admin/analytics" },
  { label: "Bot chats", href: "/admin/chats" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // No chrome before login. Middleware redirects every unauthed admin
  // request to /admin/login, so when the session check fails here we
  // are rendering the login page and want it fullscreen.
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.ADMIN_PASSWORD ?? "";
  const authed = await isValidSession(sessionCookie, password);
  if (!authed) return <>{children}</>;
  return (
    <div className="min-h-screen bg-off-white">
      <header className="bg-ink text-white relative">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/admin" className="flex items-baseline gap-3">
            <span className="font-barlow font-bold uppercase text-lg tracking-tight">
              SickMotos
            </span>
            <span className="text-[10px] tracking-[0.3em] uppercase text-white/40">
              Admin
            </span>
          </Link>
          <AdminNav nav={NAV} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
