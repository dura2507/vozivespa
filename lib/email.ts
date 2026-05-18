import { Resend, type CreateEmailOptions } from "resend";
import { CATEGORIES, BRAND } from "@/lib/mockData";
import { retry } from "@/lib/retry";
import { billableDays } from "@/lib/pricing";
import type { BookingRow } from "@/lib/supabase";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { type Locale, isLocale } from "@/lib/i18n/config";

function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function bookingLocale(booking: BookingRow): Locale {
  return isLocale(booking.locale) ? booking.locale : "en";
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function sendWithRetry(
  label: string,
  options: CreateEmailOptions,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(`[email:${label}] RESEND_API_KEY not set - skipping`);
    return;
  }
  await retry(`email:${label}`, async () => {
    const { error } = await resend.emails.send(options);
    if (error) throw new Error(`resend ${label}: ${error.message}`);
  });
}

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Postgres `time` returns 'HH:MM:SS'. Keep just HH:MM for display.
function fmtTimeOfDay(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

// Same caveat as in lib/telegram.ts — compute the BILLABLE-day count
// (24h windows + grace) instead of a simple calendar diff so the email
// matches the invoice. Kept the function name as-is so callers don't
// need rewiring.
function bookingDays(b: BookingRow): number {
  return billableDays(
    new Date(`${b.date_from}T00:00:00`),
    new Date(`${b.date_to}T00:00:00`),
    b.pickup_time?.slice(0, 5) ?? "09:00",
    b.return_time?.slice(0, 5) ?? "19:00",
  );
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

function bikeNameFor(booking: BookingRow): string {
  const bike = CATEGORIES.find((c) => c.id === booking.bike_id);
  return bike?.model ?? booking.bike_id;
}

function totalEur(booking: BookingRow): string {
  return booking.total_price_cents
    ? `${(booking.total_price_cents / 100).toFixed(0)}€`
    : "-";
}

function ownerWaLink(): string {
  return `https://wa.me/${BRAND.contacts[0].phoneRaw}`;
}

/**
 * Per-contact Call + WhatsApp button row styled to match the site - used in
 * customer-facing emails. Renders one row per contact in BRAND.contacts so
 * the renter sees both the German and English options side by side.
 */
function contactButtonsHtml(): string {
  const rows = BRAND.contacts
    .filter((c) => c.phoneRaw)
    .map((c) => {
      const flag = c.languages.join(" ");
      const callHref = `tel:+${c.phoneRaw}`;
      const waHref = `https://wa.me/${c.phoneRaw}`;
      return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:13px;line-height:1.4;color:#1a1a1a;white-space:nowrap;">
      <span style="font-size:16px;line-height:1;vertical-align:middle;">${flag}</span>
      &nbsp;<strong>${escape(c.label)}</strong><br/>
      <span style="color:#6b6b6b;font-size:12px;">${escape(c.phone)}</span>
    </td>
    <td style="padding:6px 8px 6px 0;">
      <a href="${callHref}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:10px 14px;font-weight:700;font-size:11px;letter-spacing:.15em;text-transform:uppercase;white-space:nowrap;">Call</a>
    </td>
    <td style="padding:6px 0;">
      <a href="${waHref}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 14px;font-weight:700;font-size:11px;letter-spacing:.15em;text-transform:uppercase;white-space:nowrap;">WhatsApp</a>
    </td>
  </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-collapse:collapse;">
    ${rows}
  </table>`;
}

// ---------- Shared HTML layout ----------------------------------------------

function htmlLayout({
  preheader,
  headline,
  accent,
  bodyHtml,
}: {
  preheader: string;
  headline: string;
  accent: "red" | "green" | "ink";
  bodyHtml: string;
}): string {
  // Header background is dark, so 'ink' headline reads as plain white;
  // 'red' / 'green' keep their accent colour for the confirmed/declined states.
  const accentColor =
    accent === "green" ? "#25D366" : accent === "red" ? "#B61F36" : "#ffffff";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escape(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#1a1a1a;padding:24px 32px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#ffffff80;">${BRAND.name} · Rent a Moto · Zadar</p>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;letter-spacing:-.01em;color:${accentColor};">${escape(headline)}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#f6f5f1;padding:18px 32px;border-top:1px solid #e6e4dd;">
          <p style="margin:0;font-size:11px;color:#6b6b6b;line-height:1.6;">
            ${BRAND.legal} · OIB ${BRAND.oib} · ${escape(BRAND.address)}<br/>
            <a href="${ownerWaLink()}" style="color:#25D366;text-decoration:none;font-weight:600;">WhatsApp ${escape(BRAND.contacts[0].phone)}</a> · <a href="mailto:${BRAND.email}" style="color:#1a1a1a;text-decoration:none;">${BRAND.email}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function paymentLabel(id: BookingRow["payment_method"]): string {
  if (!id) return "-";
  return (
    {
      paypal_ff: "PayPal · Friends & Family",
      paypal_company: "PayPal · Company",
      bank: "Bank Transfer (SEPA)",
      revolut: "Revolut",
    } as const
  )[id];
}

function ridingStyleLabel(s: BookingRow["riding_style"]): string {
  if (s === "solo") return "Solo";
  if (s === "with_passenger") return "With passenger";
  return "-";
}

function bookingSummaryHtml(booking: BookingRow, sum?: Dictionary["emails"]["summary"]): string {
  const bikeName = bikeNameFor(booking);
  const nights = bookingDays(booking);
  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);
  const lBike = sum?.bike ?? "Bike";
  const lPickup = sum?.pickup ?? "Pickup";
  const lReturn = sum?.return ?? "Return";
  const lTotal = sum?.total ?? "Total";
  const lDays = sum?.days ?? "days";
  const lDay = sum?.day ?? "day";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;background:#f6f5f1;padding:18px;">
    <tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">${lBike}</td><td style="padding:4px 0;font-weight:600;">${escape(bikeName)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">${lPickup}</td><td style="padding:4px 0;font-weight:600;">${fmtDate(booking.date_from)}${pickup ? ` &middot; ${pickup}` : ""}</td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">${lReturn}</td><td style="padding:4px 0;font-weight:600;">${fmtDate(booking.date_to)}${ret ? ` &middot; ${ret}` : ""} <span style="color:#6b6b6b;font-weight:400;">(${nights} ${nights === 1 ? lDay : lDays})</span></td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">${lTotal}</td><td style="padding:4px 0;font-weight:600;color:#B61F36;">${totalEur(booking)}</td></tr>
  </table>`;
}

// ---------- Owner: new booking request --------------------------------------

// Mirror of the Telegram alert, with the receipt screenshot attached as
// a real email attachment so the owner has a permanent record outside
// the Storage bucket. Owner inbox is OWNER_EMAIL.
export async function sendOwnerBookingEmail(
  booking: BookingRow,
  receipt?: { url: string; mime: string; filename: string },
  unitLabel?: string | null,
): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set - skipping owner booking notification");
    return;
  }

  const bikeName = bikeNameFor(booking);
  const phoneDigits = booking.customer_phone.replace(/[^\d]/g, "");
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">New booking request from <strong>${escape(booking.customer_name)}</strong>.</p>
    ${bookingSummaryHtml(booking)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:14px;line-height:1.6;background:#f6f5f1;padding:18px;">
      ${unitLabel ? `<tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">Unit</td><td style="padding:4px 0;font-weight:600;">${escape(unitLabel)}</td></tr>` : ""}
      <tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">Deposit via</td><td style="padding:4px 0;font-weight:600;">${escape(paymentLabel(booking.payment_method))}</td></tr>
      <tr><td style="padding:4px 0;color:#6b6b6b;">Licence</td><td style="padding:4px 0;font-weight:600;">${escape(booking.drivers_licence ?? "-")}</td></tr>
      <tr><td style="padding:4px 0;color:#6b6b6b;">Riding</td><td style="padding:4px 0;font-weight:600;">${escape(ridingStyleLabel(booking.riding_style))}</td></tr>
      <tr><td style="padding:4px 0;color:#6b6b6b;">Email</td><td style="padding:4px 0;"><a href="mailto:${escape(booking.customer_email)}" style="color:#1a1a1a;">${escape(booking.customer_email)}</a></td></tr>
      <tr><td style="padding:4px 0;color:#6b6b6b;">Phone</td><td style="padding:4px 0;">${escape(booking.customer_phone)}${waLink ? ` &middot; <a href="${waLink}" style="color:#25D366;text-decoration:none;font-weight:600;">WhatsApp →</a>` : ""}</td></tr>
      ${booking.notes ? `<tr><td style="padding:4px 0;color:#6b6b6b;vertical-align:top;">Notes</td><td style="padding:4px 0;white-space:pre-wrap;">${escape(booking.notes)}</td></tr>` : ""}
    </table>
    ${
      receipt?.url
        ? `<p style="margin:18px 0 8px;font-size:13px;color:#6b6b6b;">Deposit screenshot is attached to this email${receipt.url ? ` and viewable here: <a href="${receipt.url}" style="color:#B61F36;">open receipt</a>` : ""}.</p>`
        : `<p style="margin:18px 0 8px;font-size:13px;color:#B61F36;">No deposit screenshot attached.</p>`
    }
    <p style="margin:18px 0 0;font-size:13px;color:#6b6b6b;">Confirm or decline directly in Telegram . the buttons there flip the booking status and notify the customer.</p>
  `;

  const html = htmlLayout({
    preheader: `New booking request: ${bikeName} ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`,
    headline: "New booking request",
    accent: "ink",
    bodyHtml,
  });

  const text = `New booking request

Bike: ${bikeName}${unitLabel ? ` (${unitLabel})` : ""}
Pickup: ${fmtDate(booking.date_from)} ${fmtTimeOfDay(booking.pickup_time)}
Return: ${fmtDate(booking.date_to)} ${fmtTimeOfDay(booking.return_time)}
Total: ${totalEur(booking)}
Deposit via: ${paymentLabel(booking.payment_method)}
Licence: ${booking.drivers_licence ?? "-"}
Riding: ${ridingStyleLabel(booking.riding_style)}

Customer: ${booking.customer_name}
Email: ${booking.customer_email}
Phone: ${booking.customer_phone}${booking.notes ? `\nNotes: ${booking.notes}` : ""}

${receipt?.url ? `Receipt attached. Direct link: ${receipt.url}` : "No deposit screenshot attached."}

Confirm or decline in Telegram.`;

  const options: CreateEmailOptions = {
    from: fromAddress(),
    to: ownerEmail,
    subject: `New booking · ${booking.customer_name} · ${bikeName} · ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`,
    html,
    text,
    replyTo: `${booking.customer_name} <${booking.customer_email}>`,
    // Tagged so the IMAP read-state sync can find the right message
    // in INBOX after Telegram delivery succeeds. See lib/imap-mark.ts.
    headers: { "X-Booking-Id": booking.id },
  };
  if (receipt?.url) {
    options.attachments = [{ path: receipt.url, filename: receipt.filename }];
  }

  await sendWithRetry("ownerBooking", options);
}

// ---------- Owner: cancellation notice --------------------------------------

// Sent when a booking flips to `cancelled` — either via the admin
// panel (owner-side cancel) or the customer's cancel link from the
// confirmation email. Mirrors the Telegram fan-out so the owner has
// an inbox record regardless of where the cancel came from.
export async function sendOwnerCancellationEmail(
  booking: BookingRow,
  source: "customer" | "owner",
): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set - skipping owner cancellation notice");
    return;
  }

  const bikeName = bikeNameFor(booking);
  const phoneDigits = booking.customer_phone.replace(/[^\d]/g, "");
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
  const who = source === "customer" ? "Customer cancelled" : "Booking cancelled (admin)";

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;"><strong>${escape(booking.customer_name)}</strong> &middot; ${escape(bikeName)}</p>
    ${bookingSummaryHtml(booking)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:14px;line-height:1.6;background:#f6f5f1;padding:18px;">
      <tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">Email</td><td style="padding:4px 0;"><a href="mailto:${escape(booking.customer_email)}" style="color:#1a1a1a;">${escape(booking.customer_email)}</a></td></tr>
      <tr><td style="padding:4px 0;color:#6b6b6b;">Phone</td><td style="padding:4px 0;">${escape(booking.customer_phone)}${waLink ? ` &middot; <a href="${waLink}" style="color:#25D366;text-decoration:none;font-weight:600;">WhatsApp →</a>` : ""}</td></tr>
    </table>
    <p style="margin:18px 0 0;font-size:13px;color:#6b6b6b;">Dates have been released automatically · calendar updated.</p>
  `;

  const html = htmlLayout({
    preheader: `${who}: ${bikeName} ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`,
    headline: who,
    accent: "red",
    bodyHtml,
  });

  const text = `${who}

Bike: ${bikeName}
Pickup: ${fmtDate(booking.date_from)} ${fmtTimeOfDay(booking.pickup_time)}
Return: ${fmtDate(booking.date_to)} ${fmtTimeOfDay(booking.return_time)}

Customer: ${booking.customer_name}
Email: ${booking.customer_email}
Phone: ${booking.customer_phone}

Dates released automatically.`;

  await sendWithRetry("ownerCancellation", {
    from: fromAddress(),
    to: ownerEmail,
    subject: `Cancelled · ${booking.customer_name} · ${bikeName} · ${fmtDate(booking.date_from)}`,
    html,
    text,
    replyTo: booking.customer_email && booking.customer_email.includes("@")
      ? `${booking.customer_name} <${booking.customer_email}>`
      : undefined,
    headers: { "X-Booking-Id": booking.id },
  });
}

// ---------- Owner: Riderly forward ------------------------------------------

// Sent in parallel to the Telegram forward so the owner has the
// Riderly booking in their inbox too. Buttons stay in Telegram (the
// magic accept/reject URLs work in both, but Telegram inline buttons
// are nicer); email is just a record + quick view link.
export async function sendOwnerRiderlyEmail(payload: {
  kind: "booking" | "other";
  receivedAt: Date | null;
  subject?: string;
  from?: string;
  preview?: string;
  riderlyUrl?: string | null;
  booking?: {
    bookingId: string;
    bikeName: string | null;
    startDate: string | null;
    endDate: string | null;
    totalEur: string | null;
    acceptUrl: string | null;
    rejectUrl: string | null;
    inboxUrl: string | null;
  };
}): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set - skipping owner Riderly email");
    return;
  }

  if (payload.kind === "booking" && payload.booking) {
    const b = payload.booking;
    const bodyHtml = `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">New booking via <strong>Riderly</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:14px;line-height:1.6;background:#f6f5f1;padding:18px;">
        <tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">Booking ID</td><td style="padding:4px 0;font-family:monospace;">${escape(b.bookingId)}</td></tr>
        ${b.bikeName ? `<tr><td style="padding:4px 0;color:#6b6b6b;">Bike</td><td style="padding:4px 0;font-weight:600;">${escape(b.bikeName)}</td></tr>` : ""}
        ${b.startDate ? `<tr><td style="padding:4px 0;color:#6b6b6b;">Pickup</td><td style="padding:4px 0;">${escape(b.startDate)}</td></tr>` : ""}
        ${b.endDate ? `<tr><td style="padding:4px 0;color:#6b6b6b;">Return</td><td style="padding:4px 0;">${escape(b.endDate)}</td></tr>` : ""}
        ${b.totalEur ? `<tr><td style="padding:4px 0;color:#6b6b6b;">Total</td><td style="padding:4px 0;font-weight:600;">€${escape(b.totalEur)}</td></tr>` : ""}
      </table>
      <p style="margin:18px 0 0;font-size:13px;">
        ${b.acceptUrl ? `<a href="${b.acceptUrl}" style="color:#25D366;font-weight:600;text-decoration:none;">✓ Accept</a>` : ""}
        ${b.acceptUrl && b.rejectUrl ? " &middot; " : ""}
        ${b.rejectUrl ? `<a href="${b.rejectUrl}" style="color:#B61F36;font-weight:600;text-decoration:none;">✗ Reject</a>` : ""}
        ${b.inboxUrl ? ` &middot; <a href="${b.inboxUrl}" style="color:#6b6b6b;">Open in Riderly inbox</a>` : ""}
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#6b6b6b;">Buttons also available in your Telegram message.</p>
    `;
    const html = htmlLayout({
      preheader: `Riderly booking · ${b.bikeName ?? b.bookingId}`,
      headline: "Riderly booking",
      accent: "ink",
      bodyHtml,
    });
    const text = `Riderly booking

Booking: ${b.bookingId}
${b.bikeName ? `Bike: ${b.bikeName}\n` : ""}${b.startDate ? `Pickup: ${b.startDate}\n` : ""}${b.endDate ? `Return: ${b.endDate}\n` : ""}${b.totalEur ? `Total: €${b.totalEur}\n` : ""}
${b.acceptUrl ? `Accept: ${b.acceptUrl}\n` : ""}${b.rejectUrl ? `Reject: ${b.rejectUrl}\n` : ""}${b.inboxUrl ? `Inbox: ${b.inboxUrl}\n` : ""}`;
    await sendWithRetry("ownerRiderly", {
      from: fromAddress(),
      to: ownerEmail,
      subject: `Riderly · ${b.bikeName ?? b.bookingId}`,
      html,
      text,
    });
    return;
  }

  // Non-booking Riderly email — just forward the preview.
  const subject = payload.subject ?? "(no subject)";
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;"><strong>${escape(subject)}</strong></p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b6b6b;">From ${escape(payload.from ?? "-")}</p>
    <div style="margin-top:14px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escape(payload.preview ?? "")}</div>
    ${payload.riderlyUrl ? `<p style="margin:18px 0 0;font-size:13px;"><a href="${payload.riderlyUrl}" style="color:#B61F36;text-decoration:none;font-weight:600;">Open on Riderly →</a></p>` : ""}
  `;
  await sendWithRetry("ownerRiderly", {
    from: fromAddress(),
    to: ownerEmail,
    subject: `Riderly · ${subject}`,
    html: htmlLayout({
      preheader: subject,
      headline: "Riderly notification",
      accent: "ink",
      bodyHtml,
    }),
    text: `Riderly notification\n\n${subject}\n\nFrom: ${payload.from ?? "-"}\n\n${payload.preview ?? ""}\n\n${payload.riderlyUrl ?? ""}`,
  });
}

// ---------- Customer: booking received --------------------------------------

export async function sendCustomerBookingReceivedEmail(booking: BookingRow): Promise<void> {
  // Walk-in bookings are created without a customer email (owner
  // records them outside the website). Nothing to send — skip
  // silently instead of letting Resend error on an empty `to`.
  if (!booking.customer_email || !booking.customer_email.includes("@")) {
    console.warn("[email:customerReceived] no customer email, skipping");
    return;
  }
  const bikeName = bikeNameFor(booking);
  const dict = await getDictionary(bookingLocale(booking));
  const t = dict.emails.bookingReceived;
  const vars = {
    name: booking.customer_name,
    bike: bikeName,
    from: fmtDate(booking.date_from),
    to: fmtDate(booking.date_to),
  };

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escape(fmt(t.greeting, vars))}</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escape(t.intro)}</p>
    ${bookingSummaryHtml(booking, dict.emails.summary)}
    <p style="margin:24px 0 8px;font-size:14px;color:#6b6b6b;line-height:1.6;">${escape(t.urgentLine)}</p>
    ${contactButtonsHtml()}
    <p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;line-height:1.6;">${escape(t.signoff)}</p>
  `;

  const html = htmlLayout({
    preheader: fmt(t.preheader, vars),
    headline: t.headline,
    accent: "ink",
    bodyHtml,
  });

  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);
  const text = `${fmt(t.greeting, vars)}

${t.intro}

${dict.emails.summary.bike}: ${bikeName}
${dict.emails.summary.pickup}: ${fmtDate(booking.date_from)}${pickup ? ` · ${pickup}` : ""}
${dict.emails.summary.return}: ${fmtDate(booking.date_to)}${ret ? ` · ${ret}` : ""}
${dict.emails.summary.total}: ${totalEur(booking)}

${t.urgentLine} WhatsApp: ${ownerWaLink()}

${t.signoff}
${BRAND.name}`;

  await sendWithRetry("customerReceived", {
    from: fromAddress(),
    to: booking.customer_email,
    subject: fmt(t.subject, vars),
    html,
    text,
    replyTo: BRAND.email,
  });
}

// ---------- Customer: booking decided (confirmed / declined) ----------------

export async function sendCustomerBookingDecidedEmail(
  booking: BookingRow,
  decision: "confirmed" | "declined",
): Promise<void> {
  // Same guard as the received email — walk-ins may be stored with
  // no customer email and we don't want to send to "".
  if (!booking.customer_email || !booking.customer_email.includes("@")) {
    console.warn("[email:customerDecided] no customer email, skipping");
    return;
  }
  const bikeName = bikeNameFor(booking);
  const isConfirmed = decision === "confirmed";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const cancelUrl = `${siteUrl}/booking/${encodeURIComponent(booking.secret_token)}/cancel`;

  const dict = await getDictionary(bookingLocale(booking));
  const t = isConfirmed ? dict.emails.bookingConfirmed : dict.emails.bookingDeclined;
  const vars = {
    name: booking.customer_name,
    bike: bikeName,
    from: fmtDate(booking.date_from),
    to: fmtDate(booking.date_to),
    pickupTime: fmtTimeOfDay(booking.pickup_time),
    returnTime: fmtTimeOfDay(booking.return_time),
    deposit: BRAND.deposit,
  };
  const accent = isConfirmed ? "green" : "ink";

  const bodyHtml = isConfirmed
    ? `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escape(fmt(t.greeting, vars))}</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escape(fmt(t.intro, vars))}</p>
      ${bookingSummaryHtml(booking, dict.emails.summary)}
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).pickupHeader)}</h3>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;font-weight:600;">${escape(BRAND.address)}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b6b6b;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).openHoursLabel)} ${escape(BRAND.hours)}</p>
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).bringHeader)}</h3>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.7;">
        <li>${escape((t as Dictionary["emails"]["bookingConfirmed"]).bringLicence)}</li>
        <li>${escape(fmt((t as Dictionary["emails"]["bookingConfirmed"]).bringDeposit, vars))}</li>
        <li>${escape((t as Dictionary["emails"]["bookingConfirmed"]).bringTank)}</li>
      </ul>
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).adjustHeader)}</h3>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">${escape(fmt((t as Dictionary["emails"]["bookingConfirmed"]).adjustLine, vars))}</p>
      ${contactButtonsHtml()}
      <p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #e6e4dd;font-size:12px;color:#6b6b6b;line-height:1.6;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).cancelLine)} <a href="${cancelUrl}" style="color:#B61F36;">${escape((t as Dictionary["emails"]["bookingConfirmed"]).cancelLink)}</a>${escape((t as Dictionary["emails"]["bookingConfirmed"]).cancelTail)}</p>
    `
    : `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escape(fmt(t.greeting, vars))}</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escape(fmt(t.intro, vars))}</p>
      ${bookingSummaryHtml(booking, dict.emails.summary)}
      <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;">${escape((t as Dictionary["emails"]["bookingDeclined"]).tryOther)}</p>
      ${contactButtonsHtml()}
    `;

  const html = htmlLayout({
    preheader: fmt(t.preheader, vars),
    headline: t.headline,
    accent,
    bodyHtml,
  });

  const text = isConfirmed
    ? `${fmt(t.greeting, vars)}

${fmt(t.intro, vars)}

${dict.emails.summary.pickup}: ${fmtDate(booking.date_from)} ${fmtTimeOfDay(booking.pickup_time)}
${dict.emails.summary.return}: ${fmtDate(booking.date_to)} ${fmtTimeOfDay(booking.return_time)}
${dict.emails.summary.total}: ${totalEur(booking)}

${(t as Dictionary["emails"]["bookingConfirmed"]).pickupHeader}: ${BRAND.address}
${(t as Dictionary["emails"]["bookingConfirmed"]).openHoursLabel}: ${BRAND.hours}

WhatsApp: ${ownerWaLink()}

${(t as Dictionary["emails"]["bookingConfirmed"]).cancelLine} ${cancelUrl}

${BRAND.name}`
    : `${fmt(t.greeting, vars)}

${fmt(t.intro, vars)}

${(t as Dictionary["emails"]["bookingDeclined"]).tryOther}

WhatsApp: ${ownerWaLink()}

${BRAND.name}`;

  await sendWithRetry(`customer${isConfirmed ? "Confirmed" : "Declined"}`, {
    from: fromAddress(),
    to: booking.customer_email,
    subject: fmt(t.subject, vars),
    html,
    text,
    replyTo: BRAND.email,
  });
}

// ---------- Owner: contact form submission ----------------------------------

// Returns a short reference id that's stamped on the outgoing email
// as the X-Contact-Ref header so the IMAP read-state sync can mark
// this exact message as seen once Telegram delivery confirms.
// Returns null when OWNER_EMAIL isn't configured (we skip the send).
export async function sendOwnerContactEmail(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}): Promise<string | null> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set - skipping contact email");
    return null;
  }

  const messageHtml = escape(input.message).replace(/\n/g, "<br/>");
  const phoneDigits = input.phone ? input.phone.replace(/[^\d]/g, "") : "";

  const phoneRowHtml = input.phone
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;">
         <a href="tel:${escape(input.phone)}" style="color:#1a1a1a;text-decoration:none;font-weight:600;">${escape(input.phone)}</a>
         ${phoneDigits ? ` &middot; <a href="https://wa.me/${phoneDigits}" style="color:#25D366;text-decoration:none;font-weight:600;">WhatsApp →</a>` : ""}
       </p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b6b6b;">From</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;font-weight:600;">${escape(input.name)}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;"><a href="mailto:${escape(input.email)}?subject=${encodeURIComponent("Re: your message to SickMotos")}" style="color:#B61F36;text-decoration:none;font-weight:600;">${escape(input.email)}</a></p>
    ${phoneRowHtml}
    <div style="background:#f6f5f1;padding:18px;font-size:14px;line-height:1.6;border-left:3px solid #B61F36;">${messageHtml}</div>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6e4dd;font-size:13px;color:#6b6b6b;line-height:1.6;">Hit <strong>Reply</strong> in your email client to answer ${escape(input.name)} directly - their address is set as the reply-to so it goes straight to them.</p>
  `;

  const html = htmlLayout({
    preheader: `Contact form: ${input.name}`,
    headline: "New contact message",
    accent: "ink",
    bodyHtml,
  });

  const text = `New contact message

From: ${input.name} <${input.email}>${input.phone ? `\nPhone: ${input.phone}` : ""}

${input.message}

Reply to ${input.email} to respond.`;

  // Tag the From-name with the customer's name so the inbox preview reads
  // "Kristian (via SickMotos)" instead of just SickMotos Bookings.
  const fromMatch = fromAddress().match(/^(.+?)\s*<(.+)>$/);
  const fromAddr = fromMatch ? fromMatch[2] : fromAddress();
  const customisedFrom = `${input.name} (via SickMotos) <${fromAddr}>`;

  // Each contact submission gets a one-shot id so the IMAP marker
  // can find this exact email after Telegram delivery confirms.
  const contactRef = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await sendWithRetry("ownerContact", {
    from: customisedFrom,
    to: ownerEmail,
    subject: `Contact form - ${input.name}`,
    html,
    text,
    replyTo: `${input.name} <${input.email}>`,
    headers: { "X-Contact-Ref": contactRef },
  });
  return contactRef;
}

// ---------- Customer: contact form acknowledgement --------------------------

export async function sendCustomerContactReceivedEmail(input: {
  name: string;
  email: string;
  message: string;
  locale?: string;
}): Promise<void> {
  const locale: Locale = isLocale(input.locale ?? "") ? (input.locale as Locale) : "en";
  const dict = await getDictionary(locale);
  const t = dict.emails.contactReceived;
  const vars = { name: input.name };
  const messageHtml = escape(input.message).replace(/\n/g, "<br/>");

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escape(fmt(t.greeting, vars))}</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escape(t.intro)}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b6b6b;">${escape(t.yourMessage)}</p>
    <div style="background:#f6f5f1;padding:18px;font-size:14px;line-height:1.6;border-left:3px solid #B61F36;">${messageHtml}</div>
    ${contactButtonsHtml()}
    <p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;line-height:1.6;">${escape(t.signoff)}</p>
  `;

  const html = htmlLayout({
    preheader: t.preheader,
    headline: t.headline,
    accent: "ink",
    bodyHtml,
  });

  const text = `${fmt(t.greeting, vars)}

${t.intro}

${t.yourMessage}
${input.message}

WhatsApp: ${ownerWaLink()}

${t.signoff}
${BRAND.name}`;

  await sendWithRetry("customerContact", {
    from: fromAddress(),
    to: input.email,
    subject: t.subject,
    html,
    text,
    replyTo: BRAND.email,
  });
}
