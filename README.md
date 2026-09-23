# Loot and Liberty

Discord-Bot, der das Verteilen von Loot in **Throne and Liberty** einfacher macht.
Der Leader postet ein Item und wählt aus, wer mitmachen darf. Die Spieler würfeln (1–100) oder passen per Button. Der höchste Wurf gewinnt.

## Funktionen

- **`/loot`**: Item posten, mit Name und/oder **Questlog-Link** und optional einem **Screenshot**.
  Bei einem Link versucht der Bot, Titel und Bild automatisch aus der Seite zu lesen.
- **Teilnehmer auswählen**: bis zu 25 **Spieler und/oder Rollen** in einem Auswahlmenü.
  Bei einer Rolle darf jedes Mitglied dieser Rolle würfeln. Die Ausgewählten werden angepingt.
- **🎲 Würfeln / 🚫 Passen**: Jeder hat genau eine Entscheidung. Wer nicht eingetragen ist, bekommt einen privaten Hinweis.
- **Live-Stand** im Embed: sortiert nach Wurf, dann gepasst, dann noch offen.
- **Ende**, sobald alle entschieden haben, die Zeit abläuft (Standard 10 Min.) oder der Leader auf **🛑 Beenden** klickt.
  Danach wird der Gewinner angepingt.
- **Gleichstand**: Der Leader kann per Button ein **Stechen** nur unter den Gleichplatzierten starten.

## Ablauf

1. Leader: `/loot item:<Name oder Questlog-Link> [bild:<Screenshot>] [dauer:<Minuten>]`
2. In der privaten Vorschau Spieler oder Rollen auswählen und **Posten** klicken.
3. Spieler klicken **Würfeln** oder **Passen**.
4. Der Bot verkündet den Gewinner.

## Einrichtung

Voraussetzung: Node.js 22 oder neuer.

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application mit Bot anlegen.
2. Unter **Bot → Privileged Gateway Intents** den **Server Members Intent** aktivieren.
   Den braucht der Bot, um alle Mitglieder einer Rolle zu finden.
3. Den Bot mit den Scopes `bot` und `applications.commands` einladen, mit den Rechten
   *Kanäle ansehen*, *Nachrichten senden*, *Links einbetten* und *Nachrichtenverlauf lesen*.
   Damit Rollen-Pings funktionieren, muss die Rolle erwähnbar sein oder der Bot braucht *@everyone/@here und alle Rollen erwähnen*.
4. Konfiguration:
   ```bash
   cp .env.example .env   # Token, Client-ID und optional Server-ID eintragen
   npm install
   npm run deploy         # Slash-Command registrieren (einmalig bzw. nach Änderungen)
   npm start
   ```

### Wer ist Leader?

- Ist `LOOT_LEADER_ROLE_IDS` gesetzt (kommagetrennte Rollen-IDs), dürfen nur diese Rollen (und Admins) Loot posten.
- Sonst darf das jeder mit der Berechtigung **Nachrichten verwalten**.

Beenden und Stechen dürfen der Leader, der die Verlosung gestartet hat, und alle anderen Leader.

## Entwicklung

```bash
npm test
```

Aufbau:

| Datei | Inhalt |
| --- | --- |
| `src/session.js` | Würfel- und Verlosungslogik, ohne Discord-Abhängigkeit |
| `src/item.js` | Item-Eingabe parsen, Link-Vorschau (OpenGraph) |
| `src/render.js` | Embeds und Buttons |
| `src/bot.js` | Interaction-Handling (`/loot`, Auswahl, Buttons, Timer) |
| `src/commands.js`, `src/deploy-commands.js` | Slash-Command-Definition und Registrierung |

## Bekannte Grenzen und Ideen

- Laufende Verlosungen liegen nur im Speicher. Nach einem Neustart des Bots sind offene Verlosungen nicht mehr bedienbar.
- Geplant: mehrere Würfe pro Spieler und ein anderer Zahlenbereich. `LootSession` hat dafür schon `rollMax`.
- Mögliche Erweiterungen: Need/Greed-Stufen, Loot-Historie, Sperre für kürzliche Gewinner.
