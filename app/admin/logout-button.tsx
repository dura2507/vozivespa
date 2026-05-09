"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="text-xs font-bold tracking-[0.15em] uppercase text-white/40 hover:text-red transition-colors"
    >
      Logout
    </button>
  );
}
