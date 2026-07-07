import { NextResponse } from "next/server";
import { translate } from "@/lib/translate";

// TEMPORARY diagnostic route — verifies the DEEPL_API_KEY is set + valid and
// that the translate() pipeline works end to end. Token-gated, never returns
// the key. DELETE this file once the check is done.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (token !== "04ccf74fddfab06f") {
    return NextResponse.json({ error: "nope" }, { status: 401 });
  }

  const keyPresent = !!process.env.DEEPL_API_KEY;
  let deeplValid = false;
  let deeplInfo: unknown = null;
  if (keyPresent) {
    try {
      const r = await fetch("https://api-free.deepl.com/v2/usage", {
        headers: { Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}` },
      });
      deeplValid = r.ok;
      deeplInfo = r.ok ? await r.json() : { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e) {
      deeplInfo = { error: String(e) };
    }
  }

  const czech = await translate("Dobrý den, přijedu později, prosím počkejte na mě.", { to: "EN-GB" });
  const croatian = await translate("Bok, dolazim malo kasnije, molim pričekajte me.", { to: "EN-GB" });
  const german = await translate("Hallo, ich komme etwas später, bitte wartet auf mich.", { to: "EN-GB" });
  const english = await translate("Hi, I'll arrive a bit later, please wait for me.", { to: "EN-GB" });

  return NextResponse.json({
    keyPresent,
    deeplValid,
    deeplInfo,
    czech,
    croatian,
    german,
    english_shouldBeNull: english,
  });
}
