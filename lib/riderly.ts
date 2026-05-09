import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Riderly is a separate booking platform that doesn't expose an API.
// Owner gets an email when a customer books through riderly.com. To
// keep all bookings visible in one place we poll a mailbox the owner
// forwards Riderly notifications to (or filters with a label) and
// re-emit them as Telegram alerts.

export type RiderlyEmail = {
  subject: string;
  from: string;
  preview: string; // first ~600 chars of plain text
  riderlyUrl: string | null; // first riderly.com link found in the body
  receivedAt: Date | null;
};

function extractRiderlyUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']*riderly\.com[^\s<>"']*/i);
  return match ? match[0] : null;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// Connects to the configured mailbox, fetches every unseen message in
// the mailbox/label, returns the parsed metadata, and marks them as
// read so they're not re-processed on the next cron tick. Throws on
// connection / auth issues so the caller can log + 500.
export async function pollRiderlyInbox(): Promise<RiderlyEmail[]> {
  const user = process.env.RIDERLY_IMAP_USER?.trim();
  const pass = process.env.RIDERLY_IMAP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error("RIDERLY_IMAP_USER / RIDERLY_IMAP_PASSWORD env vars not set");
  }
  const host = process.env.RIDERLY_IMAP_HOST?.trim() || "imap.gmail.com";
  const port = parseInt(process.env.RIDERLY_IMAP_PORT ?? "993", 10);
  const mailbox = process.env.RIDERLY_LABEL?.trim() || "INBOX";

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const out: RiderlyEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Default search: every unseen message in the mailbox. Owner is
      // expected to label-filter Riderly mail upstream (Gmail filter
      // → label "Riderly") so we only see relevant messages.
      for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true, uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const subject = parsed.subject ?? msg.envelope?.subject ?? "(no subject)";
        const fromAddr = parsed.from?.value?.[0]?.address ?? "(unknown)";
        const htmlBody = typeof parsed.html === "string" ? parsed.html : "";
        const rawText = parsed.text ?? htmlBody ?? "";
        const text = rawText.replace(/\s+/g, " ").trim();
        out.push({
          subject,
          from: fromAddr,
          preview: clip(text, 600),
          riderlyUrl: extractRiderlyUrl(text) ?? extractRiderlyUrl(htmlBody),
          receivedAt: parsed.date ?? null,
        });
        if (msg.uid) {
          await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
