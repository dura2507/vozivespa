"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Fires one POST /api/track per pathname change. Skipped on admin /
// api / static asset paths so the owner's own browsing never inflates
// the visitor count.
export function PageViewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const referrer = document.referrer || null;
    const locale = pathname.split("/")[1] || null;

    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, locale, referrer }),
      keepalive: true,
    }).catch(() => {
      // Tracking is best-effort; never disrupt the user's session
      // because a hit-counter insert failed.
    });
  }, [pathname]);

  return null;
}
