import { ImapFlow } from "imapflow";

// Mark every message in INBOX whose custom header matches the given
// value as \Seen. Used to auto-archive owner notification emails
// after Telegram delivery confirms — Telegram is the primary
// channel, the email is the safety net, so once Telegram has it the
// email's job is done. If Telegram fails, this never gets called
// and the email stays unread so the owner sees it in their inbox.
//
// Uses the same Gmail IMAP credentials as the Riderly poller; we
// reuse the connection pattern (lock → search → flag → release) and
// retry a few times because Gmail takes a moment to ingest emails
// from Resend's outbound queue. Best-effort: any failure is logged
// and swallowed — leaving an email unread is acceptable, but
// breaking the booking flow on an IMAP hiccup is not.
export async function markEmailReadByHeader(
  headerName: string,
  headerValue: string,
): Promise<{ marked: number; attempts: number } | null> {
  const user = process.env.RIDERLY_IMAP_USER?.trim();
  const pass = process.env.RIDERLY_IMAP_PASSWORD?.trim();
  if (!user || !pass) {
    console.warn("[imap-mark] IMAP credentials not set, skipping read sync");
    return null;
  }
  const host = process.env.RIDERLY_IMAP_HOST?.trim() || "imap.gmail.com";
  const port = parseInt(process.env.RIDERLY_IMAP_PORT ?? "993", 10);

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let marked = 0;
  let attempts = 0;
  try {
    await client.connect();
    // Gmail can take a few seconds to ingest a Resend outbound email
    // into INBOX. Poll up to ~6s with a short backoff so we don't
    // mark zero on the first try just because the email isn't
    // visible yet.
    const delaysMs = [400, 800, 1200, 2000, 2000];
    for (const delay of delaysMs) {
      attempts++;
      const lock = await client.getMailboxLock("INBOX");
      try {
        // imapflow's search() accepts the `header` field for arbitrary
        // header matching (RFC 3501 HEADER search criterion).
        const uids = await client.search(
          { header: { [headerName]: headerValue } },
          { uid: true },
        );
        if (uids && uids.length > 0) {
          await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
          marked = uids.length;
          break;
        }
      } finally {
        lock.release();
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  } catch (err) {
    console.error("[imap-mark] failed", err);
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
  if (marked === 0) {
    console.warn(
      `[imap-mark] no message found for ${headerName}=${headerValue} after ${attempts} attempts`,
    );
  } else {
    console.log(
      `[imap-mark] marked ${marked} message(s) as read (${headerName}=${headerValue})`,
    );
  }
  return { marked, attempts };
}
