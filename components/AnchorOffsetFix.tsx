"use client";

import { useEffect } from "react";

// JS-based anchor scrolling so hash links land precisely below the navbar.
// CSS scroll-padding-top / scroll-margin-top kept misbehaving (Next Link
// scroll, smooth-scroll quirks, Tailwind cache), so we just take the wheel:
// intercept clicks on same-page hash links, compute the navbar height in
// real time, and scroll there ourselves.
export default function AnchorOffsetFix() {
  useEffect(() => {
    function navHeight(): number {
      const header = document.querySelector("header");
      if (header) return header.getBoundingClientRect().height;
      return 104; // 6.5rem fallback
    }

    function scrollToHash(hash: string, behavior: ScrollBehavior = "smooth"): boolean {
      if (!hash || hash === "#") return false;
      const id = decodeURIComponent(hash.slice(1));
      const el = document.getElementById(id);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      // Land exactly under the navbar — overshoot by 1px so the previous
      // section's bottom edge stays hidden behind the bar even with browser
      // sub-pixel rounding.
      const top = window.scrollY + rect.top - navHeight() + 1;
      window.scrollTo({ top: Math.max(0, top), behavior });
      return true;
    }

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
      } else if (href.startsWith("/#") && window.location.pathname === "/") {
        hash = href.slice(1);
      }
      if (!hash) return;

      // Don't interfere if the page is currently navigating elsewhere.
      if (link.target && link.target !== "_self") return;

      // Capture phase ensures we run BEFORE next/link's own handler.
      // stopPropagation makes sure Next never sees this click and
      // doesn't try its own scroll/navigation.
      e.preventDefault();
      e.stopPropagation();
      if (window.location.hash !== hash) {
        history.pushState(null, "", hash);
      }
      // RAF so the URL bar updates first, then we scroll. Smooth either way.
      requestAnimationFrame(() => scrollToHash(hash));
    }

    // On mount, if URL already has a hash, snap to it once layout settles.
    if (window.location.hash) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToHash(window.location.hash, "auto"));
      });
    }

    // Capture phase, on document, so we beat next/link.
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", () => scrollToHash(window.location.hash));
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
