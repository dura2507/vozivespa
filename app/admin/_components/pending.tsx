"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

// Small spinning ring for a button that is waiting on the server. A bare "…"
// was easy to miss on a phone, so a tap looked ignored.
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-3.5 h-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin ${className}`}
    />
  );
}

// After a successful save the page data is re-fetched with router.refresh(),
// which can take seconds on a phone. The buttons used to snap back to idle
// as soon as the save returned, so the old page sat there looking untouched.
// Running the refresh in a transition tells us when the fresh page is on
// screen: until then `settling` names the action (its button keeps spinning)
// and `refreshing` keeps the other buttons disabled against a double tap.
// Pass `href` to go to another page instead of refreshing this one.
export function useSettledRefresh<T>() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [settling, setSettling] = useState<T | null>(null);
  useEffect(() => {
    if (!refreshing) setSettling(null);
  }, [refreshing]);
  function refresh(key: T, href?: string) {
    setSettling(key);
    startRefresh(() => (href ? router.push(href) : router.refresh()));
  }
  return { refreshing, settling, refresh };
}

// Submit button for server-action forms (group inbox, bot chats): spins from
// the tap until the action has run and the updated page is back.
export function SubmitButton({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} inline-flex items-center gap-2 disabled:cursor-wait`}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}
