# RentAMoto · Offene Punkte / Backlog

Stand der noch offenen Themen. Erledigtes steht im Git-Log / HANDOVER.md.

## Kostenpflichtige Features (FREIGEGEBEN - Thomas geclosed auf 1000-1500 € für alle 4, 2026-06-25)

Reihenfolge zum Bauen (Vorschlag): 1 Multi-Buchung → 2 Chatbot → 3 Apple Pay → 4 Aufpreis.

| # | Feature | Aufwand | Status |
|---|---|---|---|
| 1 | Multi-Buchung (eigene Seite, Bikes aus ganzer Flotte wählen, Kalender-Abgleich + Smart-Vorschläge) | 6-8 Tage | freigegeben, noch nicht begonnen |
| 2 | KI-Chatbot (6 Top-Fragen, mehrsprachig) | 2-3 Tage | **GEBAUT + deployed.** Wartet NUR noch auf `ANTHROPIC_API_KEY` in Vercel (siehe unten). Bis dahin sauberer WhatsApp-Fallback. |
| 3 | Apple Pay / Online-Zahlung | 3-5 Tage | freigegeben. Provider Mollie/Viva statt Stripe; eigener Meilenstein (Risiko-Stück) |
| 4 | Aufpreis außerhalb Geschäftszeiten (7-9 / 19-22 Uhr) | 1-2 Tage | freigegeben |

Hinweis Preis: alle 4 = grob 12-18 Tage Aufwand; 1000-1500 € ist deutlich unter dem alten Freundschaftspreis (2000 € + 20 €/Mon). Bei Folge-Features nicht weiter runter.

## Chatbot scharfschalten (NÄCHSTER SCHRITT, wartet auf Key)

Der Bot ist fertig gebaut, deployed und mehrsprachig. Er antwortet echt, sobald der Key da ist.

- [ ] **`ANTHROPIC_API_KEY` in Vercel setzen** (Team `dura2507s-projects` → vozivespa → Settings → Environment Variables). Key aus einem Anthropic-Konto (console.anthropic.com, Zahlung hinterlegt). Kosten mit Haiku < 0,001 € pro Antwort. Danach kurz redeployen (leerer Commit reicht), dann ist der Bot live. Kristian kam am 04.07 nicht in die Console rein → auf später verschoben.
- [ ] Offene Frage: läuft der Key über **Kristians** oder **Thomas'** Anthropic-Konto (wer trägt die Mini-Kosten)?

### 5 inhaltliche Fragen an Thomas (aus WhatsApp-Backup-Analyse 04.07, Bot hat dafür schon eine Sicherheits-Guardrail, blockiert also nicht)
Details + Belege in Memory `project_chatbot_content`. Wo Thomas' offizielle FAQ und echte Laden-Praxis sich widersprechen:
1. Diebstahl/Motorschaden: FAQ sagt "gedeckt", Chats sagen bei großen Bikes "geht auf Mieter". Was gilt, für alle Bikes gleich?
2. Schäden allgemein: "Basisversicherung inkl." vs "alle Schäden zahlt Kunde"?
3. Extra-Stunden-Gebühr (390er 6€/h) rein oder weglassen?
4. Pannenhilfe (bis 20km gratis, Inseln teurer, Schlüssel 50€): in Bot nennen oder intern?
5. Storno/Erstattung: klare Regel die der Bot sagen darf?

## Kleinere offene Punkte

### Tage-Berechnung bei knapp über 24h + Nachzahlung bei verspäteter Rückgabe
Beide mit Thomas geklärt (2026-06-25):

1. **Ab wann zählt der 2. Tag? → ERLEDIGT.** Kulanz ist jetzt 1 Std: bis 25h =
   1 Tag, ab 25h = 2. Tag. Umgesetzt in `lib/pricing.ts` (GRACE_MINUTES = 60).
   Betrifft nur Website-Buchungen; Walk-ins tippt Thomas eh selbst.

2. **Verspätete Rückgabe → Policy entschieden:** die Differenz wird einfach von
   der Kaution abgezogen, kein eigener System-Flow nötig. Thomas regelt das vor
   Ort über die Kaution. (Offen nur falls er später doch eine Protokoll-Notiz
   im System will, z.B. "X € von Kaution einbehalten" am Buchungs-Detail.)
