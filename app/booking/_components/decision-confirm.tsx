"use client";

import { useState } from "react";

type Action = "confirm" | "decline" | "cancel";

const LABEL: Record<Action, { button: string; pending: string; heading: string }> = {
  confirm: { button: "Confirm this booking", pending: "Confirming…", heading: "Confirm booking" },
  decline: { button: "Decline this booking", pending: "Declining…", heading: "Decline booking" },
  cancel: { button: "Yes, cancel my booking", pending: "Cancelling…", heading: "Cancel booking" },
};

// Renders the action button behind a confirm / decline / cancel link. The
// mutation only happens on this explicit click (a POST), so link-preview
// bots and mail scanners that fetch the URL can't change anything.
export function DecisionConfirm({
  token,
  action,
  intro,
}: {
  token: string;
  action: Action;
  intro: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function run() {
    setState("busy");
    try {
      const res = await fetch(`/api/booking/${token}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        setState("done");
        setMessage(
          action === "cancel"
            ? "Your booking is cancelled and the dates are released."
            : `Booking ${data.status}.`,
        );
      } else {
        setState("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (state === "done") {
    return <p className="text-ink text-base leading-relaxed font-semibold">{message}</p>;
  }

  const l = LABEL[action];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-base leading-relaxed">{intro}</p>
      {state === "error" && <p className="text-red text-sm font-semibold">{message}</p>}
      <div>
        <button
          type="button"
          onClick={run}
          disabled={state === "busy"}
          className={`inline-flex items-center gap-2 font-bold text-xs tracking-widest uppercase px-7 py-4 transition-colors disabled:opacity-60 ${
            action === "confirm"
              ? "bg-[#25D366] text-white hover:bg-[#1EBD5A]"
              : "bg-red text-white hover:bg-red/90"
          }`}
        >
          {state === "busy" ? l.pending : l.button}
        </button>
      </div>
    </div>
  );
}
