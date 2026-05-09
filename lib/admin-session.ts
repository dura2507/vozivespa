// Lightweight HMAC-signed session cookie for the owner admin panel.
//
// We don't use Supabase Auth here on purpose — there's exactly one
// owner, who logs in by typing the ADMIN_PASSWORD env var. The cookie
// just proves they typed the right password recently. HMAC over the
// expiry timestamp prevents a stolen pre-expiry cookie from being
// re-issued without the password, and Web Crypto means it works in
// the Edge middleware too.

export const SESSION_COOKIE_NAME = "sm_admin";
const SESSION_DURATION_SEC = 60 * 60 * 24 * 30; // 30 days

async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildSessionCookie(password: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SEC;
  const sig = await hmacHex(password, `admin-${exp}`);
  return `${exp}.${sig}`;
}

export async function isValidSession(
  cookieValue: string | undefined | null,
  password: string,
): Promise<boolean> {
  if (!cookieValue || !password) return false;
  const idx = cookieValue.indexOf(".");
  if (idx <= 0) return false;
  const expStr = cookieValue.slice(0, idx);
  const sig = cookieValue.slice(idx + 1);
  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(password, `admin-${exp}`);
  return timingSafeEqual(sig, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const SESSION_MAX_AGE_SEC = SESSION_DURATION_SEC;
