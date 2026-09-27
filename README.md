# Loot and Liberty

Discord-Bot, der das Verteilen von Loot in **Throne and Liberty** einfacher macht.

## Ablauf

Es gibt zwei Kanäle:
- einen **Leader-Kanal** (z. B. `#loot-leitung`), den nur Leader sehen,
- einen **Loot-Kanal** (z. B. `#loot`) für alle.

1. **Leader postet das Item** im Leader-Kanal: einen **Screenshot** oder einen **Questlog-Link**, optional mit Text als Item-Name.
   Bei einem Questlog-Link ohne Screenshot zeichnet der Bot selbst eine **Item-Karte** mit Symbol, Seltenheit und Stats. Die Daten kommen von Questlog, in der Sprache des Links.
2. **„Wer darf rollen?“** erscheint direkt darunter. Der Leader wählt Spieler oder Rollen aus der **Liste**
   oder schreibt sie als `@Name` / `@Rolle` in den Leader-Kanal. `@Erwähnungen` im Item-Post werden direkt übernommen.
   Im zweiten Feld legt er fest, **wer die Verlosung verwaltet**: einzelne Leader, eine oder mehrere Leader-Rollen oder beides.
   Er selbst verwaltet immer mit. Im dritten Feld wählt er die **Rollzeit** (1–72 Stunden, Vorgabe per `/einrichten`).
   Stimmt der erkannte Item-Name nicht, korrigiert er ihn mit **✏️ Namen ändern**. Das geht auch später noch im Panel.
   Dann klickt er auf **📣 Posten & Spieler pingen**.
3. **Der Bot postet das Item mit Bild im Loot-Kanal** und öffnet daran einen **Thread** mit der Roll-Liste.
   Alle Ausgewählten werden im Thread angepingt. Bei einer Rolle wird jedes Mitglied einzeln angepingt.
4. **Die Spieler haben die gewählte Rollzeit**, Standard 24 Stunden. In der Zeit wählen sie, **wofür** sie rollen, und würfeln 1–100:
   ⭐ BiS-Item · ✨ Potential · 💧 Watermark Upgrade · 🧬 Vererbung · ⚔️ PvP · 🔄 Offspec · 📜 Lithografie · 💰 Verkauf.
   Das ist die Prio-Reihenfolge: In dieser Reihenfolge werden die Würfe in der Roll-Liste gruppiert (`PURPOSES` in `src/session.js`).
   Oder sie klicken **🚫 Passen**, auch noch nachdem sie gewürfelt haben. Ihr Wurf zählt dann nicht mehr und steht durchgestrichen bei „Gepasst“.
   Erneut würfeln geht nur, wenn ein Verwalter die Entscheidung zurücksetzt. Nur ausgewählte Spieler können würfeln.
5. **Roll-Liste:** Die Würfe sind nach Grund gruppiert (BiS zuerst) und darin nach Höhe sortiert.
   Die Liste steht im Thread und im Leader-Panel.
6. **Ende der Rollzeit:** nach 24 Stunden oder früher per **⏹️ Rollen jetzt beenden**.
   Der Bot **sperrt und archiviert den Thread**, damit die Kanalliste aufgeräumt bleibt, und pingt die Verwalter im Leader-Kanal an.
   Die Item-Nachricht im Loot-Kanal **schrumpft auf eine kleine Karte** mit Vorschaubild. Nach der Vergabe steht dort der Gewinner.
   Für die Gewinner-Nachricht öffnet er den Thread kurz und schließt ihn danach wieder.
7. **Leader-Panel** im Leader-Kanal, nur für die Verwalter dieser Verlosung:
   - 👑 **Gewinner auswählen**: Der Bot verkündet ihn im Thread und vermerkt ihn an der Item-Nachricht.
   - ➕ **Spieler oder Rollen hinzufügen** (während der Rollzeit).
   - 👤 **Spieler verwalten**: Spieler per Suche auswählen, dann
     - ↩️ **Entscheidung zurücksetzen**, z. B. nach einem Fehlklick (während der Rollzeit), oder
     - ➖ **Aus Verlosung entfernen**. Der Wurf fällt weg, und der Spieler kann nicht mehr würfeln. Das geht auch nach der Rollzeit, solange kein Gewinner feststeht.
   - ⏰ **Rollzeit ändern**, gerechnet ab jetzt, z. B. „endet in 6 Stunden“.
   - ⏹️ **Rollen jetzt beenden** und **Ohne Gewinner schließen**.
8. **Aufräumen:** Nach der Vergabe, oder wenn ohne Gewinner geschlossen wird, löscht der Bot im Leader-Kanal den Item-Post, das Panel und die Hinweise.
   Stattdessen postet er eine **kompakte Ergebnis-Karte** mit kleinem Item-Bild, Gewinner, Wurf, Grund und Link zum Thread.

## Rechte

| Wer | Darf |
| --- | --- |
| **Bot-Admins**: Server-Besitzer, Administratoren und `BOT_ADMIN_IDS` | Leader festlegen (`/leader`), Kanäle einrichten (`/einrichten`), alles, was Leader und Verwalter dürfen |
| **Loot-Leader**: per `/leader hinzufügen` festgelegte Spieler oder Rollen | Items posten, auswählen, wer rollt und wer verwaltet |
| **Verwalter einer Verlosung**: der Ersteller plus die beim Posten gewählten Leader oder Leader-Rollen | Das Panel dieser Verlosung bedienen |
| **Ausgewählte Spieler** | Würfeln oder passen |

### Befehle

- `/leader hinzufügen wer:@Name` oder `wer:@Rolle`: macht einen Spieler oder eine Rolle zum Loot-Leader.
- `/leader entfernen wer:@Name`: entzieht die Leader-Rechte.
- `/leader liste`: zeigt alle Loot-Leader.
- `/einrichten leaderkanal:#loot-leitung lootkanal:#loot rollzeit:24`: legt die Kanäle und die Standard-Rollzeit in Stunden fest. Jede Angabe ist optional. Ohne Angaben zeigt der Befehl die aktuelle Einstellung.
- `/loot offen`: zeigt allen Leadern die laufenden Verlosungen mit Link zu Thread und Panel.
- `/hilfe`: gibt eine kurze Übersicht über Ablauf und Befehle.

Die Befehle registriert der Bot beim Start automatisch auf jedem Server.

## Einrichtung

Voraussetzung: Node.js 22 oder neuer.

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application **„Loot and Liberty“** mit Bot anlegen.
2. Unter **Bot → Privileged Gateway Intents** aktivieren:
   - **Server Members Intent**: um alle Mitglieder einer Rolle zu finden.
   - **Message Content Intent**: um Screenshots, Links und @Erwähnungen im Leader-Kanal zu lesen.
3. Den Bot mit den Scopes `bot` und `applications.commands` einladen. Dieser Link enthält alle nötigen Rechte (`DEINE_APP_ID` ersetzen):
   `https://discord.com/oauth2/authorize?client_id=DEINE_APP_ID&scope=bot+applications.commands&permissions=326417640512`
4. Zwei Kanäle anlegen: `#loot-leitung` (nur Leader) und `#loot` (alle). Der Bot braucht diese Rechte:
   - **`#loot-leitung`**: Kanal ansehen, Nachrichten senden, Links einbetten, Dateien anhängen, Nachrichtenverlauf lesen, Reaktionen hinzufügen, **Nachrichten verwalten** (zum Aufräumen nach der Vergabe).
   - **`#loot`**: Kanal ansehen, Nachrichten senden, Dateien anhängen, Links einbetten, Öffentliche Threads erstellen, Nachrichten in Threads senden, **Threads verwalten** (zum Schließen der Threads).
5. Starten:
   ```bash
   cp .env.example .env   # DISCORD_TOKEN eintragen
   npm install
   npm start
   ```
6. Im Discord als Admin: `/einrichten leaderkanal:#loot-leitung lootkanal:#loot`, danach `/leader hinzufügen wer:@Leader`.

### Konfiguration (`.env`)

| Variable | Bedeutung |
| --- | --- |
| `DISCORD_TOKEN` | Bot-Token |
| `LOOT_LEADER_CHANNEL_ID`, `LOOT_CHANNEL_ID` | Optional: Vorgabe für die Kanäle. `/einrichten` hat Vorrang |
| `BOT_ADMIN_IDS` | Optional: zusätzliche Bot-Admins (Nutzer-IDs, kommagetrennt) |
| `LOOT_ROLL_HOURS` | Optional: Vorgabe für die Rollzeit in Stunden, Standard 24. `/einrichten rollzeit:` hat Vorrang |
| `BOT_NAME` | Optional, Standard `Loot and Liberty` |
| `DATA_FILE` | Optional, Standard `data/sessions.json`. Hier liegen offene Verlosungen, Leader und Kanal-Einstellungen |

## Entwicklung

```bash
npm test
```

| Datei | Inhalt |
| --- | --- |
| `src/session.js` | Verlosungslogik: Würfeln, Passen, Roll-Gründe, Gewinner (ohne Discord-Abhängigkeit) |
| `src/item.js` | Screenshot/Questlog-Link erkennen, Name über Questlogs Daten-Schnittstelle |
| `src/itemcard.js` | Item-Karte (PNG) mit Stats aus Questlog-Daten zeichnen |
| `src/render.js` | Embeds, Auswahlmenüs, Buttons |
| `src/bot.js` | Discord-Ablauf: Leader-Kanal, Auswahl, Item-Post + Thread, Rollzeit, Panel, Befehle |
| `src/commands.js` | Slash-Commands `/leader`, `/einrichten`, `/loot`, `/hilfe` |
| `src/store.js` | Speichern von Verlosungen, Leadern und Kanälen als JSON |
| `src/index.js` | Start, Intents, Konfiguration |

## Bekannte Grenzen und Ideen

- Die Frage „Wer darf rollen?“ läuft nach 30 Minuten ab und überlebt keinen Neustart. Laufende Verlosungen samt Rollzeit bleiben erhalten.
- Gewinner- und Zurücksetzen-Menü zeigen höchstens 25 Einträge (Discord-Limit).
- Geplant: mehrere Würfe pro Spieler und ein anderer Zahlenbereich. `LootSession` hat dafür schon `rollMax`.
