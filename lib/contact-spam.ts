// Spam gate for the contact form (Priscilla, 2026-09-16: "We got a lot of
// messages like this", random-string names and messages from bots).
//
// Every accepted submission costs real money and attention: a Telegram ping,
// an owner email, an acknowledgement email to the given address (which for
// spam is usually a harvested REAL person's address), and an LLM translation
// call. So the gate runs BEFORE any of that, and it is layered so no single
// trick lets a bot through while a real customer never notices it:
//
//  1. honeypot   - a hidden field humans can't see; bots fill every field.
//  2. timing     - the form stamps its load time; a POST with no stamp is a
//                  script talking straight to the API, a POST a moment after
//                  load is a bot. Humans need seconds to type.
//  3. gibberish  - the observed spam uses random-case letter salad with no
//                  spaces ("nvOezpRraMAbbAOp", "sZDVapszsTECDjZsQIYpHy").
//                  A real name or message has spaces, or is short.
//
// Silent drops answer {ok:true} exactly like a real submission, so the bot
// learns nothing. Only the "too fast" case gets a visible error, because that
// one can hit a real person using autofill, and they must be able to retry.

export const MIN_FILL_MS = 3_000;

// Random-case letter salad: no whitespace, long enough that it can't be a real
// single word, the case flips back and forth far more than any real word or
// name does, AND capitals cluster mid-word ("MAbbAO", "TECD"). That last test
// is what separates spam from a CamelCase name like "JeanClaudeVanDamme",
// which flips often but never stacks two capitals.
export function looksLikeGibberish(s: string): boolean {
  const v = s.trim();
  if (v.length < 10 || /\s/.test(v)) return false;
  const letters = v.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  let flips = 0;
  for (let i = 1; i < letters.length; i++) {
    const a = letters[i - 1] === letters[i - 1].toUpperCase();
    const b = letters[i] === letters[i].toUpperCase();
    if (a !== b) flips++;
  }
  if (flips < 4) return false;
  return /[A-Z]{2}/.test(letters) || flips >= 8;
}

export type SpamVerdict =
  | { kind: "ok" }
  | { kind: "drop"; reason: string } // answer ok:true, send nothing
  | { kind: "retry" }; // answer with an error so a human can resubmit

export function judgeContact(input: {
  name: string;
  message: string;
  honeypot: string | null;
  formLoadedAt: number | null; // epoch ms as sent by the form
  now: number;
}): SpamVerdict {
  if (input.honeypot) return { kind: "drop", reason: "honeypot" };
  if (input.formLoadedAt === null || !Number.isFinite(input.formLoadedAt)) {
    return { kind: "drop", reason: "no-timestamp" };
  }
  if (looksLikeGibberish(input.name)) return { kind: "drop", reason: "gibberish-name" };
  if (looksLikeGibberish(input.message)) return { kind: "drop", reason: "gibberish-message" };
  // A stamp from the future or absurdly old is forged; a stamp seconds ago
  // is a bot. Either way not silent: autofill + a quick click can look the
  // same, and that person deserves a retry.
  const age = input.now - input.formLoadedAt;
  if (age < MIN_FILL_MS || age > 6 * 60 * 60_000) return { kind: "retry" };
  return { kind: "ok" };
}
