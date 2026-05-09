"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Login failed");
        setPending(false);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Network error");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.15em]">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          className="mt-1.5 w-full bg-white/5 border border-white/15 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red focus:border-red transition-all"
        />
      </label>
      {error && <p className="text-red text-sm font-semibold">{error}</p>}
      <button
        type="submit"
        disabled={pending || !password}
        className="w-full py-4 bg-red text-white font-bold text-xs tracking-widest uppercase hover:bg-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
