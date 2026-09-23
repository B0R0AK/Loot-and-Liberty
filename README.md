# Loot and Liberty

Discord-Bot, der das Verteilen von Loot in **Throne and Liberty** einfacher macht.

## Ablauf

1. **Item posten:** Im Loot-Kanal postet jemand einen **Screenshot** oder einen **Questlog-Link** des Items.
   Optional mit Text als Item-Name.
2. **Bot fragt: „Wer darf rollen?“** Der Ersteller wählt Spieler oder Rollen aus einer **Liste** aus.
   Alternativ schreibt er sie als `@Name` / `@Rolle` in den Kanal, direkt im Item-Post oder als Nachtrag.
   Danach klickt er auf **🧵 Thread erstellen**.
3. **Thread:** Der Bot erstellt am Item-Post einen Thread, zeigt dort das Item und pingt alle berechtigten Spieler an.
   Bei einer Rolle wird jedes Mitglied einzeln angepingt.
4. **Rollen oder passen:** Jeder Spieler wählt, **wofür** er rollt, und würfelt damit 1–100:
   - ⭐ BiS-Item
   - 💧 Watermark Upgrade
   - 📜 Lithografie
   - 💰 Verkauf
   - ✨ Potential

   Oder er klickt **🚫 Passen**. Jeder hat genau eine Entscheidung.
5. **Roll-Liste:** Alle Würfe stehen in einer Liste, gruppiert nach Grund (BiS zuerst) und darin nach Höhe sortiert.
   Dazu sieht man, wer gepasst hat und wer noch offen ist.
   Haben alle entschieden, pingt der Bot den Ersteller an.
6. **Gewinner:** Der Ersteller wählt den Gewinner aus der Liste der Spieler, die gewürfelt haben.
   Der Bot verkündet ihn im Thread und vermerkt ihn im Loot-Kanal.
   Alternativ: **Ohne Gewinner schließen**.

Den Gewinner auswählen oder die Verlosung schließen dürfen der Ersteller und Moderatoren mit der Berechtigung *Nachrichten verwalten*.

## Einrichtung

Voraussetzung: Node.js 22 oder neuer.

1. Im [Discord Developer Portal](https://discord.com/developers/applications) eine Application **„Loot and Liberty“** mit Bot anlegen.
2. Unter **Bot → Privileged Gateway Intents** aktivieren:
   - **Server Members Intent**: um alle Mitglieder einer Rolle zu finden.
   - **Message Content Intent**: um Screenshots, Links und @Erwähnungen im Loot-Kanal zu lesen.
3. Den Bot mit dem Scope `bot` einladen. Er braucht diese Rechte im Loot-Kanal:
   *Kanal ansehen*, *Nachrichten senden*, *Links einbetten*, *Nachrichtenverlauf lesen*, *Reaktionen hinzufügen*,
   *Öffentliche Threads erstellen*, *Nachrichten in Threads senden*.
4. Einen Kanal für Loot anlegen (z. B. `#loot`) und seine ID kopieren (Entwicklermodus → Rechtsklick → *Kanal-ID kopieren*).
5. Konfigurieren und starten:
   ```bash
   cp .env.example .env   # DISCORD_TOKEN und LOOT_CHANNEL_IDS eintragen
   npm install
   npm start
   ```

### Konfiguration (`.env`)

| Variable | Bedeutung |
| --- | --- |
| `DISCORD_TOKEN` | Bot-Token |
| `LOOT_CHANNEL_IDS` | ID(s) der Loot-Kanäle, kommagetrennt |
| `LOOT_LEADER_ROLE_IDS` | Optional: nur diese Rollen (und Admins) dürfen Loot posten. Leer = jeder im Kanal |
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

- Die Frage „Wer darf rollen?“ läuft nach 30 Minuten ab und überlebt keinen Neustart. Laufende Verlosungen im Thread bleiben erhalten.
- Das Gewinner-Menü zeigt höchstens 25 Würfe (Discord-Limit), und zwar die obersten der Liste.
- Geplant: mehrere Würfe pro Spieler und ein anderer Zahlenbereich. `LootSession` hat dafür schon `rollMax`.
