import { NextResponse, type NextRequest } from "next/server";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { SESSION_COOKIE_NAME, isValidSession } from "@/lib/admin-session";
import { LOCALES, DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";

// Paths that bypass locale prefixing. Admin and api keep their flat
// URLs; the booking-token confirmation flow is one-shot and lives
// off email links, also not localised yet.
const LOCALE_EXEMPT_PREFIXES = [
  "/admin",
  "/api",
  "/booking/",
  "/_next",
  "/bikes/",
  "/gallery/",
  "/badges/",
  "/favicon.ico",
  "/sickmotos.svg",
  "/rentamoto.svg",
  "/sickmotos-logo.png",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
];

function isExempt(pathname: string): boolean {
  return LOCALE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

function pickLocale(req: NextRequest): string {
  const headers = { "accept-language": req.headers.get("accept-language") ?? "" };
  let languages: string[] = [];
  try {
    languages = new Negotiator({ headers }).languages();
  } catch {
    languages = [DEFAULT_LOCALE];
  }
  try {
    return match(languages, LOCALES as readonly string[], DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function gateAdmin(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return null;
  }
  if (pathname === "/admin/login" || pathname === "/api/admin/auth") {
    return NextResponse.next();
  }
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.ADMIN_PASSWORD ?? "";
  const ok = await isValidSession(cookie, password);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  if (pathname !== "/admin") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  // Admin auth fast-path. Returns early when the path is admin-y so
  // the locale routing below can't fight the auth redirect.
  const adminResponse = await gateAdmin(req);
  if (adminResponse) return adminResponse;

  const { pathname } = req.nextUrl;
  if (isExempt(pathname)) return NextResponse.next();

  // Already has a locale prefix → continue.
  const firstSegment = pathname.split("/")[1] ?? "";
  if (firstSegment && isLocale(firstSegment)) return NextResponse.next();

  // No locale: pick from Accept-Language, redirect with prefix.
  const locale = pickLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals; everything else funnels through the proxy.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
