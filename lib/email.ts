import { Resend } from "resend";
import { CATEGORIES, BRAND } from "@/lib/mockData";
import type { BookingRow } from "@/lib/supabase";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function escape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Send the owner the new-booking email with confirm / decline buttons.
 * Best-effort: errors are logged, never thrown — a failed email must not
 * break the booking-create transaction.
 */
export async function sendOwnerBookingEmail(booking: BookingRow): Promise<void> {
  const resend = getResend();
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  const fromAddress = process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping owner notification");
    return;
  }
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set — skipping owner notification");
    return;
  }

  const bike = CATEGORIES.find((c) => c.id === booking.bike_id);
  const bikeName = bike?.model ?? booking.bike_id;
  const nights = nightsBetween(booking.date_from, booking.date_to);
  const total = booking.total_price_cents
    ? `${(booking.total_price_cents / 100).toFixed(0)}€`
    : "—";
  const tokenPath = encodeURIComponent(booking.secret_token);
  const confirmUrl = `${siteUrl}/booking/${tokenPath}/confirm`;
  const declineUrl = `${siteUrl}/booking/${tokenPath}/decline`;
  const waPrefill = encodeURIComponent(
    `Hi ${booking.customer_name}, this is ${BRAND.name}. Confirming your ${bikeName} from ${fmtDate(
      booking.date_from,
    )} to ${fmtDate(booking.date_to)}. Total ${total}. See you in Zadar!`,
  );
  const waUrl = `https://wa.me/${booking.customer_phone.replace(/[^\d]/g, "")}?text=${waPrefill}`;

  const subject = `New booking — ${bikeName} ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#1a1a1a;padding:24px 32px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#ffffff80;">${BRAND.name}</p>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;letter-spacing:-.01em;">New booking request</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
            <tr><td style="padding:6px 0;color:#6b6b6b;width:130px;">Bike</td><td style="padding:6px 0;font-weight:600;">${escape(bikeName)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Dates</td><td style="padding:6px 0;font-weight:600;">${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)} (${nights} ${nights === 1 ? "day" : "days"})</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Total</td><td style="padding:6px 0;font-weight:600;color:#B61F36;">${total}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Name</td><td style="padding:6px 0;font-weight:600;">${escape(booking.customer_name)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Email</td><td style="padding:6px 0;"><a href="mailto:${escape(booking.customer_email)}" style="color:#1a1a1a;">${escape(booking.customer_email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Phone</td><td style="padding:6px 0;"><a href="${waUrl}" style="color:#25D366;font-weight:600;">${escape(booking.customer_phone)} · WhatsApp →</a></td></tr>
            ${booking.notes ? `<tr><td style="padding:6px 0;color:#6b6b6b;vertical-align:top;">Notes</td><td style="padding:6px 0;white-space:pre-wrap;">${escape(booking.notes)}</td></tr>` : ""}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr>
              <td style="padding-right:8px;">
                <a href="${confirmUrl}" style="display:block;background:#B61F36;color:#ffffff;text-decoration:none;text-align:center;padding:16px 24px;font-weight:700;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">✓ Confirm booking</a>
              </td>
              <td style="padding-left:8px;">
                <a href="${declineUrl}" style="display:block;background:#1a1a1a;color:#ffffff;text-decoration:none;text-align:center;padding:16px 24px;font-weight:700;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">✗ Decline</a>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:12px;color:#6b6b6b;line-height:1.6;">Confirming locks the dates on the website automatically. You can also reach out via WhatsApp first using the link above.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `New booking request

Bike: ${bikeName}
Dates: ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)} (${nights} ${nights === 1 ? "day" : "days"})
Total: ${total}
Name: ${booking.customer_name}
Email: ${booking.customer_email}
Phone: ${booking.customer_phone}
${booking.notes ? `Notes: ${booking.notes}\n` : ""}
Confirm: ${confirmUrl}
Decline: ${declineUrl}
WhatsApp customer: ${waUrl}`;

  try {
    await resend.emails.send({
      from: fromAddress,
      to: ownerEmail,
      subject,
      html,
      text,
      replyTo: booking.customer_email,
    });
  } catch (err) {
    console.error("[email] sendOwnerBookingEmail failed", err);
  }
}
