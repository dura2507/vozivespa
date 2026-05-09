import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  buildSessionCookie,
} from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/auth — { password } → sets the session cookie.
export async function POST(request: Request) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const password = process.env.ADMIN_PASSWORD?.trim();
  const submitted = typeof body.password === "string" ? body.password.trim() : "";
  if (!password) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD env var is not set on the server" },
      { status: 500 },
    );
  }
  if (submitted !== password) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const value = await buildSessionCookie(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}

// DELETE /api/admin/auth — log out.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
