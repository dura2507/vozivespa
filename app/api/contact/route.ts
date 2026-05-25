import { NextResponse, after } from "next/server";
import { sendOwnerContactMessage } from "@/lib/telegram";
import {
  sendOwnerContactEmail,
  sendCustomerContactReceivedEmail,
} from "@/lib/email";
import { markEmailReadByHeader } from "@/lib/imap-mark";

export const dynamic = "force-dynamic";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  locale?: unknown;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// POST /api/contact - generic contact-form submission. Customer-without-WhatsApp
// path: name + email + message land as a Telegram ping for the owner and an
// email so the message is in their inbox too. Customer also gets a quick
// 'we got your message' acknowledgement.
export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = asString(body.name);
  const email = asString(body.email);
  const phone = asString(body.phone);
  const message = asString(body.message);
  const localeRaw = asString(body.locale);
  const locale =
    localeRaw && ["en", "de", "es", "it", "hr", "pl", "fr"].includes(localeRaw) ? localeRaw : "en";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const payload = { name, email, phone, message };

  after(async () => {
    const [tgResult, emailResult] = await Promise.allSettled([
      sendOwnerContactMessage({ ...payload, locale }),
      sendOwnerContactEmail({ ...payload, locale }),
      sendCustomerContactReceivedEmail({ ...payload, locale }),
    ]);
    // If Telegram delivered the ping, archive the parallel owner
    // email so the inbox doesn't pile up duplicates. Telegram
    // failure → email stays unread as the backup signal.
    if (
      tgResult.status === "fulfilled" &&
      emailResult.status === "fulfilled" &&
      emailResult.value
    ) {
      await markEmailReadByHeader("X-Contact-Ref", emailResult.value);
    }
  });

  return NextResponse.json({ ok: true });
}
