# RentAMoto · Offene Punkte / Backlog

Stand der noch offenen Themen. Erledigtes steht im Git-Log / HANDOVER.md.

## Kostenpflichtige Features (FREIGEGEBEN - Thomas geclosed auf 1000-1500 € für alle 4, 2026-06-25)

Reihenfolge zum Bauen (Vorschlag): 1 Multi-Buchung → 2 Chatbot → 3 Apple Pay → 4 Aufpreis.

| # | Feature | Aufwand | Status |
|---|---|---|---|
| 1 | Multi-Buchung (eigene Seite, Bikes aus ganzer Flotte wählen, Kalender-Abgleich) | 6-8 Tage | **GEBAUT + live als `/group`-Seite** (Fleet-Picker, Ganzflotten-Verfügbarkeit `/api/availability/fleet`, geteiltes Datumsfenster, Kaution pro Bike). "Smart-Vorschläge" minimal. |
| 2 | KI-Chatbot (6 Top-Fragen, mehrsprachig) | 2-3 Tage | **LIVE seit 05.07.** Key in Vercel gesetzt + redeployed, live gegen Produktion verifiziert (EN/DE + Versicherungs-Guardrail antworten echt via Haiku 4.5). |
| 3 | Apple Pay / Online-Zahlung | 3-5 Tage | freigegeben. Provider Mollie/Viva statt Stripe; eigener Meilenstein (Risiko-Stück) |
| 4 | Aufpreis außerhalb Geschäftszeiten | 1-2 Tage | **SPEC'D (Thomas 06.07): 30€ pauschal pro Anmietung** für früh 7:00-8:59 ODER spät 19:00-22:00, direkt dazubuchbar. Bot nennt es schon; das Buchungs-Add-on im Flow ist noch zu bauen. |

Hinweis Preis: alle 4 = grob 12-18 Tage Aufwand; 1000-1500 € ist deutlich unter dem alten Freundschaftspreis (2000 € + 20 €/Mon). Bei Folge-Features nicht weiter runter.

## Chatbot LIVE (scharfgeschaltet 05.07)

Der Bot ist gebaut, mehrsprachig und **live**: Key in Vercel gesetzt, redeployt, am 05.07 gegen Produktion (`/api/chatbot`) verifiziert - echte Antworten in EN + DE, Versicherungs-Guardrail greift (verweist auf WhatsApp statt Zahlen zu erfinden). Modell Haiku 4.5, ~0,4 Cent/Antwort.

- [x] **`ANTHROPIC_API_KEY` in Vercel gesetzt + redeployed** (Team `dura2507s-projects` → vozivespa).
- [ ] **Guthaben low:** Konto hatte nur ~1,14 $ drauf (reicht grob 250-500 Antworten = Testphase). Vor der Peak-Saison Auto-Reload aktivieren oder auf 10-20 $ aufladen, damit der Bot nicht mitten in der Saison ausgeht.
- [x] Konto geklärt: der Key läuft **erstmal über Kristians** Anthropic-Konto (Kristian trägt die Cent-Kosten vorerst). Ggf. später auf Thomas' Konto umziehen.

### 5 inhaltliche Fragen an Thomas → BEANTWORTET + im Bot eingebaut (06.07, Commit 8b26617)
Thomas hat am 06.07 in "Monitoring RentAMoto" alles beantwortet (per Krileo-Monitoring-Bot ausgelesen, siehe [[reference_telegram_bot_readaccess]]). In `lib/chatbot/knowledge.ts` umgesetzt:
- **Versicherung:** inkl. Basis + Diebstahl + Wartungsmangel-Schäden (inkl. Abholung/Ersatz, egal wo). ALLE anderen Schäden während der Miete inkl. platter Reifen zahlt der Mieter voll. KEINE Vollkasko.
- **Storno:** Kunde storniert → 20% Reservierungsgebühr weg. Wir stornieren unsichere Fahrer bei Übergabe → keine Erstattung.
- **Extra-Stunden:** Zuzahlung pro Stunde je Modell, bei Anmietung erfragen (keine feste Zahl im Bot).
- **Pannenhilfe/Schlüsselverlust:** auf Vertrag + FAQ verweisen (keine Zahlen).
- **Zweiter Fahrer** erlaubt (mit Erfahrung + gültigem Führerschein).
- Touren-Empfehlungen je Fahrzeug + Thomas' Maps-Links eingebaut. Preise verbindlich, 24h ab Abholung. WhatsApp nur noch als letzte Eskalation.

### Bot-nahe Aufgaben (Thomas 06.07) — Stand 06.07
- [x] **WhatsApp-Funnel im Kontaktbereich** (Commit ab90de4): Bot-CTA prominent oben (öffnet Chat via `open-chatbot`-Event), WhatsApp/Anruf-Karten erst unten + erst nach ~30 Sek. sichtbar, Intro in allen 11 Sprachen auf "frag den Assistenten" umgeschrieben.
- [x] **iPhone-Problem war in Wahrheit ein 404-Link-Bug** (Commits 9eeeac5 + 57fc19f): der Bot schickte `/en/fleet` (existiert nicht) → 404. Priscillas Screenshots zeigten genau das. PAGE-LINKS gefixt: `#fleet` + echte Bike-IDs aus dem Katalog generiert. Fenster-Platzierung war schon durch z-index-Fix ok.
- [x] **Aufpreis-Add-on Einzel-Buchung** (Commit a3f9e40): 2 Checkboxen (früh 7-8:59 / spät 19-22, je 30€) im Bike-Buchungsformular, fließt in Total/20%-Gebühr/Online-Charge, steht in der Notiz für den Owner. Verfügbarkeits-Engine NICHT angefasst (reines Add-on).
- [ ] **Aufpreis-Add-on auch in GroupBooking** (`/group`) nachziehen (gleiche Logik, pro Anmietung).
- [ ] Add-on live gegen Produktion gegenchecken (lokal nicht bis ins Formular fahrbar wegen fehlender DB).
- [x] **Vertrag + FAQ als Doku hinterlegt** (Commit 5855959): Thomas hat 2 PDFs geschickt (reservation-terms + offizielle FAQ mit den echten Pannendienst-/Schlüssel-/Schaden-Zahlen). Beide unter `/public/docs/` gehostet (`/docs/reservation-terms.pdf`, `/docs/sickmotos-faq-de.pdf`), Zahlen in `knowledge.ts` eingebaut (Bot kann sie jetzt sagen + verlinkt die Docs), Sanitizer lässt `/docs` durch.
- [ ] **FAQ-PDF ist nur DE.** Inhalt ist im Bot (mehrsprachig), aber die Seiten-`/faq` (11 Sprachen) zeigt noch Thomas' alte 15 Q&A, nicht die neue offizielle FAQ (9 Q&A, detaillierter). Optional: `/faq`-Seite auf die offizielle FAQ aktualisieren.
- [ ] **NEU (Priscilla 06.07 10:51):** Banküberweisung für die **Kaution** entfernen (für die Reservierung/Gebühr ist Banküberweisung ok). Payment-Optionen anpassen.
- [ ] PayPal-Frage von Thomas: F&F (ohne Gebühr) und/oder Company (mit Gebühr) hinzufügen? (Ja/Nein.)

## Kleinere offene Punkte

### Audit-Log für Buchungen (Folge aus Leon-Vorfall 05.07)
- [ ] `bookings` hat nur `created_at`, KEIN `updated_at`/Status-History. Als am 05.07 eine Buchung (Leon) aus der Verfügbarkeit verschwand (wahrscheinlich versehentlicher "Mark as returned"-Tipp, jetzt mit Rückfrage abgesichert, Commit 50b85f4), war NICHT rekonstruierbar wer/wann. Empfehlung: kleine `booking_events`-Tabelle (booking_id, event, old->new, actor, created_at) oder mind. `updated_at` + Log in status/fulfillment-Routes. Dann ist so ein Vorfall künftig nachvollziehbar. Braucht DB-Migration, mit Kristian timen.

### Niedrig-Prio aus Site-Audit 05.07 (alles LOW, nicht kundenwirksam)
- [x] **Same-Day Zeitzonen-Kante ERLEDIGT (05.07):** `pickupSlotsFor` in `BikeDetail.tsx` keyt den "vergangene Slots"-Filter jetzt auf `zagrebNow()` (Europe/Zagreb) statt Browser-Uhr -> kein leeres Dropdown mehr für Kunden in weit entfernten Zeitzonen. Zusätzlich "(Zadar-Zeit)"-Label an der Öffnungszeiten-Notiz, in allen 11 Sprachen (`fleet.calendar.timezone`). Rest-Kante: der Kalender-Disable (`before: new Date()`) nutzt weiter Browser-Tag (viel seltener, bewusst nicht angefasst).
- [ ] **Null-Unit-Legacy-Buchungen** (bike_unit_id=null): Client-`pricing.ts` behandelt sie als Ganz-Modell-Block, Server-`findFreeUnit` zählt sie gar nicht. Aktuell ZERO Impact (keine solchen Buchungen existieren). Vor Wiedereinführung reconcilen + Test dagegen. Details in Memory `project_booking_logic_rules`.
- Erledigt 05.07: Same-Day-Pickup nutzt jetzt immer die Per-Unit-Engine (Commit 085fd38); Ghost-/Backup-Buchungen aus öffentlicher Verfügbarkeit gefiltert (Commit f53af0b).


### Tage-Berechnung bei knapp über 24h + Nachzahlung bei verspäteter Rückgabe
Beide mit Thomas geklärt (2026-06-25):

1. **Ab wann zählt der 2. Tag? → ERLEDIGT.** Kulanz ist jetzt 1 Std: bis 25h =
   1 Tag, ab 25h = 2. Tag. Umgesetzt in `lib/pricing.ts` (GRACE_MINUTES = 60).
   Betrifft nur Website-Buchungen; Walk-ins tippt Thomas eh selbst.

2. **Verspätete Rückgabe → Policy entschieden:** die Differenz wird einfach von
   der Kaution abgezogen, kein eigener System-Flow nötig. Thomas regelt das vor
   Ort über die Kaution. (Offen nur falls er später doch eine Protokoll-Notiz
   im System will, z.B. "X € von Kaution einbehalten" am Buchungs-Detail.)
