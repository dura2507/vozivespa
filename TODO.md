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
Zwei zusammenhängende Punkte, beide mit Thomas zu klären (Preis-Policy):

1. **Ab wann zählt der 2. Tag?** Aktuell: 24h + 15 Min Kulanz, danach voller
   2. Tag. D.h. wer 16 Min über 24h zurückgibt, zahlt (auf der Website,
   nicht bei Walk-ins) 2 Tage. Frage: wie viel Kulanz will Thomas (z.B. 1 Std)?
   Betrifft nur Website-Buchungen (System rechnet); Walk-ins tippt Thomas eh selbst.

2. **Nachträglich kassieren wenn Kunde zu spät zurückgibt.** Wenn ein Kunde
   länger bleibt als gebucht → wie trägt Thomas das nachträglich im System ein
   und berechnet die Differenz? Aktuell gibt's dafür keinen Weg. Bräuchte:
   Rückgabezeit/Tage nachträglich anpassen → Preis neu rechnen → Differenz
   ausweisen ("Kunde muss X € nachzahlen").
