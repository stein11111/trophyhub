# Vice Tracker 🌴

GTA-VI-Trophäen-Fortschritt als Homescreen-App. Eine GitHub Action holt alle 2 Stunden die Trophäen vom PlayStation Network und speichert sie in `docs/`. Die App wird über GitHub Pages (Branch `main`, Ordner `/docs`) ausgeliefert.

Benötigtes Secret: `PSN_NPSSO` (von https://ca.account.sony.com/api/v1/ssocookie nach dem Login auf playstation.com). Der Code läuft nach etwa 2 Monaten ab und muss dann erneuert werden.
