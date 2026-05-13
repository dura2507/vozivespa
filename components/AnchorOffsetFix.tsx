"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// JS-based anchor scrolling so hash links land precisely below the navbar.
// CSS scroll-padding-top / scroll-margin-top kept misbehaving (Next Link
// scroll, smooth-scroll quirks, Tailwind cache), so we just take the wheel:
// intercept clicks on same-page hash links, compute the navbar height in
// real time, and scroll there ourselves. Cross-page hash links (e.g. `/#fleet`
// clicked from `/info`) navigate normally and then re-snap once the
// destination route has rendered.
function navHeight(): number {
  // Only measure the fixed top-bar, NOT the full header . when the
  // mobile hamburger dropdown is expanded, header.height balloons up to
  // include the dropdown panel, and scroll lands hundreds of px too low.
  // The first inner <div> of <header> is the top bar (height: 6.5rem).
  const topBar = document.querySelector("header > div");
  if (topBar) return topBar.getBoundingClientRect().height;
  return 104; // 6.5rem fallback
}

function scrollToHash(hash: string, behavior: ScrollBehavior = "smooth"): boolean {
  if (!hash || hash === "#") return false;
  const id = decodeURIComponent(hash.slice(1));
  const el = document.getElementById(id);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  // Land exactly under the navbar . overshoot by 1px so the previous
  // section's bottom edge stays hidden behind the bar even with browser
  // sub-pixel rounding.
  const top = window.scrollY + rect.top - navHeight() + 1;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

export default function AnchorOffsetFix() {
  const pathname = usePathname();

  // Click interception: take over hash navigation that lands on the
  // current page so we can apply the correct navbar offset.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ignore modifier-clicks so users can still cmd-click etc.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href) return;

      let hash: string | null = null;
      if (href.startsWith("#")) {
        hash = href;
      } else {
        // Absolute path with a hash, e.g. "/de#fleet" clicked from
        // "/de". Treat it as a same-page hash so we can take over the
        // scroll, otherwise Next/Link with scroll={false} just updates
        // the URL and does nothing visible. Cross-page hash links
        // (path differs) fall through to Next/Link and the pathname
        // effect below catches the scroll after the route mounts.
        const hashIdx = href.indexOf("#");
        if (hashIdx >= 0) {
          const targetPath = href.slice(0, hashIdx) || "/";
          if (targetPath === window.location.pathname) {
            hash = href.slice(hashIdx);
          }
        }
      }
      if (!hash) return;

      if (link.target && link.target !== "_self") return;

      // Capture phase + preventDefault: next/link's own onClick checks
      // e.defaultPrevented and skips its scroll/navigation. We do NOT
      // stopPropagation so React onClick handlers further down the tree
      // still fire (e.g. the mobile hamburger's setOpen(false), so the
      // dropdown actually closes before we measure the navbar height).
      e.preventDefault();
      if (window.location.hash !== hash) {
        history.pushState(null, "", hash);
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => scrollToHash(hash!)),
      );
    }
    function onHashChange() {
      scrollToHash(window.location.hash);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  // After every route change (cross-page hash navigation, back/forward,
  // or initial load), if the URL has a hash, snap to it. Two RAFs so
  // the destination route's DOM has committed before we measure.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;
    const hash = window.location.hash;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToHash(hash, "auto"));
    });
  }, [pathname]);

  return null;
}
