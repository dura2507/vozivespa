"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Admin links don't prefetch (Vercel CPU limit, see admin-nav.tsx), so a tap
// waits for the server before anything changes and loading.tsx can't show
// early either. On a phone that read as "I tapped and nothing happens"
// (Kristian, 2026-10-27). This answers every admin link tap and GET filter form
// at once: a moving bar on top and the page fades, until the new URL renders.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [loading, setLoading] = useState(false);

  // The new URL is on screen: navigation finished.
  useEffect(() => {
    setLoading(false);
  }, [pathname, search]);

  useEffect(() => {
    const inAdmin = (url: URL) => url.origin === location.origin && url.pathname.startsWith("/admin");
    const goesTo = (url: URL) =>
      inAdmin(url) &&
      // Same page (or only a #hash): the URL won't change, nothing would end
      // the bar.
      !(url.pathname === location.pathname && url.search === location.search) &&
      // Session expired: every tap is sent back to the login URL already
      // shown, so the URL never changes either.
      location.pathname !== "/admin/login";

    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      // A tap on the current page while another one loads cancels that load
      // and stays here, so it must also clear the bar.
      if (inAdmin(url)) setLoading(goesTo(url));
    }
    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      // Only plain GET forms navigate (e.g. the revenue date filter). Server
      // action forms stay on the page and show their own button state.
      if (form.method.toLowerCase() !== "get" || typeof form.action !== "string") return;
      const url = new URL(form.action, location.href);
      url.search = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      // Forms handled in JS (the blocks form) also default to GET but cancel
      // the submit; only judge once every handler has run (a microtask would
      // run between listeners for a real tap, a task runs after all of them).
      setTimeout(() => {
        if (!e.defaultPrevented && goesTo(url)) setLoading(true);
      }, 0);
    }
    // Back button after a full page load (revenue filter): Safari restores
    // the old page from its cache exactly as it was left, bar included.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setLoading(false);
    }
    // iOS Safari only shows :active (the pressed look on cards and buttons)
    // once a touch listener exists.
    const noop = () => {};
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("touchstart", noop, { passive: true });
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("touchstart", noop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // A navigation that fails or is cancelled never changes the URL: give up
  // after a while instead of fading the page forever.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-admin-loading", loading);
    // Also on unmount: an expired session redirects to /admin/login, which
    // renders without this component and must not stay faded.
    return () => document.documentElement.removeAttribute("data-admin-loading");
  }, [loading]);

  return (
    <div
      aria-hidden
      className={`admin-progress fixed top-0 inset-x-0 h-1 z-[100] pointer-events-none overflow-hidden ${
        loading ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="admin-progress-bar h-full w-1/3 bg-red" />
    </div>
  );
}
