# RentAMoto · Offene Punkte / Backlog

Stand der noch offenen Themen. Erledigtes steht im Git-Log / HANDOVER.md.

## Kostenpflichtige Features (FREIGEGEBEN - Thomas geclosed auf 1000-1500 € für alle 4, 2026-06-25)

Reihenfolge zum Bauen (Vorschlag): 1 Multi-Buchung → 2 Chatbot → 3 Apple Pay → 4 Aufpreis.

| # | Feature | Aufwand | Status |
|---|---|---|---|
| 1 | Multi-Buchung (eigene Seite, Bikes aus ganzer Flotte wählen, Kalender-Abgleich + Smart-Vorschläge) | 6-8 Tage | freigegeben, noch nicht begonnen |
| 2 | KI-Chatbot (6 Top-Fragen, mehrsprachig) | 2-3 Tage | freigegeben. Laufende LLM-Kosten via 20 €/Mon decken (günstiges Modell + Caching) |
| 3 | Apple Pay / Online-Zahlung | 3-5 Tage | freigegeben. Provider Mollie/Viva statt Stripe; eigener Meilenstein (Risiko-Stück) |
| 4 | Aufpreis außerhalb Geschäftszeiten (7-9 / 19-22 Uhr) | 1-2 Tage | freigegeben |

Hinweis Preis: alle 4 = grob 12-18 Tage Aufwand; 1000-1500 € ist deutlich unter dem alten Freundschaftspreis (2000 € + 20 €/Mon). Bei Folge-Features nicht weiter runter.

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
