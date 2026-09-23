# Loot and Liberty

Discord-Bot, der das Verteilen von Loot in **Throne and Liberty** einfacher macht.

## Ablauf

Es gibt zwei Kanäle: den **Loot-Kanal** (z. B. `#loot`, für alle) und den **Leader-Kanal** (z. B. `#loot-leitung`, nur für Leader).

1. **Item posten:** Im Loot-Kanal postet jemand einen **Screenshot** oder einen **Questlog-Link** des Items.
   Optional mit Text als Item-Name. Der Bot markiert den Post mit ⏳.
2. **„Wer darf rollen?“ im Leader-Kanal:** Dort erscheint ein Panel. Der Ersteller wählt Spieler oder Rollen aus der **Liste**
   oder schreibt sie als `@Name` / `@Rolle` in den Leader-Kanal.
   `@Erwähnungen` im Item-Post werden direkt übernommen. Danach klickt er auf **🧵 Thread erstellen**.
3. **Thread für die Spieler:** Der Bot erstellt am Item-Post einen Thread mit der Roll-Liste und pingt alle Ausgewählten an.
   Bei einer Rolle wird jedes Mitglied einzeln angepingt. Die Spieler sehen dort nur **Würfeln** und **Passen**.
4. **Rollen oder passen:** Nur ausgewählte Spieler wählen, **wofür** sie rollen, und würfeln damit 1–100:
   ⭐ BiS-Item · 💧 Watermark Upgrade · 📜 Lithografie · 💰 Verkauf · ✨ Potential.
   Oder sie klicken **🚫 Passen**.
5. **Roll-Liste:** Die Würfe sind nach Grund gruppiert (BiS zuerst) und darin nach Höhe sortiert.
   Die Liste steht im Thread und im Leader-Panel. Haben alle entschieden, pingt der Bot den Ersteller im Leader-Kanal an.
6. **Leader-Panel** im Leader-Kanal:
   - 👑 **Gewinner auswählen**: Der Bot verkündet den Gewinner im Thread und markiert den Item-Post mit 🏆.
   - ➕ **Spieler oder Rollen hinzufügen**: Die Neuen werden im Thread angepingt.
   - ↩️ **Entscheidung zurücksetzen**, z. B. nach einem Fehlklick. Der Spieler wird angepingt und kann neu wählen.
   - **Ohne Gewinner schließen**.

Das Panel bedienen darf **nur der Ersteller** und wer explizit in `LOOT_MANAGER_IDS` eingetragen ist.

## Einrichtung

Voraussetzung: Node.js 22 oder neuer.

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application **„Loot and Liberty“** mit Bot anlegen.
2. Unter **Bot → Privileged Gateway Intents** aktivieren:
   - **Server Members Intent**: um alle Mitglieder einer Rolle zu finden.
   - **Message Content Intent**: um Screenshots, Links und @Erwähnungen im Loot-Kanal zu lesen.
3. Den Bot mit dem Scope `bot` einladen. Er braucht diese Rechte im Loot-Kanal:
   *Kanal ansehen*, *Nachrichten senden*, *Links einbetten*, *Nachrichtenverlauf lesen*, *Reaktionen hinzufügen*,
   *Öffentliche Threads erstellen*, *Nachrichten in Threads senden*.
4. Zwei Kanäle anlegen: `#loot` für alle und `#loot-leitung`, den nur Leader sehen. Beide IDs kopieren (Entwicklermodus → Rechtsklick → *Kanal-ID kopieren*).
   Der Bot braucht in `#loot-leitung` *Kanal ansehen*, *Nachrichten senden*, *Links einbetten* und *Reaktionen hinzufügen*.
5. Konfigurieren und starten:
   ```bash
   cp .env.example .env   # DISCORD_TOKEN, LOOT_CHANNEL_IDS und LOOT_LEADER_CHANNEL_ID eintragen
   npm install
   npm start
   ```

### Konfiguration (`.env`)

| Variable | Bedeutung |
| --- | --- |
| `DISCORD_TOKEN` | Bot-Token |
| `LOOT_CHANNEL_IDS` | ID(s) der Loot-Kanäle, kommagetrennt |
| `LOOT_LEADER_CHANNEL_ID` | ID des Leader-Kanals. Hier erscheinen „Wer darf rollen?“ und das Panel. Leer = im Loot-Kanal |
| `LOOT_LEADER_ROLE_IDS` | Optional: nur diese Rollen (und Admins) dürfen Loot posten. Leer = jeder im Kanal |
| `LOOT_MANAGER_IDS` | Optional: Nutzer- und/oder Rollen-IDs, die bei jeder Verlosung den Gewinner wählen oder schließen dürfen. Leer = nur der Ersteller |
| `BOT_NAME` | Optional, Standard `Loot and Liberty` |
| `DATA_FILE` | Optional, Standard `data/sessions.json`. Hier werden offene Verlosungen gespeichert, damit sie einen Neustart überleben |

## Entwicklung

```bash
npm test
```

| Datei | Inhalt |
| --- | --- |
| `src/session.js` | Verlosungslogik: Würfeln, Passen, Roll-Gründe, Gewinner (ohne Discord-Abhängigkeit) |
| `src/item.js` | Screenshot/Questlog-Link erkennen, Link-Vorschau |
| `src/render.js` | Embeds, Auswahlmenüs, Buttons |
| `src/bot.js` | Discord-Ablauf: Kanal beobachten, Auswahl, Thread, Interaktionen |
| `src/store.js` | Speichern offener Verlosungen als JSON |
| `src/index.js` | Start, Intents, Konfiguration |

## Bekannte Grenzen und Ideen

- Die Frage „Wer darf rollen?“ läuft nach 30 Minuten ab und überlebt keinen Neustart. Laufende Verlosungen bleiben erhalten.
- Gewinner- und Zurücksetzen-Menü zeigen höchstens 25 Einträge (Discord-Limit).
- Geplant: mehrere Würfe pro Spieler und ein anderer Zahlenbereich. `LootSession` hat dafür schon `rollMax`.
