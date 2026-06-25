# RentAMoto · Offene Punkte / Backlog

Stand der noch offenen Themen. Erledigtes steht im Git-Log / HANDOVER.md.

## Kostenpflichtige Features (warten auf Thomas' OK)

| Feature | Freundschaftspreis | Aufwand | Status |
|---|---|---|---|
| KI-Chatbot (6 Top-Fragen, mehrsprachig) | 500 € + 20 €/Mon | 2-3 Tage | offen |
| Apple Pay / Online-Zahlung | 500 € | 3-5 Tage | offen (Provider: Mollie/Viva statt Stripe prüfen) |
| Multi-Buchung (eigene Seite, Bikes aus ganzer Flotte wählen, Kalender-Abgleich + Smart-Vorschläge) | 1000 € | 6-8 Tage | offen |
| Aufpreis außerhalb Geschäftszeiten (7-9 / 19-22 Uhr) | gratis als Bonus | 1-2 Tage | offen |

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
