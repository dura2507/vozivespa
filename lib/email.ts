import { Resend, type CreateEmailOptions } from "resend";
import { CATEGORIES, BRAND } from "@/lib/mockData";
import { retry } from "@/lib/retry";
import type { BookingRow } from "@/lib/supabase";

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

// Postgres `time` returns 'HH:MM:SS' — keep just HH:MM for display.
function fmtTimeOfDay(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
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
    } as const
  )[id];
}

function ridingStyleLabel(s: BookingRow["riding_style"]): string {
  if (s === "solo") return "Solo";
  if (s === "with_passenger") return "With passenger";
  return "-";
}

function bookingSummaryHtml(booking: BookingRow): string {
  const bikeName = bikeNameFor(booking);
  const nights = nightsBetween(booking.date_from, booking.date_to);
  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;background:#f6f5f1;padding:18px;">
    <tr><td style="padding:4px 0;color:#6b6b6b;width:120px;">Bike</td><td style="padding:4px 0;font-weight:600;">${escape(bikeName)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">Pickup</td><td style="padding:4px 0;font-weight:600;">${fmtDate(booking.date_from)}${pickup ? ` &middot; ${pickup}` : ""}</td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">Return</td><td style="padding:4px 0;font-weight:600;">${fmtDate(booking.date_to)}${ret ? ` &middot; ${ret}` : ""} <span style="color:#6b6b6b;font-weight:400;">(${nights} ${nights === 1 ? "day" : "days"})</span></td></tr>
    <tr><td style="padding:4px 0;color:#6b6b6b;">Total</td><td style="padding:4px 0;font-weight:600;color:#B61F36;">${totalEur(booking)}</td></tr>
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
    <p style="margin:18px 0 0;font-size:13px;color:#6b6b6b;">Confirm or decline directly in Telegram — the buttons there flip the booking status and notify the customer.</p>
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
  };
  if (receipt?.url) {
    options.attachments = [{ path: receipt.url, filename: receipt.filename }];
  }

  await sendWithRetry("ownerBooking", options);
}

// ---------- Customer: booking received --------------------------------------

export async function sendCustomerBookingReceivedEmail(booking: BookingRow): Promise<void> {
  const bikeName = bikeNameFor(booking);

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escape(booking.customer_name)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">thanks for your booking request. We&apos;ll review it and confirm by email shortly - usually within a few hours.</p>
    ${bookingSummaryHtml(booking)}
    <p style="margin:24px 0 8px;font-size:14px;color:#6b6b6b;line-height:1.6;">In the meantime, anything urgent?</p>
    ${contactButtonsHtml()}
    <p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;line-height:1.6;">See you in Zadar.</p>
  `;

  const html = htmlLayout({
    preheader: `We got your booking request for the ${bikeName}. Owner confirms shortly.`,
    headline: "Got your request",
    accent: "ink",
    bodyHtml,
  });

  const pickup = fmtTimeOfDay(booking.pickup_time);
  const ret = fmtTimeOfDay(booking.return_time);
  const text = `Hi ${booking.customer_name},

Thanks for your booking request. We'll review it and confirm by email shortly - usually within a few hours.

Bike: ${bikeName}
Pickup: ${fmtDate(booking.date_from)}${pickup ? ` · ${pickup}` : ""}
Return: ${fmtDate(booking.date_to)}${ret ? ` · ${ret}` : ""}
Total: ${totalEur(booking)}

Anything urgent? WhatsApp us: ${ownerWaLink()}

See you in Zadar.
${BRAND.name}`;

  await sendWithRetry("customerReceived", {
    from: fromAddress(),
    to: booking.customer_email,
    subject: `We got your booking - ${bikeName} ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`,
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
  const bikeName = bikeNameFor(booking);
  const isConfirmed = decision === "confirmed";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const cancelUrl = `${siteUrl}/booking/${encodeURIComponent(booking.secret_token)}/cancel`;

  const headline = isConfirmed ? "✓ Booking confirmed" : "Update on your booking";
  const accent = isConfirmed ? "green" : "ink";

  const bodyHtml = isConfirmed
    ? `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escape(booking.customer_name)},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">your ${escape(bikeName)} is locked in. See you in Zadar.</p>
      ${bookingSummaryHtml(booking)}
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">Pickup</h3>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;font-weight:600;">${escape(BRAND.address)}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b6b6b;">Open ${escape(BRAND.hours)}</p>
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">Bring with you</h3>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.7;">
        <li>Valid motorcycle licence (we can't hand over without it)</li>
        <li>${escape(BRAND.deposit)} deposit (cash on arrival, refunded after drop-off if no damage)</li>
        <li>Bike comes with a full tank - please return it full</li>
      </ul>
      <h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#6b6b6b;">Need to adjust?</h3>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">Pickup is locked in for ${escape(fmtDate(booking.date_from))} at ${escape(fmtTimeOfDay(booking.pickup_time))}, return ${escape(fmtDate(booking.date_to))} by ${escape(fmtTimeOfDay(booking.return_time))}. Reach out if anything changes:</p>
      ${contactButtonsHtml()}
      <p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #e6e4dd;font-size:12px;color:#6b6b6b;line-height:1.6;">Plans changed? <a href="${cancelUrl}" style="color:#B61F36;">Cancel this booking</a> - the dates open up immediately for someone else.</p>
    `
    : `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escape(booking.customer_name)},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">unfortunately we can't accommodate the ${escape(bikeName)} for these dates. Sorry about that.</p>
      ${bookingSummaryHtml(booking)}
      <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;">Want to try other dates or another bike? Drop us a line - we'll do our best to find something that works.</p>
      ${contactButtonsHtml()}
    `;

  const html = htmlLayout({
    preheader: isConfirmed
      ? `Your ${bikeName} is confirmed for ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}.`
      : `Update on your ${bikeName} booking - these dates didn't work out.`,
    headline,
    accent,
    bodyHtml,
  });

  const pickupT = fmtTimeOfDay(booking.pickup_time);
  const returnT = fmtTimeOfDay(booking.return_time);
  const text = isConfirmed
    ? `Hi ${booking.customer_name},

Your ${bikeName} is locked in.

Pickup: ${fmtDate(booking.date_from)}${pickupT ? ` · ${pickupT}` : ""}
Return: ${fmtDate(booking.date_to)}${returnT ? ` · ${returnT}` : ""}
Total: ${totalEur(booking)}

Pickup location: ${BRAND.address}
Shop hours: ${BRAND.hours}

Bring:
- Valid motorcycle licence (no licence, no ride)
- ${BRAND.deposit} deposit cash, refunded after drop-off
- Full tank in / full tank out

Need to adjust? WhatsApp us: ${ownerWaLink()}

Plans changed? Cancel anytime: ${cancelUrl}

See you in Zadar.
${BRAND.name}`
    : `Hi ${booking.customer_name},

Unfortunately we can't accommodate the ${bikeName} for ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}.

Want to try other dates or another bike? WhatsApp us: ${ownerWaLink()}

${BRAND.name}`;

  await sendWithRetry(`customer${isConfirmed ? "Confirmed" : "Declined"}`, {
    from: fromAddress(),
    to: booking.customer_email,
    subject: isConfirmed
      ? `✓ Confirmed - ${bikeName} ${fmtDate(booking.date_from)} → ${fmtDate(booking.date_to)}`
      : `Update on your booking - ${bikeName}`,
    html,
    text,
    replyTo: BRAND.email,
  });
}

// ---------- Owner: contact form submission ----------------------------------

export async function sendOwnerContactEmail(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    console.warn("[email] OWNER_EMAIL not set - skipping contact email");
    return;
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

  await sendWithRetry("ownerContact", {
    from: customisedFrom,
    to: ownerEmail,
    subject: `Contact form - ${input.name}`,
    html,
    text,
    replyTo: `${input.name} <${input.email}>`,
  });
}

// ---------- Customer: contact form acknowledgement --------------------------

export async function sendCustomerContactReceivedEmail(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const messageHtml = escape(input.message).replace(/\n/g, "<br/>");

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escape(input.name)},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">thanks for getting in touch. Your message landed with us and we&apos;ll reply as soon as we can - usually within a few hours.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b6b6b;">Your message</p>
    <div style="background:#f6f5f1;padding:18px;font-size:14px;line-height:1.6;border-left:3px solid #B61F36;">${messageHtml}</div>
    <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;">Anything urgent in the meantime?</p>
    ${contactButtonsHtml()}
    <p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;line-height:1.6;">See you in Zadar.</p>
  `;

  const html = htmlLayout({
    preheader: "Got your message - we'll reply shortly.",
    headline: "Got your message",
    accent: "ink",
    bodyHtml,
  });

  const text = `Hi ${input.name},

Thanks for getting in touch. Your message landed with us and we'll reply as soon as we can - usually within a few hours.

Your message:
${input.message}

Anything urgent? WhatsApp us: ${ownerWaLink()}

See you in Zadar.
${BRAND.name}`;

  await sendWithRetry("customerContact", {
    from: fromAddress(),
    to: input.email,
    subject: "We got your message - SickMotos",
    html,
    text,
    replyTo: BRAND.email,
  });
}
