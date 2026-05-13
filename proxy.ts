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

// Any path with a file extension (.svg, .ico, .png, .txt, etc.) is a
// static asset and must not be locale-prefixed. Hits Next's auto-
// detected app/icon.svg, manifest.webmanifest, robots.txt, etc.
function isStaticFile(pathname: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(pathname);
}

function isExempt(pathname: string): boolean {
  if (isStaticFile(pathname)) return true;
  return LOCALE_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

// Country → locale map for the geo-fallback path. When the browser
// hasn't sent a clear preference for any of our locales we look at
// where the request is coming from (Vercel injects the country into
// x-vercel-ip-country). A German tourist with an English browser
// visiting from Italy still gets Italian, while an Italian with a
// German browser gets German — Accept-Language always wins when it
// matches a supported locale, geo only fills the gap.
const COUNTRY_TO_LOCALE: Record<string, string> = {
  DE: "de", AT: "de", CH: "de", LI: "de",
  IT: "it", SM: "it", VA: "it",
  ES: "es",
  HR: "hr", BA: "hr", SI: "hr", ME: "hr", RS: "hr", MK: "hr",
  PL: "pl",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
};

function pickLocale(req: NextRequest): string {
  // 1. Accept-Language: try every language the browser advertises in
  //    preference order and pick the first one that maps onto one of
  //    our locales. We split off the region (de-AT → de) since our
  //    dicts are language-only.
  const acceptLang = req.headers.get("accept-language") ?? "";
  let languages: string[] = [];
  try {
    languages = new Negotiator({ headers: { "accept-language": acceptLang } }).languages();
  } catch {
    languages = [];
  }
  for (const lang of languages) {
    const code = lang.split("-")[0].toLowerCase();
    if (isLocale(code)) return code;
  }

  // 2. Geo fallback. Vercel sets x-vercel-ip-country to the two-
  //    letter country code; map it to our closest locale if we have
  //    one. Falls through to DEFAULT_LOCALE for anywhere else.
  const country = (req.headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  const geo = COUNTRY_TO_LOCALE[country];
  if (geo && isLocale(geo)) return geo;

  // 3. Last resort: the intl-localematcher best-effort over whatever
  //    the browser sent, defaulting to DEFAULT_LOCALE.
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
